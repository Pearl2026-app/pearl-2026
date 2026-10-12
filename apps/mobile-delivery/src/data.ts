import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { errorText, isNetworkError } from '@sahyadri/api-client';

/**
 * Loads on focus and on pull-to-refresh. The last good answer is kept on the phone, so a rider who
 * loses signal still sees their deliveries (marked as possibly out of date).
 */
export function useCached<T>(key: string, load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loader = useRef(load);
  loader.current = load;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await loader.current();
      setData(fresh);
      setStale(false);
      setError(null);
      void AsyncStorage.setItem(`cache:${key}`, JSON.stringify(fresh));
    } catch (e) {
      const saved = await AsyncStorage.getItem(`cache:${key}`).catch(() => null);
      if (saved) {
        setData((d) => d ?? (JSON.parse(saved) as T));
        setStale(true);
      }
      setError(isNetworkError(e) ? null : errorText(e));
      if (isNetworkError(e)) setStale(true);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  return { data, stale, error, loading, refresh };
}
