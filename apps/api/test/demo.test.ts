import { afterEach, describe, expect, it } from 'vitest';
import { config, resetConfig } from '../src/config/config';
import { OtpService } from '../src/auth/otp.service';
import './env';

// Demo mode (D66): the presentation site. It must never be able to touch real money or real people.
const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  resetConfig();
});

function withEnv(env: Record<string, string | undefined>) {
  process.env = { ...saved, ...env };
  resetConfig();
  return () => config();
}

describe('demo mode', () => {
  it('refuses to start next to live payment or messaging keys', () => {
    expect(withEnv({ NODE_ENV: 'production', DEMO_MODE: 'true', RAZORPAY_KEY_SECRET: 'live' })).toThrow(/DEMO_MODE cannot run with live services \(RAZORPAY_KEY_SECRET\)/);
    expect(withEnv({ NODE_ENV: 'production', DEMO_MODE: 'true', SMS_API_KEY: 'k' })).toThrow(/SMS_API_KEY/);
    expect(withEnv({ NODE_ENV: 'production', DEMO_MODE: 'true', PAYMENT_PROVIDER: 'razorpay' })).toThrow(/PAYMENT_PROVIDER/);
  });

  it('in production: payment sandbox and in-process jobs only with the switch on', () => {
    const demo = withEnv({ NODE_ENV: 'production', DEMO_MODE: 'true' })();
    expect(demo).toMatchObject({ demoMode: true, sandboxAllowed: true, QUEUE_MODE: 'inline', RUN_WORKERS: true });
    const live = withEnv({ NODE_ENV: 'production', DEMO_MODE: undefined })();
    expect(live).toMatchObject({ demoMode: false, sandboxAllowed: false });
  });

  it('the fixed development code can never be used in production or tests', () => {
    expect(withEnv({ NODE_ENV: 'production', DEV_FIXED_OTP: '123456' })).toThrow(/DEV_FIXED_OTP must not be set in production/);
    // Outside development (here: test) a DEV_FIXED_OTP is ignored and codes are random.
    withEnv({ NODE_ENV: 'test', DEV_FIXED_OTP: '111111' })();
    const otp = new OtpService({} as never, {} as never) as unknown as { generate(): string };
    const codes = new Set(Array.from({ length: 20 }, () => otp.generate()));
    expect(codes.has('111111')).toBe(false);
    expect(codes.size).toBeGreaterThan(1);
    // Live shop (no DEMO_MODE): never the demo code either.
    withEnv({ NODE_ENV: 'production', DEMO_MODE: undefined, DEV_FIXED_OTP: undefined })();
    expect(Array.from({ length: 20 }, () => otp.generate()).every((c) => /^\d{6}$/.test(c))).toBe(true);
    expect(new Set(Array.from({ length: 20 }, () => otp.generate())).size).toBeGreaterThan(1);
  });
});

