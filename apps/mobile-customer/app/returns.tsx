import { FlatList, Text, View } from 'react-native';
import { client } from '@/api';
import { useCached } from '@/data';
import { C } from '@/theme';
import { Muted } from '@/ui';

interface ReturnRow { id: string; type: string; status: string; reason: string; createdAt: string; order: { number: string } }

export default function Returns() {
  const { data, loading } = useCached<ReturnRow[]>('returns', () => client.account.returns<ReturnRow[]>());
  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      ListHeaderComponent={<Muted>To return or cancel, open the order from My orders. Requests appear here with their status.</Muted>}
      ListEmptyComponent={!loading ? <Muted>No return or cancellation requests.</Muted> : null}
      renderItem={({ item: r }) => (
        <View style={{ borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, padding: 12, gap: 2 }}>
          <Text style={{ fontWeight: '600', color: C.ink }}>{r.type === 'RETURN' ? 'Return' : 'Cancellation'} · {r.order.number}</Text>
          <Muted>{r.reason}</Muted>
          <Muted>{r.status.replace(/_/g, ' ').toLowerCase()} · {new Date(r.createdAt).toLocaleDateString('en-IN')}</Muted>
        </View>
      )}
    />
  );
}
