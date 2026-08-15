import {
  normalizeLocalAiSettings,
  type LocalAiSettings,
} from '@/lib/ai/local-settings';

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

  return settings;
}
