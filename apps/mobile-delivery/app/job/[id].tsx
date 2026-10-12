import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { errorText } from '@sahyadri/api-client';
import { client } from '@/api';
import { useCached } from '@/data';
import { queue } from '@/device-queue';
import { inr } from '@/format';
import { currentPosition } from '@/location';
import { OfflineBanner } from '@/offline';
import type { StepAction, StepFile } from '@/queue';
import { useSignaturePad } from '@/signature';
import { C } from '@/theme';
import { addressLine, mapsUrl, type Job } from '@/types';
import { Banner, Button, Card, Field, H1, Muted, StatusBadge } from '@/ui';

const REASONS = {
  failed: ['Customer not available', 'Wrong or incomplete address', 'Customer refused the parcel', 'Could not collect payment'],
  returned: ['Customer refused the parcel', 'Damaged packaging', 'Asked by the city team'],
};

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: j, stale, error: loadError, refresh } = useCached<Job>(`job:${id}`, () => client.delivery.job<Job>(id));
  const [photo, setPhoto] = useState<StepFile | null>(null);
  const [otp, setOtp] = useState('');
  const [cash, setCash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<'failed' | 'returned' | null>(null);
  const [reason, setReason] = useState('');
  const sig = useSignaturePad();

  if (!j) return <View style={{ flex: 1, padding: 16 }}>{loadError ? <Banner tone="danger">{loadError}</Banner> : <Muted>Loading…</Muted>}</View>;
  const a = j.addressSnapshot;

  const step = async (action: StepAction, fields: Record<string, string> = {}, files?: Record<string, StepFile>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await queue.submit({ orderId: j.id, action, fields, files });
      setNote(r === 'queued' ? 'Saved on this phone. It will be sent when you are back online.' : null);
      setReasonFor(null);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Camera needed', 'Allow the camera in Settings to take the proof-of-delivery photo.');
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, exif: false });
    const asset = r.canceled ? null : r.assets[0];
    if (asset) setPhoto({ uri: asset.uri, name: 'handover.jpg', type: asset.mimeType ?? 'image/jpeg' });
  };

  const deliver = async () => {
    if (!photo) return;
    const files: Record<string, StepFile> = { photo };
    if (!otp && sig.signed) files.signature = await sig.capture();
    const fields: Record<string, string> = { ...(await currentPosition()) };
    if (otp) fields.otp = otp;
    if (j.codDuePaise > 0) fields.codCollectedPaise = String(j.codDuePaise);
    await step('delivered', fields, files);
  };

  const proofOk = !!photo && (j.otpRequired ? otp.length === 6 : otp.length === 6 || sig.signed) && (j.codDuePaise === 0 || cash);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: j.number }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <H1>{j.number}</H1>
        <StatusBadge status={j.status} />
      </View>
      <OfflineBanner onSent={refresh} />
      {stale && <Banner tone="info">Showing details saved on this phone.</Banner>}
      {note && <Banner tone="info">{note}</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}

      <Card>
        <Text style={{ fontWeight: '700', fontSize: 16, color: C.ink }}>{j.contactName}</Text>
        <Text style={{ color: C.ink }}>{addressLine(a)}</Text>
        {j.customerNote ? <Text style={{ color: C.sub }}>Note: {j.customerNote}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Button title="Call" variant="outline" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${j.contactPhone}`)} />
          <Button title="Maps" variant="outline" style={{ flex: 1 }} onPress={() => Linking.openURL(mapsUrl(a))} />
        </View>
      </Card>

      <Card>
        {j.items.map((i) => (
          <Text key={i.sku} style={{ color: C.ink }}>
            {i.quantity} × {i.name} <Text style={{ color: C.sub }}>({i.sku})</Text>
          </Text>
        ))}
        <Text style={{ marginTop: 6, fontWeight: '700', color: j.codDuePaise > 0 ? C.warning : C.success }}>{j.codDuePaise > 0 ? `Collect cash ${inr(j.codDuePaise)}` : 'Already paid: collect nothing.'}</Text>
      </Card>

      {j.status === 'ASSIGNED' && <Button title="Picked up from the store" onPress={() => step('picked-up')} loading={busy} />}
      {j.status === 'PICKED_UP' && <Button title="Start delivery" onPress={() => step('out-for-delivery')} loading={busy} />}

      {j.status === 'OUT_FOR_DELIVERY' && (
        <Card style={{ gap: 14 }}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: C.ink }}>Proof of delivery</Text>
          <Button title={photo ? 'Retake handover photo' : 'Take handover photo (required)'} variant={photo ? 'outline' : 'solid'} onPress={takePhoto} />
          {photo && <Image source={{ uri: photo.uri }} style={{ height: 180, resizeMode: 'contain', backgroundColor: C.muted }} accessibilityLabel="Handover photo" />}
          <Field label={`Customer’s delivery code${j.otpRequired ? ' (required)' : ''}`} value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} />
          <Pressable onPress={() => client.delivery.resendCode(j.id).then(() => Alert.alert('Code sent', 'The customer has been sent their code again.')).catch((e) => setError(errorText(e)))} accessibilityRole="button">
            <Text style={{ color: C.accent }}>Send the code to the customer again</Text>
          </Pressable>
          {!j.otpRequired && !otp && (
            <View style={{ gap: 6 }}>
              <Muted>Or the customer’s signature</Muted>
              {sig.pad}
            </View>
          )}
          {j.codDuePaise > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Switch value={cash} onValueChange={setCash} trackColor={{ true: C.accent }} accessibilityLabel="Cash collected" />
              <Text style={{ flex: 1, color: C.ink }}>I have collected {inr(j.codDuePaise)} in cash</Text>
            </View>
          )}
          <Button title="Mark delivered" onPress={deliver} disabled={!proofOk} loading={busy} />
        </Card>
      )}

      {(j.status === 'PICKED_UP' || j.status === 'OUT_FOR_DELIVERY') && !reasonFor && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Could not deliver" variant="danger" style={{ flex: 1 }} onPress={() => { setReasonFor('failed'); setReason(''); }} />
          <Button title="Return to store" variant="outline" style={{ flex: 1 }} onPress={() => { setReasonFor('returned'); setReason(''); }} />
        </View>
      )}
      {reasonFor && (
        <Card style={{ gap: 10 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{reasonFor === 'failed' ? 'Why could it not be delivered?' : 'Why is it being returned?'}</Text>
          {REASONS[reasonFor].map((r) => (
            <Pressable key={r} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ selected: reason === r }} style={{ padding: 12, borderWidth: 1, borderColor: reason === r ? C.accent : C.line, backgroundColor: reason === r ? C.muted : C.surface }}>
              <Text style={{ color: C.ink }}>{r}</Text>
            </Pressable>
          ))}
          <TextInput placeholder="Or type the reason" value={REASONS[reasonFor].includes(reason) ? '' : reason} onChangeText={setReason} style={{ minHeight: 48, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, paddingHorizontal: 12, fontSize: 16 }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => setReasonFor(null)} />
            <Button title="Confirm" style={{ flex: 1 }} disabled={reason.trim().length < 3} loading={busy} onPress={() => step(reasonFor, { reason: reason.trim() })} />
          </View>
        </Card>
      )}
      {j.delivery?.failureReason ? <Muted>Reason recorded: {j.delivery.failureReason}</Muted> : null}
      {j.status === 'DELIVERED' && <Banner tone="success">Delivered{j.delivery?.codCollectedPaise ? ` · cash ${inr(j.delivery.codCollectedPaise)} collected` : ''}.</Banner>}
    </ScrollView>
  );
}
