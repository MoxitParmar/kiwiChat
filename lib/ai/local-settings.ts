export type LocalAiSettings = {
  baseURL: string;
  apiKey: string;
  model: string;
};

export const LOCAL_AI_SETTINGS_KEY = 'kiwi-chat.local-ai-settings';

export const DEFAULT_LOCAL_AI_SETTINGS: LocalAiSettings = {
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',
  model: 'llama3.1',
};

export function isLocalhostLikeUrl(url: string) {
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

export function normalizeLocalAiSettings(raw?: Partial<LocalAiSettings> | null): LocalAiSettings {
  const next = {
    ...DEFAULT_LOCAL_AI_SETTINGS,
    ...(raw ?? {}),
  };

  return {
    baseURL: (next.baseURL ?? '').trim() || DEFAULT_LOCAL_AI_SETTINGS.baseURL,
    apiKey: (next.apiKey ?? '').trim() || DEFAULT_LOCAL_AI_SETTINGS.apiKey,
    model: (next.model ?? '').trim() || DEFAULT_LOCAL_AI_SETTINGS.model,
  };
}

export function resolveRuntimeAiSettings(raw?: Partial<LocalAiSettings> | null): LocalAiSettings {
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

  if (isLocalhostLikeUrl(settings.baseURL)) {
    return settings;
  }

  return settings;
}

export function getRuntimeLocalAiSettings(): LocalAiSettings {
  return resolveRuntimeAiSettings(getStoredLocalAiSettings());
}

export function getStoredLocalAiSettings(): LocalAiSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCAL_AI_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_AI_SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_LOCAL_AI_SETTINGS;
    }

    return normalizeLocalAiSettings(JSON.parse(raw) as Partial<LocalAiSettings>);
  } catch {
    return DEFAULT_LOCAL_AI_SETTINGS;
  }
}

export function setStoredLocalAiSettings(settings: LocalAiSettings) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = normalizeLocalAiSettings(settings);
  window.localStorage.setItem(LOCAL_AI_SETTINGS_KEY, JSON.stringify(normalized));
}
