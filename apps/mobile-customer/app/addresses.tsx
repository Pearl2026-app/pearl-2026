import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { errorText } from '@sahyadri/api-client';
import { client } from '@/api';
import { checkDraft, emptyDraft, normalisePhone, type CheckoutDraft } from '@/checkout-form';
import { useCached } from '@/data';
import { useSite } from '@/site';
import { C } from '@/theme';
import { Banner, Button, Chip, Field, Muted } from '@/ui';

interface Address { id: string; name: string; phone: string; line1: string; area: string | null; cityName: string; pincode: string; isDefault: boolean }

export default function Addresses() {
  const site = useSite();
  const { data, refresh } = useCached<Address[]>('addresses', () => client.account.addresses<Address[]>());
  const [adding, setAdding] = useState(false);
  const [d, setD] = useState<CheckoutDraft>(emptyDraft());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof CheckoutDraft) => (v: string) => setD((x) => ({ ...x, [k]: v }));

  const save = async () => {
    const e = checkDraft(d);
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      await client.account.addAddress({ name: d.name.trim(), phone: normalisePhone(d.phone), line1: d.line1.trim(), area: d.area.trim() || null, landmark: d.landmark.trim() || null, cityName: d.cityName.trim(), state: d.state, pincode: d.pincode.trim(), cityId: d.cityId });
      setAdding(false);
      setD(emptyDraft());
      await refresh();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {error && <Banner tone="danger">{error}</Banner>}
      {(data ?? []).map((a) => (
        <View key={a.id} style={{ borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, padding: 12, gap: 4 }}>
          <Text style={{ fontWeight: '600', color: C.ink }}>{a.name}{a.isDefault ? '  ·  default' : ''}</Text>
          <Muted>{[a.line1, a.area, `${a.cityName} ${a.pincode}`].filter(Boolean).join(', ')}</Muted>
          <Pressable onPress={() => Alert.alert('Remove this address?', '', [{ text: 'Keep' }, { text: 'Remove', style: 'destructive', onPress: () => client.account.deleteAddress(a.id).then(refresh).catch((e) => setError(errorText(e))) }])} accessibilityRole="button">
            <Text style={{ color: C.danger, marginTop: 4 }}>Remove</Text>
          </Pressable>
        </View>
      ))}
      {data && !data.length && !adding && <Muted>No saved addresses yet.</Muted>}
      {adding ? (
        <View style={{ gap: 10 }}>
          {(['name', 'phone', 'line1', 'area', 'landmark', 'cityName', 'pincode'] as const).map((k) => (
            <View key={k}>
              <Field label={{ name: 'Name', phone: 'Mobile number', line1: 'House / flat, street', area: 'Area', landmark: 'Landmark', cityName: 'Town / city', pincode: 'Pincode' }[k]} value={d[k]} onChangeText={set(k)} keyboardType={k === 'phone' ? 'phone-pad' : k === 'pincode' ? 'number-pad' : 'default'} />
              {errors[k] ? <Text style={{ color: C.danger }}>{errors[k]}</Text> : null}
            </View>
          ))}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{(site?.cities ?? []).map((c) => <Chip key={c.id} label={c.name} on={d.cityId === c.id} onPress={() => setD((x) => ({ ...x, cityId: c.id }))} />)}</View>
          {errors.cityId ? <Text style={{ color: C.danger }}>{errors.cityId}</Text> : null}
          <Button title="Save address" onPress={save} />
          <Button title="Cancel" variant="outline" onPress={() => setAdding(false)} />
        </View>
      ) : (
        <Button title="Add an address" variant="outline" onPress={() => setAdding(true)} />
      )}
    </ScrollView>
  );
}
