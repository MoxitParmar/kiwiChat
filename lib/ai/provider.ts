import { createOpenAI } from '@ai-sdk/openai';
import {
  DEFAULT_LOCAL_AI_SETTINGS,
  normalizeLocalAiSettings,
  type LocalAiSettings,
} from '@/lib/ai/local-settings';
import { resolveModelSettingsForRuntime } from '@/lib/ai/tunnel';

export const LOCAL_OPENAI_BASE_URL = DEFAULT_LOCAL_AI_SETTINGS.baseURL;
export const LOCAL_OPENAI_API_KEY = DEFAULT_LOCAL_AI_SETTINGS.apiKey;
export const LOCAL_LLM_MODEL = DEFAULT_LOCAL_AI_SETTINGS.model;

export async function getResolvedLocalModelSettings(settings?: Partial<LocalAiSettings>) {
  return resolveModelSettingsForRuntime(settings ?? normalizeLocalAiSettings());
}

export async function getLocalModel(settings?: Partial<LocalAiSettings>) {
  const resolved = await getResolvedLocalModelSettings(settings);

  const localOpenAI = createOpenAI({
    baseURL: resolved.baseURL,
    apiKey: resolved.apiKey,
    name: 'local-openai',
  });

  return localOpenAI.chat(resolved.model);
}
