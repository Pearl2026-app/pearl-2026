import { afterEach, describe, expect, it } from 'vitest';
import { config, resetConfig } from '../src/config/config';
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
});
