import { createOpenAI } from '@ai-sdk/openai';
import {
  DEFAULT_LOCAL_AI_SETTINGS,
  normalizeLocalAiSettings,
  type LocalAiSettings,
} from '@/lib/ai/local-settings';

export const LOCAL_OPENAI_BASE_URL = DEFAULT_LOCAL_AI_SETTINGS.baseURL;
export const LOCAL_OPENAI_API_KEY = DEFAULT_LOCAL_AI_SETTINGS.apiKey;
export const LOCAL_LLM_MODEL = DEFAULT_LOCAL_AI_SETTINGS.model;

export function getLocalModel(settings?: Partial<LocalAiSettings>) {
  const resolved = normalizeLocalAiSettings(settings);

  const localOpenAI = createOpenAI({
    baseURL: resolved.baseURL,
    apiKey: resolved.apiKey,
    name: 'local-openai',
  });

  return localOpenAI.chat(resolved.model);
}
