import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_URL: z.string().url().default('http://localhost:3001'),
  API_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().optional(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** inline = run jobs immediately in-process (tests); redis = BullMQ */
  QUEUE_MODE: z.enum(['redis', 'inline']).default('redis'),
  /** When false the API process does not run job workers (run `pnpm worker` separately). */
  RUN_WORKERS: bool.default(true),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
  /** Secret for OTP hashing, signed tracking links and local signed file URLs */
  APP_SECRET: z.string().min(16).optional(),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  /** Codes one phone or email may request per 15 minutes. */
  OTP_MAX_PER_WINDOW: z.coerce.number().int().min(1).default(5),
  DEV_FIXED_OTP: z.string().regex(/^\d{6}$/).optional(),
  COOKIE_SECURE: bool.optional(),
  COOKIE_DOMAIN: z.string().optional(),

  PAYMENT_PROVIDER: z.enum(['razorpay', 'sandbox']).default('sandbox'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  WHATSAPP_PROVIDER: z.enum(['clicktochat', 'cloudapi']).default('clicktochat'),
  WHATSAPP_API_BASE_URL: z.string().default('https://graph.facebook.com/v21.0'),
  WHATSAPP_API_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().optional(),

  SMS_PROVIDER: z.enum(['console', 'http']).default('console'),
  SMS_API_URL: z.string().optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  SMS_DLT_ENTITY_ID: z.string().optional(),
  SMS_DLT_OTP_TEMPLATE_ID: z.string().optional(),

  EMAIL_PROVIDER: z.enum(['smtp', 'log']).default('log'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('Sahyadri Pearls <no-reply@sahyadripearls.test>'),

  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('ap-south-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  CDN_BASE_URL: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().default(100),

  AI_PROVIDER: z.enum(['none', 'openai-compatible']).default('none'),
  AI_API_URL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().default(4000),

  PEARL_RATE_FEED_URL: z.string().optional(),
  PEARL_RATE_FEED_API_KEY: z.string().optional(),

  BACKUP_DIR: z.string().optional(),
});

export type AppConfig = z.infer<typeof schema> & { appSecret: string; cookieSecure: boolean; storageDir: string };

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production') {
    if (c.DEV_FIXED_OTP) throw new Error('DEV_FIXED_OTP must not be set in production');
    if (!c.APP_SECRET) throw new Error('APP_SECRET is required in production');
  }
  return {
    ...c,
    appSecret: c.APP_SECRET ?? `${c.JWT_ACCESS_SECRET}:${c.JWT_REFRESH_SECRET}`,
    cookieSecure: c.COOKIE_SECURE ?? c.NODE_ENV === 'production',
    storageDir: c.STORAGE_LOCAL_DIR ?? require('node:path').resolve(__dirname, '../../../../uploads'),
  };
}

export function config(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** For tests. */
export function resetConfig(): void {
  cached = null;
}

export const CONFIG = Symbol('CONFIG');

/** Per-route rate limit; tests lift limits so they can make many requests quickly. */
export const limit = (n: number) => () => (config().NODE_ENV === 'test' ? 100_000 : n);
