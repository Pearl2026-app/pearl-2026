# Going live — checklist

The demo at sahyadri-pearls-demo.vercel.app runs with `DEMO_MODE=true`: sample data, the fixed sign-in code
123456, sandbox payments, and files on the instance's own disk. Going live means turning that off and giving the
platform real accounts. Everything below is configuration — no code changes.

## 1. What the business must provide

| Needed for | What to get | Where it goes (environment variables) |
|---|---|---|
| The address | A domain (e.g. sahyadripearls.com) | Vercel → Project → Domains |
| Payments | Razorpay LIVE keys + a webhook secret | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PAYMENT_PROVIDER=razorpay` |
| Sign-in codes by SMS | An Indian SMS gateway with DLT registration (MSG91, Kaleyra…) | `SMS_PROVIDER=http`, `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_DLT_ENTITY_ID`, `SMS_DLT_OTP_TEMPLATE_ID` |
| Emails (invoices, alerts) | An SMTP account (Zoho Mail, SES…) | `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` |
| WhatsApp messages | Meta WhatsApp Business API (Cloud API) with approved templates | `WHATSAPP_PROVIDER=cloudapi`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_SECRET` |
| Images & documents that survive deployments | An S3-compatible bucket (AWS S3 / Cloudflare R2) | `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` |
| App push notifications | A Firebase project | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` |

Still third-party work, quoted separately: Zoho POS sync, PhonePe/Instamojo as extra gateways, a live gold/silver
rate feed (`PEARL_RATE_FEED_URL`), GoKwik-style one-click checkout, and road-distance routing (Google Maps key).

## 2. Switching production on

1. Create a **production** Vercel project (or promote this one) with a production Postgres (Neon paid tier, with
   backups turned on).
2. Set the environment variables above, plus:
   - `DEMO_MODE` — **remove it entirely** (this alone turns off the fixed 123456 code and sandbox payments)
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — two long random strings (e.g. `openssl rand -base64 48`)
   - `DATABASE_URL` — the production database
   - `WEB_URL` / `ADMIN_URL` / `API_URL` — the real domain
3. Deploy. Run the database migrations (`pnpm --filter @sahyadri/db exec prisma migrate deploy`) — in demo mode
   this happens automatically; in production run it once per release (a GitHub Action is fine).
4. Create the first Super Admin and real business data (replace every `@sahyadripearls.test` login):
   staff logins, cities, vendors with their PIN codes, riders, farms, categories, products, GSTIN in Settings.
   **An invoice without a GSTIN in Settings prints with a SAMPLE watermark on purpose.**
5. In Settings: payments (COD limit), delivery charges, returns window, credit points, low-stock alerts,
   announcement bar, and switch **“Show the store only in India”** on if wanted.
6. Point the Razorpay webhook at `https://<domain>/api/v1/payments/webhook` and the WhatsApp webhook at
   `https://<domain>/api/v1/whatsapp/webhook`.

## 3. Already handled in code

- Passwords hashed, sessions in httpOnly cookies, one-time codes with rate limits and decoy challenges.
- Every admin query scoped by role; every change in the audit log; helmet security headers; CORS locked to the
  site's own origins; spreadsheet-injection-safe CSV exports; magic-byte checks on uploads.
- GST invoices numbered gap-free per financial year; money in integer paise, computed only on the server.
- Migrations are written to re-run safely; a failed half-applied migration recovers on restart.

## 4. Before announcing

- Place one real ₹10 order end to end (online payment, pack, assign, deliver, invoice PDF).
- Check the four portals sign in: head office, a vendor, a rider, a customer.
- Turn the demo ribbon off by removing `DEMO_MODE`, then check the home page, a product, checkout and tracking
  on a phone.
