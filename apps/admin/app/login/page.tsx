'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Field, Input, cx } from '@sahyadri/ui';
import { api, ApiError, errorText } from '@/lib/api';

type Step = { kind: 'credentials' } | { kind: 'otp'; challengeId: string; sentTo: string; channel?: string };

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'team' | 'partner'>('team');
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

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

  const start = () =>
    run(async () => {
      const r =
        mode === 'team'
          ? await api<{ challengeId: string; sentTo: string; channel: string }>('/auth/staff/login', { method: 'POST', json: { email, password } })
          : await api<{ challengeId: string; sentTo: string }>('/auth/partner/otp/request', { method: 'POST', json: { identifier } });
      setStep({ kind: 'otp', ...r });
      setCode('');
    });

  const verify = () =>
    run(async () => {
      if (step.kind !== 'otp') return;
      const r = await api<{ user: { role: string } }>(mode === 'team' ? '/auth/staff/verify' : '/auth/partner/otp/verify', {
        method: 'POST',
        json: { challengeId: step.challengeId, code },
      });
      await qc.invalidateQueries();
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : r.user.role === 'DELIVERY_PARTNER' ? '/delivery' : '/');
    });

  const byEmail = () =>
    run(async () => {
      if (step.kind !== 'otp') return;
      const r = await api<{ challengeId: string; sentTo: string; channel: string }>('/auth/staff/otp/email', { method: 'POST', json: { challengeId: step.challengeId } });
      setStep({ kind: 'otp', ...r });
    });

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-md border border-line bg-surface p-6 shadow-sm">
        <h1 className="font-serif text-3xl text-accent">Sahyadri Pearls</h1>
        <p className="mb-5 text-sm text-muted">Admin and partner sign-in</p>
        {step.kind === 'credentials' && (
          <div role="tablist" className="mb-5 grid grid-cols-2 rounded-sm border border-line p-1 text-sm">
            {(['team', 'partner'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cx('min-h-9 rounded-sm', mode === m ? 'bg-accent text-white' : 'text-ink')}
              >
                {m === 'team' ? 'Team' : 'Vendor / Franchise / Delivery'}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void (step.kind === 'credentials' ? start() : verify());
          }}
        >
          {error && <Alert tone="danger">{error}</Alert>}
          {step.kind === 'credentials' && mode === 'team' && (
            <>
              <Field label="Email" error={fields.email}>
                {(id, d) => <Input id={id} aria-describedby={d} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}
              </Field>
              <Field label="Password" error={fields.password}>
                {(id, d) => (
                  <Input id={id} aria-describedby={d} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                )}
              </Field>
            </>
          )}
          {step.kind === 'credentials' && mode === 'partner' && (
            <Field label="Email or mobile number" error={fields.identifier} hint="We will send you a one-time code.">
              {(id, d) => <Input id={id} aria-describedby={d} autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />}
            </Field>
          )}
          {step.kind === 'otp' && (
            <>
              <p className="text-sm text-muted">Enter the 6-digit code sent to {step.sentTo}.</p>
              <Field label="One-time code" error={fields.code}>
                {(id, d) => (
                  <Input
                    id={id}
                    aria-describedby={d}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    pattern="\d{6}"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                    required
                  />
                )}
              </Field>
            </>
          )}
          <Button type="submit" loading={busy}>
            {step.kind === 'credentials' ? 'Continue' : 'Sign in'}
          </Button>
          {step.kind === 'otp' && (
            <div className="flex justify-between text-sm">
              <button type="button" className="text-accent underline" onClick={() => setStep({ kind: 'credentials' })}>
                Start again
              </button>
              {mode === 'team' && step.channel === 'SMS' && (
                <button type="button" className="text-accent underline" onClick={byEmail}>
                  Send code by email instead
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
