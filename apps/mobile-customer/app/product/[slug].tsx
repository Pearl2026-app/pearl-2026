import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Dimensions, FlatList, Image, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorText } from '@sahyadri/api-client';
import { client, img, WEB_URL } from '@/api';
import { useCached } from '@/data';
import { enquireOnWhatsApp } from '@/enquire';
import { useSession } from '@/session';
import { useSite } from '@/site';
import { C } from '@/theme';
import type { Cart, ProductDetail } from '@/types';
import { Banner, Button, Eyebrow, Muted, Price, ProductTile } from '@/ui';

const W = Dimensions.get('window').width;
const GUIDE: Record<string, string> = { Lustre: 'lustre', Surface: 'surface', Grade: 'grading', Size: 'size', Shape: 'shape', Certification: 'certificate' };

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { me, setCartCount } = useSession();
  const site = useSite();
  const { data: p, error } = useCached<ProductDetail>(`product:${slug}`, () => client.shop.product<ProductDetail>(slug));
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState<'cart' | 'enquire' | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [wished, setWished] = useState(false);

  useEffect(() => {
    if (me && p) client.account.wishlistIds().then((ids) => setWished(ids.includes(p.id))).catch(() => undefined);
  }, [me, p]);

  if (!p) return <View style={{ padding: 16 }}>{error ? <Banner tone="danger">{error}</Banner> : <Muted>Loading…</Muted>}</View>;
  const canBuy = p.available && !p.priceOnRequest && !p.reserved && p.availableInCity;
  const spec: Array<[string, string | number | null]> = [
    ['Carat', p.caratWeight != null ? `${p.caratWeight} ct` : null],
    ['Shape', p.shape],
    ['Colour', p.colour],
    ['Lustre', p.lustre],
    ['Surface', p.surface],
    ['Size', p.sizeMm != null ? `${p.sizeMm} mm` : null],
    ['Grade', p.grade],
    ['Metal / setting', p.metal],
    ['Origin farm', p.farm?.name ?? null],
    ['Certification', p.certification],
    ['SKU', p.sku],
  ];

  const addToCart = async () => {
    setBusy('cart');
    setMessage(null);
    try {
      const c = await client.shop.addToCart<Cart>(p.id, 1);
      setCartCount(c.count);
      setMessage({ tone: 'success', text: 'Added to your cart.' });
    } catch (e) {
      setMessage({ tone: 'danger', text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const enquire = async () => {
    setBusy('enquire');
    try {
      await enquireOnWhatsApp({ type: 'PRODUCT', productId: p.id, productName: p.name, sku: p.sku, ...(p.isSold ? { message: 'I would like a similar piece.' } : {}) }, site?.whatsapp.default ?? '');
    } finally {
      setBusy(null);
    }
  };
  const toggleWish = async () => {
    if (!me) return router.push('/login');
    try {
      if (wished) await client.account.removeFromWishlist(p.id);
      else await client.account.addToWishlist(p.id);
      setWished(!wished);
    } catch (e) {
      setMessage({ tone: 'danger', text: errorText(e) });
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: p.category.name }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <FlatList
          horizontal
          pagingEnabled
          data={p.images}
          keyExtractor={(_, i) => String(i)}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / W))}
          renderItem={({ item }) => <Image source={{ uri: img(item.variants?.['1200'] ?? item.url) }} style={{ width: W, height: W, backgroundColor: C.muted }} accessibilityLabel={item.alt ?? p.name} />}
        />
        {p.images.length > 1 && <Text style={{ textAlign: 'center', color: C.sub, marginTop: 6 }}>{slide + 1} / {p.images.length}</Text>}

        <View style={{ padding: 16, gap: 14 }}>
          <View style={{ gap: 4 }}>
            {p.collection ? <Eyebrow>{p.collection.name} collection</Eyebrow> : null}
            <Text style={{ fontFamily: 'serif', fontSize: 32, color: C.ink }}>{p.name}</Text>
            <Muted>SKU {p.sku}{p.rating.count ? `  ·  ★ ${p.rating.average} (${p.rating.count})` : ''}</Muted>
          </View>
          <View>
            <Price p={p} size={24} />
            {!p.priceOnRequest && <Muted>Inclusive of GST</Muted>}
            {p.isSold && <Text style={{ marginTop: 6, color: C.danger, fontWeight: '700' }}>Sold</Text>}
            {p.reserved && <Text style={{ marginTop: 6, color: C.warning }}>Someone is checking out this one-of-a-kind piece. It may be available again in 15 minutes.</Text>}
            {!p.availableInCity && <Text style={{ marginTop: 6, color: C.warning }}>Not delivered in your city yet. Enquire and we will try to help.</Text>}
            {p.isUnique && !p.isSold && <Muted>One of a kind: there is only this piece.</Muted>}
          </View>
          {message && <Banner tone={message.tone}>{message.text}</Banner>}

          <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line, paddingVertical: 12, gap: 6 }}>
            {p.farm && <Text style={{ color: C.ink }}>Origin: {p.farm.name}, {p.farm.location}</Text>}
            {p.certificateCode && (
              <Pressable onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/verify/${p.certificateCode}`)} accessibilityRole="link">
                <Text style={{ color: C.accent }}>Certified · verify certificate</Text>
              </Pressable>
            )}
            {site && <Text style={{ color: C.ink }}>{site.delivery.promise}</Text>}
            {site && site.returns.windowDays > 0 && <Text style={{ color: C.ink }}>Easy {site.returns.windowDays}-day returns</Text>}
          </View>

          <View style={{ flexDirection: 'row', gap: 20 }}>
            <Pressable onPress={toggleWish} accessibilityRole="button" style={{ paddingVertical: 8 }}><Text style={{ color: C.ink }}>{wished ? '♥ Saved' : '♡ Save to wishlist'}</Text></Pressable>
            <Pressable onPress={() => Share.share({ message: `${p.name} · ${WEB_URL}/product/${p.slug}` })} accessibilityRole="button" style={{ paddingVertical: 8 }}><Text style={{ color: C.ink }}>Share</Text></Pressable>
          </View>

          {p.description ? <Text style={{ color: C.ink, fontSize: 16, lineHeight: 24 }}>{p.description}</Text> : null}

          <View style={{ gap: 6 }}>
            <Eyebrow>Specification</Eyebrow>
            {spec.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row' }}>
                {GUIDE[k] ? (
                  <Pressable style={{ width: 140 }} onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/pearl-guide#${GUIDE[k]}`)} accessibilityRole="link" accessibilityHint="Opens the Pearl Guide">
                    <Text style={{ color: C.sub, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}>{k}</Text>
                  </Pressable>
                ) : (
                  <Text style={{ width: 140, color: C.sub }}>{k}</Text>
                )}
                <Text style={{ flex: 1, color: C.ink }}>{v}</Text>
              </View>
            ))}
          </View>

          {p.reviews.length > 0 && (
            <View style={{ gap: 10 }}>
              <Eyebrow>Reviews</Eyebrow>
              {p.reviews.slice(0, 4).map((r) => (
                <View key={r.id} style={{ borderTopWidth: 1, borderColor: C.line, paddingTop: 8 }}>
                  <Text style={{ color: C.gold }}>{'★'.repeat(r.rating)}</Text>
                  {r.title ? <Text style={{ fontWeight: '600', color: C.ink }}>{r.title}</Text> : null}
                  {r.body ? <Text style={{ color: C.ink }}>{r.body}</Text> : null}
                  <Muted>{r.name}</Muted>
                </View>
              ))}
            </View>
          )}
        </View>

        {p.related.length > 0 && (
          <View style={{ paddingHorizontal: 10 }}>
            <Text style={{ fontFamily: 'serif', fontSize: 24, color: C.ink, marginHorizontal: 6, marginBottom: 4 }}>You may also like</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {p.related.slice(0, 4).map((r) => <View key={r.id} style={{ width: '50%' }}><ProductTile p={r} /></View>)}
            </View>
          </View>
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.bg, borderTopWidth: 1, borderColor: C.line }}>
        <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
          {canBuy && <Button title="Add to cart" style={{ flex: 1 }} onPress={addToCart} loading={busy === 'cart'} />}
          <Button title={canBuy ? 'WhatsApp' : p.isSold ? 'Enquire about a similar piece' : 'Enquire on WhatsApp'} variant={canBuy ? 'outline' : 'solid'} style={{ flex: 1 }} onPress={enquire} loading={busy === 'enquire'} />
        </View>
      </SafeAreaView>
    </View>
  );
}
