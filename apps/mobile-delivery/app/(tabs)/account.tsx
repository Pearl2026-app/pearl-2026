import Constants from 'expo-constants';
import { ScrollView, Text, View } from 'react-native';
import { useSession } from '@/session';
import { OfflineBanner } from '@/offline';
import { C } from '@/theme';
import { Button, Card, H1, Muted } from '@/ui';

export default function Account() {
  const { me, signOut } = useSession();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <H1>{me?.deliveryPartner?.name ?? me?.name ?? 'Delivery partner'}</H1>
      {me?.phone ? <Muted>{me.phone}</Muted> : null}
      <OfflineBanner />
      <Card>
        <Text style={{ fontWeight: '700', color: C.ink }}>How deliveries work</Text>
        <Text style={{ color: C.ink, lineHeight: 21 }}>
          1. Tap “Picked up” at the store.{'\n'}2. Tap “Start delivery” when you leave.{'\n'}3. At the door: take a photo of the handover, enter the customer’s code (or get a signature), collect cash if shown, then “Mark delivered”.{'\n'}No signal? Keep going: updates are saved on the phone and sent later.
        </Text>
      </Card>
      <View style={{ gap: 10 }}>
        <Button title="Sign out" variant="outline" onPress={signOut} />
        <Muted>Version {Constants.expoConfig?.version}</Muted>
      </View>
    </ScrollView>
  );
}
