// Suppress the DEP0169 warning from localtunnel using url.parse()
// TODO: Remove when localtunnel migrates to WHATWG URL API
const originalEmitWarning = (process as any).emitWarning;
(process as any).emitWarning = function (warning: any, type?: any, code?: any, ctor?: any) {
  if (typeof warning === 'string' && warning.includes('url.parse()')) {
    return;
  }
  if (warning instanceof Error && warning.message?.includes('url.parse()')) {
    return;
  }
  return originalEmitWarning.call(process, warning, type, code, ctor);
};

import localtunnel from 'localtunnel';

// Restore original emitWarning
(process as any).emitWarning = originalEmitWarning;

import {
  normalizeLocalAiSettings,
  type LocalAiSettings,
} from '@/lib/ai/local-settings';

function isLocalhostLikeUrl(url: string) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

export async function resolveModelSettingsForRuntime(raw?: Partial<LocalAiSettings> | null): Promise<LocalAiSettings> {
  const settings = normalizeLocalAiSettings(raw);

  const envPublicBaseUrl = (
    process.env.NEXT_PUBLIC_LOCAL_AI_PUBLIC_BASE_URL ||
    process.env.LOCAL_AI_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_AI_PUBLIC_BASE_URL ||
    process.env.AI_PUBLIC_BASE_URL ||
    ''
  ).trim();

  if (envPublicBaseUrl) {
    return {
      ...settings,
      baseURL: envPublicBaseUrl,
    };
  }

  if (!isLocalhostLikeUrl(settings.baseURL)) {
    return settings;
  }

  // User provided a localhost URL, automatically create a public tunnel for it
  // This works the same way everywhere - converts localhost to a public URL
  // for use in API routes, Trigger.dev background tasks, and workflows
  try {
    const parsed = new URL(settings.baseURL);
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'));
    const pathname = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';

    // Create tunnel with timeout to prevent indefinite hanging
    const tunnelPromise = localtunnel({
      port,
      host: process.env.LOCALTUNNEL_HOST || 'https://loca.lt',
      subdomain: process.env.LOCALTUNNEL_SUBDOMAIN || undefined,
      local_host: '127.0.0.1',
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Tunnel connection timeout. Make sure your local LLM server is running on the specified port.')), 30000)
    );

    const tunnel = await Promise.race([tunnelPromise, timeoutPromise]);

    const publicUrl = new URL(tunnel.url);
    if (pathname) {
      publicUrl.pathname = pathname;
    }

    return {
      ...settings,
      baseURL: publicUrl.toString().replace(/\/$/, ''),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(
      `Failed to create tunnel for local LLM: ${errorMessage}`
    );
  }
}
