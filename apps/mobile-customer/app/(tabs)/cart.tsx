import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { errorText } from '@sahyadri/api-client';
import { client } from '@/api';
import { inr } from '@/format';
import { useSession } from '@/session';
import { C } from '@/theme';
import type { Cart } from '@/types';
import { Banner, Button, H1, imageOf, Muted } from '@/ui';

export default function CartScreen() {
  const { refreshCart, setCartCount } = useSession();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setCart(await refreshCart());
    setLoading(false);
  }, [refreshCart]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const run = async (fn: () => Promise<Cart>) => {
    setError(null);
    try {
      const c = await fn();
      setCart(c);
      setCartCount(c.count);
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!cart && loading) return <View style={{ padding: 16 }}><Muted>Loading your cart…</Muted></View>;
  if (!cart?.items.length)
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <H1>Your cart is empty</H1>
        <Button title="Explore jewellery" onPress={() => router.push('/shop')} />
      </View>
    );
  const t = cart.totals;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {error && <Banner tone="danger">{error}</Banner>}
        {cart.issues.map((i) => <Banner key={i} tone="warning">{i}</Banner>)}
        {cart.items.map((l) => (
          <View key={l.productId} style={{ flexDirection: 'row', gap: 12, borderBottomWidth: 1, borderColor: C.line, paddingBottom: 12 }}>
            <Pressable onPress={() => router.push(`/product/${l.product.slug}`)}>
              <Image source={{ uri: imageOf(l.product, '400') }} style={{ width: 88, height: 88, backgroundColor: C.muted }} />
            </Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontFamily: 'serif', fontSize: 17, color: C.ink }}>{l.product.name}</Text>
              <Muted>{l.product.pricePaise != null ? inr(l.product.pricePaise) : ''}{l.product.isUnique ? ' · one of a kind' : ''}</Muted>
              {l.problem ? <Text style={{ color: C.danger }}>{l.problem}</Text> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                {!l.product.isUnique && (
                  <>
                    <Pressable accessibilityLabel="One less" onPress={() => run(() => (l.quantity > 1 ? client.shop.setQuantity<Cart>(l.productId, l.quantity - 1) : client.shop.removeFromCart<Cart>(l.productId)))} style={qty}><Text style={{ fontSize: 18 }}>−</Text></Pressable>
                    <Text style={{ minWidth: 20, textAlign: 'center' }}>{l.quantity}</Text>
                    <Pressable accessibilityLabel="One more" onPress={() => run(() => client.shop.setQuantity<Cart>(l.productId, l.quantity + 1))} style={qty}><Text style={{ fontSize: 18 }}>+</Text></Pressable>
                  </>
                )}
                <Pressable onPress={() => run(() => client.shop.removeFromCart<Cart>(l.productId))} accessibilityRole="button"><Text style={{ color: C.accent }}>Remove</Text></Pressable>
              </View>
            </View>
          </View>
        ))}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {cart.couponCode ? (
            <>
              <Text style={{ flex: 1, alignSelf: 'center', color: C.success }}>Coupon {cart.couponCode} applied</Text>
              <Button title="Remove" variant="outline" onPress={() => run(() => client.shop.removeCoupon<Cart>())} />
            </>
          ) : (
            <>
              <TextInput value={code} onChangeText={setCode} placeholder="Coupon code" autoCapitalize="characters" style={{ flex: 1, minHeight: 52, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, paddingHorizontal: 12, fontSize: 16 }} />
              <Button title="Apply" variant="outline" disabled={code.trim().length < 2} onPress={() => run(() => client.shop.applyCoupon<Cart>(code.trim()))} />
            </>
          )}
        </View>

        {t && (
          <View style={{ gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, padding: 14 }}>
            <Row label="Subtotal" value={inr(t.subtotalPaise)} />
            {t.discountPaise > 0 && <Row label="Discount" value={`− ${inr(t.discountPaise)}`} />}
            <Row label="Delivery" value={t.deliveryPaise ? inr(t.deliveryPaise) : 'Free'} />
            <Row label="Total (incl. GST)" value={inr(t.totalPaise)} bold />
          </View>
        )}
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, backgroundColor: C.bg, borderTopWidth: 1, borderColor: C.line }}>
        <Button title={t ? `Checkout · ${inr(t.totalPaise)}` : 'Checkout'} disabled={!t || cart.items.every((l) => !!l.problem)} onPress={() => router.push('/checkout')} />
      </View>
    </View>
  );
}

const qty = { width: 36, height: 36, borderWidth: 1, borderColor: C.line, alignItems: 'center' as const, justifyContent: 'center' as const };
const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
    <Text style={{ color: C.ink, fontWeight: bold ? '700' : '400' }}>{label}</Text>
    <Text style={{ color: C.ink, fontWeight: bold ? '700' : '400' }}>{value}</Text>
  </View>
);
