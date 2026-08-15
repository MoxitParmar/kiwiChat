'use client';

import { useEffect, useState } from 'react';
import { getRuntimeLocalAiSettings, type LocalAiSettings } from '@/lib/ai/local-settings';
import { isLocalhostLikeUrl } from '@/lib/ai/tunnel';

export function useResolvedAiSettings() {
  const [settings, setSettings] = useState<LocalAiSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function resolve() {
      try {
        setIsLoading(true);
        const rawSettings = getRuntimeLocalAiSettings();
        
        if (!isLocalhostLikeUrl(rawSettings.baseURL)) {
          // Non-localhost, use as-is
          setSettings(rawSettings);
          setError(null);
          return;
        }

        // Localhost detected, get tunnel URL from API
        const parsed = new URL(rawSettings.baseURL);
        const port = Number(parsed.port || 11434);
        const pathname = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';

        const response = await fetch(`/api/ai/tunnel-config?port=${port}`);
        
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to create tunnel');
        }

        const { url } = await response.json();
        const finalUrl = new URL(url);
        if (pathname) {
          finalUrl.pathname = pathname;
        }

        setSettings({
          ...rawSettings,
          baseURL: finalUrl.toString().replace(/\/$/, ''),
        });
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        setSettings(null);
      } finally {
        setIsLoading(false);
      }
    }

    resolve();
    // Refresh every 60 seconds in case tunnel URL changes
    const interval = setInterval(resolve, 60000);
    return () => clearInterval(interval);
  }, []);

  return { settings, error, isLoading };
}
