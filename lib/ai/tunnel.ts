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

export { isLocalhostLikeUrl };

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

  if (typeof window === 'undefined' && process.env.VERCEL) {
    throw new Error(
      'Localhost AI URLs cannot be used from a deployed Vercel server. Resolve the URL in the browser or set LOCAL_AI_PUBLIC_BASE_URL to a public OpenAI-compatible endpoint.'
    );
  }

  // Local development only: resolve from the local machine that can reach localhost.
  if (typeof window === 'undefined') {
    try {
      const parsed = new URL(settings.baseURL);
      const port = Number(parsed.port || 11434);
      const pathname = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
      const tunnelBase = `http://127.0.0.1:${process.env.PORT || 3000}/api/ai/tunnel-config?port=${port}`;

      const response = await fetch(tunnelBase, {
        method: 'GET',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to get tunnel configuration');
      }

      const { url } = await response.json();
      const publicUrl = new URL(url);
      if (pathname) {
        publicUrl.pathname = pathname;
      }

      return {
        ...settings,
        baseURL: publicUrl.toString().replace(/\/$/, ''),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(msg);
    }
  }

  // Client side - return as-is; the browser resolves localhost before the request is sent.
  return settings;
}
