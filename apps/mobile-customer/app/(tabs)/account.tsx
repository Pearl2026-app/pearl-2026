import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { waMeUrl } from '@sahyadri/shared';
import { WEB_URL } from '@/api';
import { useSession } from '@/session';
import { useSite } from '@/site';
import { C } from '@/theme';
import { Button, H1, Muted } from '@/ui';

export default function Account() {
  const { me, signOut } = useSession();
  const site = useSite();
  const web = (path: string) => () => WebBrowser.openBrowserAsync(`${WEB_URL}${path}`);
  const rows: Array<[string, () => void]> = [
    ...(me
      ? ([
          ['My orders', () => router.push('/orders')],
          ['Addresses', () => router.push('/addresses')],
          ['Returns', () => router.push('/returns')],
          ['Refer a friend', () => router.push('/referral')],
        ] as Array<[string, () => void]>)
      : []),
    ['Ring Finder', () => router.push('/ring-finder')],
    ['Customized Jewellery', () => router.push('/custom')],
    ...(site?.storefront.consultationsEnabled ? ([['Book a consultation', web('/book-consultation')]] as Array<[string, () => void]>) : []),
    ['Pearl Guide', web('/pearl-guide')],
    ['Visit us', web('/visit-us')],
    ['Talk to us on WhatsApp', () => site && Linking.openURL(waMeUrl(site.whatsapp.default, 'Hello Sahyadri Pearls'))],
    ['Terms & policies', web('/terms')],
    ['Privacy policy', web('/privacy')],
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      {me ? (
        <View style={{ gap: 4 }}>
          <H1>{me.name || 'Hello'}</H1>
          <Muted>{me.phone ?? me.email ?? ''}</Muted>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <H1>Welcome</H1>
          <Muted>Sign in with your mobile number to see your orders, wishlist and referral rewards.</Muted>
          <Button title="Sign in" onPress={() => router.push('/login')} />
        </View>
      )}
      <View style={{ borderTopWidth: 1, borderColor: C.line }}>
        {rows.map(([label, onPress]) => (
          <Pressable key={label} onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 16, borderBottomWidth: 1, borderColor: C.line, backgroundColor: pressed ? C.muted : 'transparent', flexDirection: 'row', justifyContent: 'space-between' })}>
            <Text style={{ fontSize: 16, color: C.ink }}>{label}</Text>
            <Text style={{ color: C.sub }}>›</Text>
          </Pressable>
        ))}
      </View>
      {me && <Button title="Sign out" variant="outline" onPress={signOut} />}
      <Muted>Version {Constants.expoConfig?.version}</Muted>
    </ScrollView>
  );
}
