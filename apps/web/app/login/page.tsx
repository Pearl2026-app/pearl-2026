'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { FormField, Notice, SubmitButton, TextInput } from '@/components/form-bits';
import { useSession } from '@/components/session';
import { Container } from '@/components/ui';
import { safeNextPath } from '@sahyadri/shared';
import { api, ApiError, errorText } from '@/lib/api';

/** Sign up and log in are one flow: mobile number and a one-time code. */
function Login() {
  const sp = useSearchParams();
  const router = useRouter();
  const { refresh } = useSession();
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<{ challengeId: string; sentTo: string } | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [referral, setReferral] = useState(sp.get('ref') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.fields) setFields(e.fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container className="max-w-md py-16">
      <h1 className="font-serif text-4xl">Sign in or sign up</h1>
      <p className="mt-2 text-muted">Use your mobile number. We will send a one-time code. Team and partner accounts sign in at the partner login.</p>
      <form
        className="mt-8 flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (!step) {
              const r = await api<{ challengeId: string; sentTo: string }>('/auth/otp/request', { method: 'POST', json: { phone } });
              setStep({ challengeId: r.challengeId, sentTo: r.sentTo });
            } else {
              await api('/auth/otp/verify', { method: 'POST', json: { challengeId: step.challengeId, code, name: name || undefined, referralCode: referral || undefined } });
              await refresh();
              const next = sp.get('next');
              router.replace(safeNextPath(next, window.location.origin));
            }
          });
        }}
      >
        {error && <Notice tone="danger">{error}</Notice>}
        {!step ? (
          <FormField label="Mobile number" error={fields.phone} required>
            {(id, d) => <TextInput id={id} aria-describedby={d} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />}
          </FormField>
        ) : (
          <>
            <p className="text-sm text-muted">Enter the 6-digit code sent to {step.sentTo}.</p>
            <FormField label="One-time code" error={fields.code} required>
              {(id, d) => <TextInput id={id} aria-describedby={d} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />}
            </FormField>
            <p className="text-sm text-muted">New here? Add your name (and a friend’s referral code if you have one).</p>
            {(
              <>
                <FormField label="Your name" error={fields.name}>{(id) => <TextInput id={id} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}</FormField>
                <FormField label="Referral code (optional)" error={fields.referralCode}>{(id) => <TextInput id={id} value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} />}</FormField>
              </>
            )}
          </>
        )}
        <SubmitButton busy={busy}>{step ? 'Continue' : 'Send code'}</SubmitButton>
        {step && (
          <button type="button" className="text-sm text-accent underline" onClick={() => (setStep(null), setCode(''))}>
            Use a different number
          </button>
        )}
      </form>
    </Container>
  );
}
export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}
