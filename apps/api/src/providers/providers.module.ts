import { Global, Logger, Module } from '@nestjs/common';
import { config } from '../config/config';
import { HttpLlmRanker, NoopRanker } from './ai';
import { ClickToChatWhatsApp, CloudApiWhatsApp, ConsoleSms, FcmPush, HttpSms, LogEmail, LogPush, SmtpEmail } from './messaging';
import { RazorpayProvider, SandboxPaymentProvider } from './payment';
import { HttpPearlRateFeed, NoPearlRateFeed } from './pearl-rate';
import { LocalStorage, S3Storage } from './storage';
import { AI_RANKER, EMAIL, PAYMENT, PEARL_RATE_FEED, PUSH, SMS, STORAGE, WHATSAPP } from './types';

const log = new Logger('Providers');

/** Picks each provider from the environment, falling back as SPEC Part 10 describes. */
export function buildProviders() {
  const c = config();
  const warn = (m: string) => c.NODE_ENV !== 'test' && log.warn(m);

  let payment;
  if (c.PAYMENT_PROVIDER === 'razorpay' && c.RAZORPAY_KEY_ID && c.RAZORPAY_KEY_SECRET && c.RAZORPAY_WEBHOOK_SECRET) {
    payment = new RazorpayProvider(c.RAZORPAY_KEY_ID, c.RAZORPAY_KEY_SECRET, c.RAZORPAY_WEBHOOK_SECRET);
  } else {
    if (c.PAYMENT_PROVIDER === 'razorpay') warn('Razorpay keys missing: using the sandbox payment provider.');
    payment = new SandboxPaymentProvider(`sandbox:${c.appSecret}`);
  }

  const whatsapp =
    c.WHATSAPP_PROVIDER === 'cloudapi' && c.WHATSAPP_API_TOKEN && c.WHATSAPP_PHONE_NUMBER_ID
      ? new CloudApiWhatsApp(c.WHATSAPP_API_BASE_URL, c.WHATSAPP_API_TOKEN, c.WHATSAPP_PHONE_NUMBER_ID)
      : new ClickToChatWhatsApp();

  const sms =
    c.SMS_PROVIDER === 'http' && c.SMS_API_URL && c.SMS_API_KEY
      ? new HttpSms(c.SMS_API_URL, c.SMS_API_KEY, c.SMS_SENDER_ID, c.SMS_DLT_ENTITY_ID)
      : new ConsoleSms();

  const email =
    c.EMAIL_PROVIDER === 'smtp' && c.SMTP_HOST
      ? new SmtpEmail({ host: c.SMTP_HOST, port: c.SMTP_PORT, user: c.SMTP_USER, pass: c.SMTP_PASSWORD }, c.EMAIL_FROM)
      : new LogEmail();

  const push =
    c.FCM_PROJECT_ID && c.FCM_CLIENT_EMAIL && c.FCM_PRIVATE_KEY
      ? new FcmPush(c.FCM_PROJECT_ID, c.FCM_CLIENT_EMAIL, c.FCM_PRIVATE_KEY)
      : new LogPush();

  const storage =
    c.STORAGE_DRIVER === 's3' && c.S3_BUCKET
      ? new S3Storage(
          c.S3_BUCKET,
          { region: c.S3_REGION, endpoint: c.S3_ENDPOINT, accessKeyId: c.S3_ACCESS_KEY_ID, secretAccessKey: c.S3_SECRET_ACCESS_KEY },
          c.CDN_BASE_URL,
        )
      : new LocalStorage(c.storageDir, c.API_URL, c.appSecret);

  const ai =
    c.AI_PROVIDER === 'openai-compatible' && c.AI_API_URL && c.AI_API_KEY && c.AI_MODEL
      ? new HttpLlmRanker(c.AI_API_URL, c.AI_API_KEY, c.AI_MODEL, c.AI_TIMEOUT_MS)
      : new NoopRanker();

  const pearlRates = c.PEARL_RATE_FEED_URL ? new HttpPearlRateFeed(c.PEARL_RATE_FEED_URL, c.PEARL_RATE_FEED_API_KEY) : new NoPearlRateFeed();

  return { payment, whatsapp, sms, email, push, storage, ai, pearlRates };
}

export type Providers = ReturnType<typeof buildProviders>;

/** Lets tests replace providers before the app boots. */
export const providerOverrides: Partial<Providers> = {};

@Global()
@Module({
  providers: [
    { provide: 'PROVIDERS', useFactory: () => ({ ...buildProviders(), ...providerOverrides }) },
    { provide: PAYMENT, useFactory: (p: Providers) => p.payment, inject: ['PROVIDERS'] },
    { provide: WHATSAPP, useFactory: (p: Providers) => p.whatsapp, inject: ['PROVIDERS'] },
    { provide: SMS, useFactory: (p: Providers) => p.sms, inject: ['PROVIDERS'] },
    { provide: EMAIL, useFactory: (p: Providers) => p.email, inject: ['PROVIDERS'] },
    { provide: PUSH, useFactory: (p: Providers) => p.push, inject: ['PROVIDERS'] },
    { provide: STORAGE, useFactory: (p: Providers) => p.storage, inject: ['PROVIDERS'] },
    { provide: AI_RANKER, useFactory: (p: Providers) => p.ai, inject: ['PROVIDERS'] },
    { provide: PEARL_RATE_FEED, useFactory: (p: Providers) => p.pearlRates, inject: ['PROVIDERS'] },
  ],
  exports: ['PROVIDERS', PAYMENT, WHATSAPP, SMS, EMAIL, PUSH, STORAGE, AI_RANKER, PEARL_RATE_FEED],
})
export class ProvidersModule {}
