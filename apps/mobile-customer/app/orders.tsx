import { Link } from 'expo-router';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { client } from '@/api';
import { useCached } from '@/data';
import { inr } from '@/format';
import { C } from '@/theme';
import type { OrderSummary, Page } from '@/types';
import { Muted, StatusBadge } from '@/ui';

export default function Orders() {
  const { data, loading, refresh } = useCached<Page<OrderSummary>>('orders', () => client.account.orders<Page<OrderSummary>>());
  return (
    <FlatList
      data={data?.items ?? []}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={refresh} />}
      ListEmptyComponent={!loading ? <Muted>No orders yet.</Muted> : null}
      renderItem={({ item: o }) => (
        <Link href={`/order/${o.number}`} asChild>
          <Pressable style={{ borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, padding: 14, gap: 4 }} accessibilityRole="link">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700', color: C.ink }}>{o.number}</Text>
              <StatusBadge status={o.status} />
            </View>
            <Text style={{ color: C.ink }} numberOfLines={1}>{o.items.map((i) => i.name).join(', ')}</Text>
            <Muted>{new Date(o.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {inr(o.totalPaise)}</Muted>
          </Pressable>
        </Link>
      )}
    />
  );
}
