import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { errorText } from '@sahyadri/api-client';
import { client, img } from '@/api';
import { useCached } from '@/data';
import { inr } from '@/format';
import { useSession } from '@/session';
import { C } from '@/theme';
import type { Tracking } from '@/types';
import { Banner, Button, H1, Muted, StatusBadge } from '@/ui';
import { Image } from 'react-native';

const STEPS = ['PLACED', 'CONFIRMED', 'PACKED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const LABEL: Record<string, string> = { PLACED: 'Order placed', CONFIRMED: 'Confirmed', PACKED: 'Packed', ASSIGNED: 'With our delivery partner', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered' };

export default function OrderScreen() {
  const { number, t, payment } = useLocalSearchParams<{ number: string; t?: string; payment?: string }>();
  const { me } = useSession();
  const { data: o, error, refresh } = useCached<Tracking>(`track:${number}`, () => client.shop.track<Tracking>(number, t));
  const [mine, setMine] = useState<{ canReturn: boolean; canCancel: boolean; returnWindowDays: number } | null>(null);
  const [asking, setAsking] = useState<'RETURN' | 'CANCELLATION' | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (me) client.account.order<{ canReturn: boolean; canCancel: boolean; returnWindowDays: number }>(number).then(setMine).catch(() => setMine(null));
  }, [me, number, o?.status]);
  const request = async () => {
    if (!asking) return;
    try {
      await client.account.requestReturn(number, { type: asking, reason: reason.trim() });
      setNote(asking === 'RETURN' ? 'Return requested. Our team will contact you to arrange the pickup.' : 'Cancellation requested. We will confirm shortly.');
      setAsking(null);
      setMine((m) => (m ? { ...m, canReturn: false, canCancel: false } : m));
    } catch (e) {
      setNote(errorText(e));
    }
  };
  if (!o) return <View style={{ padding: 16 }}>{error ? <Banner tone="danger">{error}</Banner> : <Muted>Loading your order…</Muted>}</View>;
  const reached = new Set(o.timeline.map((e) => e.status));
  const at = (s: string) => o.timeline.find((e) => e.status === s)?.at;
  const awaitingPayment = o.paymentMethod === 'ONLINE' && o.paymentStatus !== 'PAID' && !['CANCELLED', 'FAILED'].includes(o.status);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Stack.Screen options={{ title: o.number }} />
      {payment === 'paid' && <Banner tone="success">Thank you. We are confirming your payment; this page updates within a minute.</Banner>}
      {(payment === 'failed' || payment === 'cancelled') && <Banner tone="warning">The payment was not completed. Your piece is held for 15 minutes: you can try again from your cart, or contact us on WhatsApp.</Banner>}
      {!payment && o.status === 'PLACED' && o.paymentMethod === 'COD' && <Banner tone="success">Thank you! Your order is placed. Pay in cash when it arrives.</Banner>}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <H1>{o.number}</H1>
        <StatusBadge status={o.status} />
      </View>
      <Muted>Placed {new Date(o.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {inr(o.totalPaise)} · {o.paymentMethod === 'COD' ? 'Cash on delivery' : awaitingPayment ? 'Payment pending' : 'Paid online'}</Muted>

      {!['CANCELLED', 'FAILED', 'RETURNED'].includes(o.status) && (
        <View style={{ gap: 0, marginVertical: 4 }}>
          {STEPS.map((s, i) => {
            const done = reached.has(s) || (s === 'PLACED');
            return (
              <View key={s} style={{ flexDirection: 'row', gap: 12, minHeight: 44 }}>
                <View style={{ alignItems: 'center', width: 16 }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: done ? C.accent : C.surface, borderWidth: 2, borderColor: done ? C.accent : C.line }} />
                  {i < STEPS.length - 1 && <View style={{ flex: 1, width: 2, backgroundColor: reached.has(STEPS[i + 1]!) ? C.accent : C.line }} />}
                </View>
                <View>
                  <Text style={{ color: done ? C.ink : C.sub, fontWeight: done ? '600' : '400' }}>{LABEL[s]}</Text>
                  {at(s) ? <Muted>{new Date(at(s)!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Muted> : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
      {o.delivery?.partner && o.status === 'OUT_FOR_DELIVERY' && <Muted>{o.delivery.partner} is bringing your parcel. Keep the delivery code from your messages ready.</Muted>}

      <View style={{ gap: 10 }}>
        {o.items.map((i) => (
          <View key={i.sku} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            {i.imageUrl ? <Image source={{ uri: img(i.imageUrl) }} style={{ width: 56, height: 56, backgroundColor: C.muted }} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.ink }}>{i.quantity} × {i.name}</Text>
              <Muted>{inr(i.lineTotalPaise)}</Muted>
            </View>
          </View>
        ))}
      </View>
      <Muted>Delivering to {o.shipTo.name}, {o.shipTo.cityName} {o.shipTo.pincode}</Muted>
      {note && <Banner tone="info">{note}</Banner>}
      {mine && (mine.canCancel || mine.canReturn) && !asking && (
        <Button title={mine.canCancel ? 'Cancel this order' : `Return (within ${mine.returnWindowDays} days of delivery)`} variant="outline" onPress={() => setAsking(mine.canCancel ? 'CANCELLATION' : 'RETURN')} />
      )}
      {asking && (
        <View style={{ gap: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, padding: 12 }}>
          <Text style={{ fontWeight: '600', color: C.ink }}>{asking === 'RETURN' ? 'Why are you returning it?' : 'Why are you cancelling?'}</Text>
          <TextInput value={reason} onChangeText={setReason} placeholder="A short reason" style={{ minHeight: 48, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, fontSize: 16 }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Back" variant="outline" style={{ flex: 1 }} onPress={() => setAsking(null)} />
            <Button title="Send request" style={{ flex: 1 }} disabled={reason.trim().length < 3} onPress={request} />
          </View>
        </View>
      )}
      <Button title="Refresh" variant="outline" onPress={refresh} />
      {me ? <Button title="All my orders" variant="outline" onPress={() => router.push('/orders')} /> : <Button title="Continue shopping" onPress={() => router.replace('/shop')} />}
    </ScrollView>
  );
}
