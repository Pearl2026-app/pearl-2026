import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorText } from '@sahyadri/api-client';
import { client } from '@/api';
import { useSession } from '@/session';
import { C } from '@/theme';
import { Banner, Button, Field, H1, Muted } from '@/ui';

/** Phone number → one-time code. Only delivery partner logins are accepted here. */
export default function Login() {
  const { setMe } = useSession();
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await client.auth.requestPartnerOtp(phone.trim());
      setChallenge(r.challengeId);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const me = await client.auth.verifyPartnerOtp(challenge, code.trim());
      if (me.role !== 'DELIVERY_PARTNER') {
        await client.auth.signOut();
        throw new Error('This app is for delivery partners. Please use the website to sign in.');
      }
      setMe(me);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error && !('status' in e) ? e.message : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 18, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: 'serif', fontSize: 22, color: C.accent }}>Sahyadri Pearls</Text>
            <H1>Delivery partner sign in</H1>
            <Muted>Use the mobile number registered with the city team.</Muted>
          </View>
          {error && <Banner tone="danger">{error}</Banner>}
          {!challenge ? (
            <>
              <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="98xxxxxxxx" />
              <Button title="Send code" onPress={request} loading={busy} disabled={phone.replace(/\D/g, '').length < 10} />
            </>
          ) : (
            <>
              <Field label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" autoFocus />
              <Button title="Sign in" onPress={verify} loading={busy} disabled={code.length !== 6} />
              <Button title="Use a different number" variant="outline" onPress={() => { setChallenge(null); setCode(''); }} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
