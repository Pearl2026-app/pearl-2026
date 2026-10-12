import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { QueuedStep } from './queue';
import { queue } from './device-queue';
import { C } from './theme';
import { Banner } from './ui';

const LABEL: Record<string, string> = { 'picked-up': 'Picked up', 'out-for-delivery': 'Out for delivery', delivered: 'Delivered', failed: 'Could not deliver', returned: 'Returned' };

/** Shows steps saved on the phone, sends them when the signal returns, and lets the rider drop a refused one. */
export function OfflineBanner({ onSent }: { onSent?: () => void }) {
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState<QueuedStep[]>([]);
  const sync = useCallback(async () => {
    const sent = await queue.flush().catch(() => 0);
    setWaiting(await queue.list());
    if (sent > 0) onSent?.();
  }, [onSent]);

  useEffect(
    () =>
      NetInfo.addEventListener((st) => {
        const on = st.isConnected !== false && st.isInternetReachable !== false;
        setOnline(on);
        if (on) void sync();
      }),
    [sync],
  );
  useFocusEffect(
    useCallback(() => {
      void sync();
      const t = setInterval(sync, 30_000);
      return () => clearInterval(t);
    }, [sync]),
  );

  if (online && waiting.length === 0) return null;
  return (
    <View style={{ marginBottom: 8 }}>
      {!online && <Banner tone="warning">You are offline. Updates are saved on this phone and sent when the signal returns.</Banner>}
      {waiting.map((q) => (
        <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, padding: 10, marginBottom: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.ink }}>{LABEL[q.action] ?? q.action} · waiting to send</Text>
            {q.error ? <Text style={{ color: C.danger }}>Not accepted: {q.error}</Text> : null}
          </View>
          {q.error ? (
            <Pressable accessibilityRole="button" onPress={async () => { await queue.discard(q.id); setWaiting(await queue.list()); }} style={{ padding: 8 }}>
              <Text style={{ color: C.accent }}>Dismiss</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}
