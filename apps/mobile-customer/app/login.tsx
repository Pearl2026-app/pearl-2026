import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { errorText } from '@sahyadri/api-client';
import { client } from '@/api';
import { useSession } from '@/session';
import { Banner, Button, Field, H1, Muted } from '@/ui';

/** Customers sign in with their mobile number and a one-time code (SMS). New numbers become accounts. */
export default function Login() {
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const { setMe, refreshCart } = useSession();
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [referral, setReferral] = useState(ref ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      setChallenge((await client.auth.requestCustomerOtp(phone.replace(/[\s-]/g, ''))).challengeId);
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
      const me = await client.auth.verifyCustomerOtp(challenge, code, { ...(name.trim() ? { name: name.trim() } : {}), ...(referral.trim() ? { referralCode: referral.trim().toUpperCase() } : {}) });
      setMe(me);
      await refreshCart(); // the guest cart joins the account
      if (router.canGoBack()) router.back();
      else router.replace('/account');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <H1>Sign in or create an account</H1>
          <Muted>We send a 6-digit code to your mobile number. No password needed.</Muted>
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
            <Field label="Your name (new customers)" value={name} onChangeText={setName} autoComplete="name" />
            <Field label="Referral code (optional)" value={referral} onChangeText={setReferral} autoCapitalize="characters" />
            <Button title="Continue" onPress={verify} loading={busy} disabled={code.length !== 6} />
            <Button title="Use a different number" variant="outline" onPress={() => { setChallenge(null); setCode(''); }} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
