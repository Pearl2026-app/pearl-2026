import { ScrollView, Share, Text, View } from 'react-native';
import { client } from '@/api';
import { useCached } from '@/data';
import { inr } from '@/format';
import { C } from '@/theme';
import { Button, H1, Muted } from '@/ui';

interface Referral { code: string; enabled: boolean; referrerRewardPaise: number; refereeRewardPaise: number; shareText: string; referrals: Array<{ name: string; joinedAt: string; rewarded: boolean }>; rewards: Array<{ code: string; amountPaise: number; used: boolean; endsAt: string | null }> }

export default function ReferralScreen() {
  const { data: r } = useCached<Referral>('referral', () => client.account.referral<Referral>());
  if (!r) return <View style={{ padding: 16 }}><Muted>Loading…</Muted></View>;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <H1>Share the pearls</H1>
      {r.enabled ? (
        <Muted>
          Friends get {inr(r.refereeRewardPaise)} off their first order with your code, and you get {inr(r.referrerRewardPaise)} off your next one when their order is delivered.
        </Muted>
      ) : (
        <Muted>The referral programme is paused right now.</Muted>
      )}
      <View style={{ borderWidth: 1, borderColor: C.gold, padding: 16, alignItems: 'center' }}>
        <Text style={{ fontSize: 28, letterSpacing: 4, color: C.ink, fontWeight: '700' }}>{r.code}</Text>
      </View>
      <Button title="Share my code" onPress={() => Share.share({ message: r.shareText })} />
      {r.rewards.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>Your rewards</Text>
          {r.rewards.map((x) => <Muted key={x.code}>{x.code} · {inr(x.amountPaise)} off{x.used ? ' · used' : x.endsAt ? ` · valid till ${new Date(x.endsAt).toLocaleDateString('en-IN')}` : ''}</Muted>)}
        </View>
      )}
      {r.referrals.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>Friends who joined</Text>
          {r.referrals.map((x, i) => <Muted key={i}>{x.name} · {x.rewarded ? 'reward earned' : 'waiting for their first delivery'}</Muted>)}
        </View>
      )}
    </ScrollView>
  );
}
