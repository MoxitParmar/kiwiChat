'use client';

import { useEffect, useState } from 'react';
import { getRuntimeLocalAiSettings, type LocalAiSettings } from '@/lib/ai/local-settings';

export function useResolvedAiSettings() {
  const [settings, setSettings] = useState<LocalAiSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      setIsLoading(true);
      const rawSettings = getRuntimeLocalAiSettings();
      setSettings(rawSettings);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setSettings(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { settings, error, isLoading };
}
