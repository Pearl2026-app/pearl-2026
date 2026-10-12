import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { errorText } from '@sahyadri/api-client';
import { client } from '@/api';
import { enquireOnWhatsApp } from '@/enquire';
import { useSite } from '@/site';
import { C } from '@/theme';
import type { ProductCard } from '@/types';
import { Banner, Button, Chip, Field, H1, Muted, ProductTile } from '@/ui';

const Q = {
  occasion: ['Engagement', 'Anniversary', 'Birthday', 'Everyday', 'Gift'],
  style: ['Classic solitaire', 'Modern', 'Vintage', 'Bold statement'],
  metal: [['any', 'Any metal'], ['gold', 'Gold'], ['silver', 'Silver'], ['platinum', 'Platinum']] as const,
  colour: ['Any', 'White', 'Cream', 'Golden', 'Rose', 'Black'],
  shape: ['Any', 'Round', 'Drop', 'Button', 'Baroque'],
  budget: [[1_500_000, 'Up to ₹15,000'], [3_000_000, 'Up to ₹30,000'], [6_000_000, 'Up to ₹60,000'], [0, 'No limit']] as const,
};

interface Result { results: Array<{ product: ProductCard; reason: string }>; relaxed: string[]; handoff: boolean }

export default function RingFinder() {
  const site = useSite();
  const [a, setA] = useState<{ occasion?: string; style?: string; metal: string; colour?: string; shape?: string; budget?: number; ringSize: string }>({ metal: 'any', ringSize: '' });
  const [r, setR] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const find = async () => {
    setBusy(true);
    setError(null);
    try {
      setR(
        await client.shop.ringFinder<Result>({
          occasion: a.occasion,
          style: a.style,
          metal: a.metal,
          colour: a.colour && a.colour !== 'Any' ? a.colour : undefined,
          shape: a.shape && a.shape !== 'Any' ? a.shape : undefined,
          budgetMaxPaise: a.budget || undefined,
          ringSize: a.ringSize || undefined,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const group = (title: string, children: React.ReactNode) => (
    <View style={{ gap: 6 }}>
      <Text style={{ fontWeight: '600', color: C.ink }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{children}</View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <H1>Find your ring</H1>
      <Muted>Answer a few questions and we will pick pearl rings that suit you.</Muted>
      {group('The occasion', Q.occasion.map((o) => <Chip key={o} label={o} on={a.occasion === o} onPress={() => setA((x) => ({ ...x, occasion: o }))} />))}
      {group('Style', Q.style.map((o) => <Chip key={o} label={o} on={a.style === o} onPress={() => setA((x) => ({ ...x, style: o }))} />))}
      {group('Metal', Q.metal.map(([v, l]) => <Chip key={v} label={l} on={a.metal === v} onPress={() => setA((x) => ({ ...x, metal: v }))} />))}
      {group('Pearl colour', Q.colour.map((o) => <Chip key={o} label={o} on={(a.colour ?? 'Any') === o} onPress={() => setA((x) => ({ ...x, colour: o }))} />))}
      {group('Pearl shape', Q.shape.map((o) => <Chip key={o} label={o} on={(a.shape ?? 'Any') === o} onPress={() => setA((x) => ({ ...x, shape: o }))} />))}
      {group('Budget', Q.budget.map(([v, l]) => <Chip key={l} label={l} on={(a.budget ?? 0) === v} onPress={() => setA((x) => ({ ...x, budget: v }))} />))}
      <Field label="Ring size (optional)" value={a.ringSize} onChangeText={(v) => setA((x) => ({ ...x, ringSize: v.slice(0, 10) }))} keyboardType="number-pad" hint="Indian size. Not sure? We confirm it before making or altering a ring." />
      <Button title="Show my rings" onPress={find} loading={busy} />
      {error && <Banner tone="danger">{error}</Banner>}

      {r && (
        <View style={{ gap: 10 }}>
          {r.relaxed.length > 0 && <Banner tone="info">Nothing matched exactly, so we loosened: {r.relaxed.join(', ')}.</Banner>}
          {r.handoff ? (
            <View style={{ gap: 10 }}>
              <Muted>We have no ring like this in stock right now, but we can make one for you.</Muted>
              <Button title="Ask our designers on WhatsApp" onPress={() => enquireOnWhatsApp({ type: 'RING_FINDER', message: `Ring Finder: ${[a.occasion, a.style, a.metal, a.colour, a.shape].filter(Boolean).join(', ')}` }, site?.whatsapp.default ?? '')} />
            </View>
          ) : (
            r.results.map(({ product, reason }) => (
              <View key={product.id} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                <View style={{ width: '50%' }}><ProductTile p={product} /></View>
                <Text style={{ flex: 1, color: C.ink, marginTop: 12 }}>{reason}</Text>
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}
