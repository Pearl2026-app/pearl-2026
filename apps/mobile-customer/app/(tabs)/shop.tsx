import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorText } from '@sahyadri/api-client';
import { client } from '@/api';
import { activeCount, PRICE_BANDS, SORTS, toggle, toQuery, type ShopFilters } from '@/filters';
import { useSite } from '@/site';
import { C } from '@/theme';
import type { Filters, Page, ProductCard } from '@/types';
import { Banner, Button, Chip, Muted, ProductTile } from '@/ui';

export default function Shop() {
  const params = useLocalSearchParams<{ category?: string; collection?: string; q?: string }>();
  const site = useSite();
  const [f, setF] = useState<ShopFilters>({ category: params.category, collection: params.collection, q: params.q, sort: 'featured' });
  const [items, setItems] = useState<ProductCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<Filters | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ShopFilters>(f);
  const seq = useRef(0);

  // Links into Shop (home collections, notifications) replace the filters.
  useEffect(() => {
    if (params.category || params.collection || params.q) setF((x) => ({ ...x, category: params.category, collection: params.collection, q: params.q }));
  }, [params.category, params.collection, params.q]);

  const load = useCallback(async (p: number, filters: ShopFilters) => {
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const r = await client.shop.products<Page<ProductCard>>(toQuery(filters, p));
      if (n !== seq.current) return;
      setItems((cur) => (p === 1 ? r.items : [...cur, ...r.items]));
      setTotal(r.total);
      setPage(p);
    } catch (e) {
      if (n === seq.current) setError(errorText(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1, f);
    client.shop.filters<Filters>({ category: f.category, collection: f.collection }).then(setFacets).catch(() => undefined);
  }, [f, load]);

  const n = activeCount(f) - (f.category ? 1 : 0);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 12, paddingBottom: 4, gap: 8 }}>
        <TextInput
          placeholder="Search by name or SKU"
          defaultValue={f.q}
          returnKeyType="search"
          onSubmitEditing={(e) => setF((x) => ({ ...x, q: e.nativeEvent.text }))}
          style={{ minHeight: 46, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, paddingHorizontal: 12, fontSize: 16 }}
          accessibilityLabel="Search"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip label="All" on={!f.category} onPress={() => setF((x) => ({ ...x, category: undefined }))} />
          {(site?.categories ?? []).map((c) => (
            <Chip key={c.slug} label={c.name} on={f.category === c.slug} onPress={() => setF((x) => ({ ...x, category: x.category === c.slug ? undefined : c.slug }))} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Muted>{loading && page === 1 ? 'Loading…' : `${total} piece${total === 1 ? '' : 's'}`}</Muted>
          <Pressable onPress={() => { setDraft(f); setOpen(true); }} accessibilityRole="button" style={{ padding: 8 }}>
            <Text style={{ color: C.accent, fontSize: 15 }}>Filter & sort{n ? ` (${n})` : ''}</Text>
          </Pressable>
        </View>
      </View>
      {error && <View style={{ paddingHorizontal: 12 }}><Banner tone="danger">{error}</Banner></View>}
      <FlatList
        data={items}
        numColumns={2}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 24 }}
        renderItem={({ item }) => <ProductTile p={item} />}
        onEndReachedThreshold={0.6}
        onEndReached={() => !loading && items.length < total && load(page + 1, f)}
        ListFooterComponent={loading && page > 1 ? <ActivityIndicator style={{ margin: 16 }} color={C.accent} /> : null}
        ListEmptyComponent={!loading ? <View style={{ padding: 16 }}><Muted>Nothing matches these filters.</Muted></View> : null}
      />

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
            <Text style={{ fontFamily: 'serif', fontSize: 28, color: C.ink }}>Filter & sort</Text>
            <Section title="Sort">{SORTS.map((s) => <Chip key={s.key} label={s.label} on={(draft.sort ?? 'newest') === s.key} onPress={() => setDraft((d) => ({ ...d, sort: s.key }))} />)}</Section>
            <Section title="Price">{PRICE_BANDS.map((b) => <Chip key={b.key} label={b.label} on={draft.band === b.key} onPress={() => setDraft((d) => ({ ...d, band: d.band === b.key ? undefined : b.key }))} />)}</Section>
            {!!facets?.colours.length && <Section title="Pearl colour">{facets.colours.map((c) => <Chip key={c.value} label={`${c.value} (${c.count})`} on={draft.colour?.includes(c.value)} onPress={() => setDraft((d) => ({ ...d, colour: toggle(d.colour, c.value) }))} />)}</Section>}
            {!!facets?.shapes.length && <Section title="Pearl shape">{facets.shapes.map((c) => <Chip key={c.value} label={`${c.value} (${c.count})`} on={draft.shape?.includes(c.value)} onPress={() => setDraft((d) => ({ ...d, shape: toggle(d.shape, c.value) }))} />)}</Section>}
            {!!facets?.collections.length && <Section title="Collection">{facets.collections.map((c) => <Chip key={c.slug} label={c.name} on={draft.collection === c.slug} onPress={() => setDraft((d) => ({ ...d, collection: d.collection === c.slug ? undefined : c.slug }))} />)}</Section>}
            <Section title="Availability"><Chip label="In stock only" on={!!draft.inStock} onPress={() => setDraft((d) => ({ ...d, inStock: !d.inStock }))} /></Section>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 1, borderColor: C.line }}>
            <Button title="Clear" variant="outline" style={{ flex: 1 }} onPress={() => setDraft({ q: f.q, category: f.category, sort: 'featured' })} />
            <Button title="Show results" style={{ flex: 2 }} onPress={() => { setF(draft); setOpen(false); }} />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontWeight: '600', color: C.ink }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{children}</View>
    </View>
  );
}
