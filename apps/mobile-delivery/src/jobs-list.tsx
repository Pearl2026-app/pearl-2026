import { Link } from 'expo-router';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { client } from '@/api';
import { useCached } from '@/data';
import { inr } from '@/format';
import { OfflineBanner } from '@/offline';
import { C } from '@/theme';
import { addressLine, type JobList } from '@/types';
import { Banner, Muted, StatusBadge } from '@/ui';

export function JobsList({ view }: { view: 'active' | 'done' }) {
  const { data, stale, error, loading, refresh } = useCached<JobList>(`jobs:${view}`, () => client.delivery.jobs<JobList>(view));
  return (
    <FlatList
      contentContainerStyle={{ padding: 16, gap: 10 }}
      data={data?.items ?? []}
      keyExtractor={(j) => j.id}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={refresh} />}
      ListHeaderComponent={
        <View>
          <OfflineBanner onSent={refresh} />
          {stale && <Banner tone="info">Showing the last list saved on this phone. Pull down to refresh.</Banner>}
          {error && <Banner tone="danger">{error}</Banner>}
          {view === 'active' && data && data.cashInHand.amountPaise > 0 && (
            <View style={{ backgroundColor: C.muted, padding: 12, marginBottom: 6 }}>
              <Text style={{ color: C.ink }}>
                Cash to hand over at the office: <Text style={{ fontWeight: '700' }}>{inr(data.cashInHand.amountPaise)}</Text> ({data.cashInHand.count} order{data.cashInHand.count === 1 ? '' : 's'})
              </Text>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={!loading ? <Muted>{view === 'active' ? 'No deliveries right now. New assignments appear here.' : 'Nothing completed yet.'}</Muted> : null}
      renderItem={({ item: j }) => (
        <Link href={`/job/${j.id}`} asChild>
          <Pressable accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: pressed ? C.muted : C.surface, borderWidth: 1, borderColor: C.line, padding: 14, gap: 4 })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontWeight: '700', fontSize: 16, color: C.ink }}>{j.number}</Text>
              <StatusBadge status={j.status} />
            </View>
            <Text style={{ color: C.ink }}>{j.contactName} · {j.addressSnapshot.area || j.addressSnapshot.cityName}</Text>
            <Text style={{ color: C.sub, fontSize: 13 }} numberOfLines={2}>{addressLine(j.addressSnapshot)}</Text>
            {j.codDuePaise > 0 && <Text style={{ color: C.warning, fontWeight: '700' }}>Collect cash {inr(j.codDuePaise)}</Text>}
          </Pressable>
        </Link>
      )}
    />
  );
}
