import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { ApiError, errorText } from '@sahyadri/api-client';
import { client, WEB_URL } from '@/api';
import { checkDraft, checkoutBody, emptyDraft, type CheckoutDraft } from '@/checkout-form';
import { inr } from '@/format';
import { useSession } from '@/session';
import { useSite } from '@/site';
import { C } from '@/theme';
import type { Cart } from '@/types';
import { Banner, Button, Chip, Eyebrow, Field, Muted } from '@/ui';

interface Address { id: string; name: string; phone: string; line1: string; area: string | null; cityName: string; pincode: string; cityId: string | null; isDefault: boolean }
interface Placed { order: { number: string; token: string; totalPaise: number }; payment: { mode: 'sandbox' | 'razorpay'; orderId: string; key?: string; amount: number; prefill?: { name?: string; contact?: string } } | null }

export default function Checkout() {
  const { me, setCartCount } = useSession();
  const site = useSite();
  const [cart, setCart] = useState<Cart | null>(null);
  const [d, setD] = useState<CheckoutDraft>(emptyDraft());
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [method, setMethod] = useState<'ONLINE' | 'COD'>('ONLINE');
  const [gift, setGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof CheckoutDraft) => (v: string) => setD((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    client.shop.quote<Cart>({}).then((c) => {
      setCart(c);
      if (c.paymentMethods && !c.paymentMethods.online) setMethod('COD');
    }).catch((e) => setError(errorText(e)));
    if (me) {
      setD((x) => ({ ...x, name: x.name || me.name, phone: x.phone || (me.phone ?? '').replace(/^\+91/, ''), email: x.email || (me.email ?? '') }));
      client.account.addresses<Address[]>().then((a) => {
        setAddresses(a);
        const def = a.find((x) => x.isDefault) ?? a[0];
        if (def) setD((x) => ({ ...x, addressId: def.id, cityId: def.cityId ?? x.cityId }));
      }).catch(() => undefined);
    }
  }, [me]);

  // Totals depend on the city (delivery charge), so re-quote when it changes.
  useEffect(() => {
    if (d.cityId) client.shop.quote<Cart>({ cityId: d.cityId }).then(setCart).catch(() => undefined);
  }, [d.cityId]);

  const place = async () => {
    const e = checkDraft(d);
    setErrors(e);
    if (Object.keys(e).length) return setError('Please check the highlighted fields.');
    setBusy(true);
    setError(null);
    try {
      const r = await client.shop.checkout<Placed>(checkoutBody(d, { paymentMethod: method, gift, giftMessage, note, saveAddress: !!me }));
      setCartCount(0);
      const orderPath = `/order/${encodeURIComponent(r.order.number)}?t=${encodeURIComponent(r.order.token)}`;
      if (!r.payment) return router.replace(orderPath as never);
      // Online payment happens on our website's payment page, which returns to the app.
      const back = `sahyadri://order/${encodeURIComponent(r.order.number)}?t=${encodeURIComponent(r.order.token)}`;
      const q = new URLSearchParams({ mode: r.payment.mode, po: r.payment.orderId, a: String(r.payment.amount), n: r.order.number, return: back, ...(r.payment.key ? { key: r.payment.key } : {}), name: d.name, phone: d.phone });
      const res = await WebBrowser.openAuthSessionAsync(`${WEB_URL}/pay/app?${q}`, 'sahyadri://order');
      const status = res.type === 'success' ? new URL(res.url).searchParams.get('status') ?? '' : 'cancelled';
      router.replace(`${orderPath}&payment=${status}` as never);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k.replace(/^(address|contact)\./, ''), v])));
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const pm = cart?.paymentMethods ?? { online: true, cod: true, codMaxPaise: 0 };
  const t = cart?.totals;
  const input = (k: keyof CheckoutDraft, label: string, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <View>
      <Field label={label} value={String(d[k] ?? '')} onChangeText={set(k)} {...extra} style={errors[k] ? { borderColor: C.danger } : undefined} />
      {errors[k] ? <Text style={{ color: C.danger, marginTop: 4 }}>{errors[k]}</Text> : null}
    </View>
  );
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {!me && (
          <Pressable onPress={() => router.push('/login')} accessibilityRole="link">
            <Muted>Checking out as a guest. <Text style={{ color: C.accent }}>Sign in</Text> to use saved addresses.</Muted>
          </Pressable>
        )}
        {error && <Banner tone="danger">{error}</Banner>}

        <Eyebrow>1 · Contact</Eyebrow>
        {input('name', 'Full name', { autoComplete: 'name' })}
        {input('phone', 'Mobile number', { keyboardType: 'phone-pad', autoComplete: 'tel' })}
        {input('email', 'Email (for the invoice)', { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email' })}

        <Eyebrow>2 · Delivery</Eyebrow>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {(site?.cities ?? []).map((c) => <Chip key={c.id} label={c.name} on={d.cityId === c.id} onPress={() => setD((x) => ({ ...x, cityId: c.id, cityName: x.cityName || c.name }))} />)}
        </View>
        {errors.cityId ? <Text style={{ color: C.danger }}>{errors.cityId}</Text> : null}
        {addresses.map((a) => (
          <Pressable key={a.id} onPress={() => setD((x) => ({ ...x, addressId: a.id, cityId: a.cityId ?? x.cityId }))} accessibilityRole="radio" accessibilityState={{ selected: d.addressId === a.id }} style={{ borderWidth: 1, borderColor: d.addressId === a.id ? C.accent : C.line, backgroundColor: C.surface, padding: 12 }}>
            <Text style={{ fontWeight: '600', color: C.ink }}>{a.name}</Text>
            <Muted>{[a.line1, a.area, `${a.cityName} ${a.pincode}`].filter(Boolean).join(', ')}</Muted>
          </Pressable>
        ))}
        {addresses.length > 0 && <Chip label="Use a new address" on={!d.addressId} onPress={() => setD((x) => ({ ...x, addressId: null }))} />}
        {!d.addressId && (
          <View style={{ gap: 12 }}>
            {input('line1', 'House / flat, street', { autoComplete: 'street-address' })}
            {input('area', 'Area / locality')}
            {input('landmark', 'Landmark (optional)')}
            {input('cityName', 'Town / city')}
            {input('pincode', 'Pincode', { keyboardType: 'number-pad', maxLength: 6, autoComplete: 'postal-code' })}
          </View>
        )}
        <Field label="Delivery note (optional)" value={note} onChangeText={setNote} placeholder="Gate code, best time to deliver…" />
        {site?.storefront.giftWrapEnabled && (
          <View style={{ borderWidth: 1, borderColor: gift ? C.accent : C.line, backgroundColor: C.surface, padding: 12, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Switch value={gift} onValueChange={setGift} trackColor={{ true: C.accent }} accessibilityLabel="This is a gift" />
              <Text style={{ flex: 1, color: C.ink }}><Text style={{ fontWeight: '700' }}>This is a gift</Text> · free gift box and message card; no prices in the parcel</Text>
            </View>
            {gift && <Field label={`Message for the card (${giftMessage.length}/200)`} value={giftMessage} onChangeText={(v) => setGiftMessage(v.slice(0, 200))} placeholder="Happy anniversary, with love" />}
          </View>
        )}

        <Eyebrow>3 · Payment</Eyebrow>
        {([['ONLINE', 'Pay online', 'UPI, cards, net banking, wallets', pm.online], ['COD', 'Cash on delivery', pm.cod ? 'Pay the delivery partner' : `Available up to ${inr(pm.codMaxPaise)}`, pm.cod]] as const).map(([m, title, sub, ok]) => (
          <Pressable key={m} disabled={!ok} onPress={() => setMethod(m)} accessibilityRole="radio" accessibilityState={{ selected: method === m, disabled: !ok }} style={{ borderWidth: 1, borderColor: method === m ? C.accent : C.line, backgroundColor: C.surface, padding: 14, opacity: ok ? 1 : 0.5 }}>
            <Text style={{ fontWeight: '600', color: C.ink }}>{title}</Text>
            <Muted>{sub}</Muted>
          </Pressable>
        ))}

        {t && (
          <View style={{ gap: 4, paddingTop: 6 }}>
            <Muted>Subtotal {inr(t.subtotalPaise)}{t.discountPaise ? ` · discount ${inr(t.discountPaise)}` : ''} · delivery {t.deliveryPaise ? inr(t.deliveryPaise) : 'free'}</Muted>
            <Text style={{ fontSize: 20, fontWeight: '700', color: C.ink }}>Total {inr(t.totalPaise)}</Text>
            <Muted>Inclusive of GST</Muted>
          </View>
        )}
        <Button title={method === 'COD' ? 'Place order' : 'Pay securely'} onPress={place} loading={busy} disabled={!cart?.items.length} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
