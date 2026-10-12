import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { ApiError, errorText } from '@sahyadri/api-client';
import { client } from '@/api';
import { useSession } from '@/session';
import { C } from '@/theme';
import { Banner, Button, Chip, Field, H1, Muted } from '@/ui';

const TYPES = ['Necklace', 'Earrings', 'Ring', 'Bracelet', 'Pendant', 'Bridal set', 'Something else'];

/** Customized Jewellery request with reference photos. Saved as an enquiry; the team replies on WhatsApp. */
export default function Custom() {
  const { me } = useSession();
  const [v, setV] = useState({ jewelleryType: '', metal: '', size: '', budgetRupees: '', designNotes: '', name: me?.name ?? '', phone: (me?.phone ?? '').replace(/^\+91/, ''), email: me?.email ?? '' });
  const [photos, setPhotos] = useState<Array<{ uri: string; name: string; type: string }>>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string; whatsappUrl: string } | null>(null);
  const set = (k: keyof typeof v) => (t: string) => setV((x) => ({ ...x, [k]: t }));

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 6 - photos.length, quality: 0.7 });
    if (!r.canceled) setPhotos((p) => [...p, ...r.assets.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `reference-${p.length + i + 1}.jpg`, type: a.mimeType ?? 'image/jpeg' }))].slice(0, 6));
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const r = await client.shop.customRequest<{ reference: string; whatsappUrl: string }>(
        { jewelleryType: v.jewelleryType, metal: v.metal, size: v.size, budgetRupees: v.budgetRupees, designNotes: v.designNotes, name: v.name, phone: v.phone.replace(/[\s-]/g, ''), email: v.email },
        photos,
      );
      setDone(r);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <Banner tone="success">Thank you. Your request {done.reference} is with our designers; they will reply on WhatsApp.</Banner>
        <Button title="Continue on WhatsApp" onPress={() => Linking.openURL(done.whatsappUrl)} />
      </View>
    );
  const err = (k: string) => (errors[k] ? <Text style={{ color: C.danger }}>{errors[k]}</Text> : null);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <H1>Something only you will wear</H1>
      <Muted>Tell us your idea. Our designers will suggest pearls from our farms and send a quote.</Muted>
      {error && <Banner tone="danger">{error}</Banner>}
      <View>
        <Text style={{ fontWeight: '600', color: C.ink, marginBottom: 6 }}>What would you like?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{TYPES.map((t) => <Chip key={t} label={t} on={v.jewelleryType === t} onPress={() => setV((x) => ({ ...x, jewelleryType: t }))} />)}</View>
        {err('jewelleryType')}
      </View>
      <Field label="Metal (optional)" value={v.metal} onChangeText={set('metal')} placeholder="22k gold, silver…" />
      <Field label="Size (optional)" value={v.size} onChangeText={set('size')} placeholder="Ring size, necklace length…" />
      <Field label="Budget in ₹ (optional)" value={v.budgetRupees} onChangeText={(t) => set('budgetRupees')(t.replace(/\D/g, ''))} keyboardType="number-pad" />
      <Field label="Describe your design" value={v.designNotes} onChangeText={set('designNotes')} multiline style={{ minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }} />
      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: '600', color: C.ink }}>Reference photos (up to 6)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((p, i) => (
            <Pressable key={p.uri} onPress={() => setPhotos((x) => x.filter((_, j) => j !== i))} accessibilityLabel="Remove photo">
              <Image source={{ uri: p.uri }} style={{ width: 72, height: 72 }} />
            </Pressable>
          ))}
        </View>
        {photos.length < 6 && <Button title="Add photos" variant="outline" onPress={pick} />}
      </View>
      <Field label="Your name" value={v.name} onChangeText={set('name')} autoComplete="name" />
      {err('name')}
      <Field label="Mobile number" value={v.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" />
      {err('phone')}
      <Field label="Email (optional)" value={v.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
      <Button title="Send to our designers" onPress={send} loading={busy} disabled={!v.jewelleryType} />
    </ScrollView>
  );
}
