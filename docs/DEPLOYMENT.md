# Deployment guide

How to put Sahyadri Pearls online. Everything runs in Mumbai so customer data stays in India.

| Part | Service | Region |
|---|---|---|
| Website (`apps/web`), at `/` | Vercel, service `web` | Mumbai (`bom1`) |
| Admin and partner panels (`apps/admin`), at `/admin` | Vercel, service `admin` | Mumbai (`bom1`) |
| API (`apps/api`), at `/api` and `/media` | Vercel, service `api` (container from `Dockerfile.vercel`) | Mumbai (`bom1`) |
| Background worker (queues, reminders, timers) | Fly.io (same `Dockerfile.vercel` image) | Mumbai (`bom`) |
| Database migrations | GitHub Actions (**Database migrations** workflow) | — |
| Database | Neon or Supabase PostgreSQL 16 | AWS `ap-south-1` (Mumbai) |
| Job queue | Upstash Redis | `ap-south-1` |
| Photos and documents | AWS S3 | `ap-south-1` |
| Backups | GitHub Actions → a separate S3 bucket | `ap-south-1` |

Everything public lives on **one address**, for example `www.sahyadripearls.in`:

- `https://www.sahyadripearls.in/` is the shop.
- `https://www.sahyadripearls.in/admin` is the admin.
- `https://www.sahyadripearls.in/api/v1/…` is the API, used by the browser, the mobile apps and the payment/WhatsApp webhooks.

The root `vercel.json` sets this up. The website's server-side page rendering reaches the API through a Vercel **binding**: Vercel injects the API's internal address into `API_INTERNAL_URL` itself, so never set that variable by hand.

Use your own domain in place of `sahyadripearls.in` below.

Never paste keys or passwords into chat, email or the code. They go only into each service's secret settings.

---

## 0. Presentation site (demo mode), the quick way

For showing every platform before the real launch. It needs only the existing Vercel project and a free Neon database: no Redis, Fly, S3, email, SMS or payment keys. It runs with `DEMO_MODE=true` (DECISIONS D66):
- sample pearls, partners and a little recent business are loaded on the first start;
- every sign-in code is `123456`;
- payments use the test sandbox;
- every page carries a "Demo site" ribbon;
- the API refuses to start if a live payment or messaging key is present.

1. **Neon** (free): create a project in **AWS Asia Pacific (Mumbai)**. Under **Connection string**, turn **Connection pooling off** and copy the string.
2. **GitHub** → **Settings → Secrets and variables → Actions** → add `PROD_DATABASE_URL` = that string. Then **Actions → Database migrations → Run workflow**, and wait for the green tick.
3. **Vercel** → the project → **Settings → Environment Variables** (Production). Add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the same Neon string |
   | `DEMO_MODE` | `true` |
   | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `APP_SECRET` | three different random values: run `openssl rand -hex 32` three times, or use any password generator (at least 32 characters) |
   | `WEB_URL` | `https://<your-project>.vercel.app` |
   | `ADMIN_URL` | `https://<your-project>.vercel.app/admin` |
   | `API_URL` | `https://<your-project>.vercel.app` |

4. **Deployments** → the latest one → **Redeploy**. The first start takes about a minute longer while the sample data loads.
5. Open `https://<your-project>.vercel.app/platforms`: one card per platform with its link, demo sign-in and a QR code for phones.

The phone apps appear in the browser at `/apps/customer` and `/apps/delivery`. The website build makes these previews (`scripts/demo/export-apps.sh`); if one cannot be built, its link opens the website or the web delivery panel instead.

Uploaded photos live on the container's disk in demo mode and disappear on the next deploy. The sample photos are redrawn on every start.

**From demo to the real shop:** remove `DEMO_MODE`, use a fresh database, and follow the steps below.

## 1. Accounts to create

1. GitHub: the code lives in `Pearl2026-app/pearl-2026`.
2. Vercel (Pro plan for a business site), connected to GitHub.
3. Fly.io, with a payment card (Mumbai machines are paid).
4. Neon **or** Supabase: one PostgreSQL project in AWS Mumbai.
5. Upstash: one Redis database in `ap-south-1`.
6. AWS: two S3 buckets in `ap-south-1`.
   - `sahyadri-media` holds photos. Public read on `public/*` only.
   - `sahyadri-backups` stays private, with versioning on.
   - Create one IAM user per bucket, each with access to its own bucket only.

## 2. Database

1. In Neon/Supabase, create the database.
2. Copy two connection strings: the **pooled** one for the app and the **direct** one for migrations and backups. They may be the same.

## 3. Secrets to generate

Run this three times on any computer:

```bash
openssl rand -hex 32
```

The three values are `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `APP_SECRET`. Each must be different.

## 4. GitHub secret for migrations (before the first deploy)

1. In GitHub, open **Settings → Secrets and variables → Actions** and add `PROD_DATABASE_URL` (the direct connection string).
2. Then open **Actions → Database migrations → Run workflow** once. This creates the tables.

From then on, every push to `main` that changes `packages/db/prisma` applies the new migrations by itself.

Vercel deploys at the same time, so the old code must work with each new migration. Add first (new columns nullable or with a default), and remove in a later release.

## 5. One Vercel project (website, admin and API)

1. In Vercel, **Add New → Project**, pick `Pearl2026-app/pearl-2026`, and leave **Root Directory** at the repository root. Vercel reads the root `vercel.json` and finds the three services: `web`, `admin` and `api`.
2. Under **Settings → Environment Variables** (Production), add the API's settings. The Next.js services ignore what they do not use.

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | pooled connection string |
   | `REDIS_URL` | `rediss://…` from Upstash |
   | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `APP_SECRET` | from step 3 |
   | `WEB_URL` | `https://www.sahyadripearls.in` |
   | `ADMIN_URL` | `https://www.sahyadripearls.in/admin` |
   | `API_URL` | `https://www.sahyadripearls.in` |
   | `RUN_WORKERS` | `false` (the worker runs on Fly, step 6) |
   | `QUEUE_MODE` | `redis` |
   | `STORAGE_DRIVER`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `s3`, `ap-south-1`, `sahyadri-media`, … |
   | `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | your mail settings |

   Do **not** add `API_INTERNAL_URL`, because Vercel provides it through the binding.
3. Deploy. Then check it:

   ```bash
   curl https://<project>.vercel.app/api/v1/health   # {"ok":true}
   ```

4. Under **Settings → Domains**, add `www.sahyadripearls.in`, plus the bare domain redirecting to `www`.

Sign-in cookies belong to the one domain. `COOKIE_DOMAIN` stays empty.

## 6. Background worker on Fly.io

The worker sends messages, runs reminders and timers, and works the job queue. It has no public address.

From a copy of the repository on your computer:

```bash
fly auth login
fly apps create sahyadri-pearls-worker
fly secrets set --app sahyadri-pearls-worker \
  DATABASE_URL='postgresql://…' REDIS_URL='rediss://…' \
  JWT_ACCESS_SECRET='…' JWT_REFRESH_SECRET='…' APP_SECRET='…' \
  WEB_URL='https://www.sahyadripearls.in' ADMIN_URL='https://www.sahyadripearls.in/admin' API_URL='https://www.sahyadripearls.in' \
  S3_BUCKET='sahyadri-media' S3_ACCESS_KEY_ID='…' S3_SECRET_ACCESS_KEY='…' \
  EMAIL_PROVIDER='smtp' EMAIL_FROM='Sahyadri Pearls <care@sahyadripearls.in>' SMTP_HOST='…' SMTP_PORT='587' SMTP_USER='…' SMTP_PASSWORD='…'
fly deploy --config apps/api/fly.toml .
fly scale count worker=1 --app sahyadri-pearls-worker
```

Use the **same values** as in Vercel. When you add a key later (Razorpay, WhatsApp, SMS…), set it in **both** places.

### Create the owner login (once)

```bash
fly ssh console --app sahyadri-pearls-worker -C "sh -c 'cd /repo/packages/db && SEED_MODE=production SEED_ADMIN_EMAIL=owner@sahyadripearls.in SEED_ADMIN_NAME=\"Owner\" SEED_ADMIN_PHONE=+9198xxxxxxxx SEED_ADMIN_PASSWORD=\"a long password\" npx tsx seed/seed.ts'"
```

This creates the settings, message templates, categories, draft legal pages and one Super Admin. It loads **no sample data**, and running it again changes nothing. The sample-data seed refuses to run in production.

## 6a. DNS

At your domain registrar:

- `www`: the CNAME Vercel shows.
- Bare domain: the record Vercel shows (it redirects to `www`).

The admin and the API need no records of their own.

## 7. First sign-in and setup (in the admin)

1. Sign in at `https://www.sahyadripearls.in/admin` with the owner email and password. The code arrives by email, or by SMS once SMS is set up.
2. Under **Settings → Business details (printed on invoices)**, enter the legal name, GSTIN, registered address, phone, WhatsApp number and the app store links.
3. Add **Cities**, then **WhatsApp numbers & routing**, then **Vendors**, **Franchises**, **Manufacturers** and **Delivery partners**.
4. Under **Staff & partner logins**, create logins for the team.
5. Add **Farms**, **Collections** and **Products** with real photos (or use **Products → Import CSV**).
6. Under **Pages & legal**, replace the five draft legal pages with the approved texts. **Do this before launch.**
7. Add **Coupons**, **Banners** and home page blocks as wanted.

## 8. Payments (Razorpay)

Until the live keys are set, the site offers **cash on delivery only**. The test gateway is never used in production.

1. In the Razorpay dashboard, create live API keys.
2. Add a webhook:
   - URL: `https://www.sahyadripearls.in/api/v1/webhooks/payment`
   - Events: `payment.captured`, `payment.failed`, `refund.processed`
   - Choose a webhook secret.
3. Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in Vercel (**Environment Variables**, then **Redeploy**) and on Fly:

   ```bash
   fly secrets set --app sahyadri-pearls-worker RAZORPAY_KEY_ID='…' RAZORPAY_KEY_SECRET='…' RAZORPAY_WEBHOOK_SECRET='…'
   ```
4. Place a ₹1 test order on the live site, then refund it from **Admin → Orders**.

## 9. Optional services (each has a fallback until set)

Set these in Vercel **and** on the Fly worker.

| Service | Secrets | Without it |
|---|---|---|
| WhatsApp Business API | `WHATSAPP_PROVIDER=cloudapi`, `WHATSAPP_API_*`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_*` | Messages are logged with a click-to-send link; email goes out |
| SMS (DLT registered) | `SMS_PROVIDER=http`, `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_DLT_*` | Codes go by email for staff. **Customers need SMS to sign in.** |
| Push (Firebase) | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | Notifications are recorded but not delivered |
| AI for Ring Finder | `AI_PROVIDER=openai-compatible`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` | Plain filtered results with simple reasons |
| CDN for images | `CDN_BASE_URL` | Images are served from S3 directly |

## 9a. Mobile apps

1. Create an Expo account and, once, `eas init` in `apps/mobile-customer` and in `apps/mobile-delivery`.
2. `eas build --profile production --platform all` in each app folder. The API and website addresses are in each `eas.json`.
3. `eas submit` sends the builds to Google Play (internal testing first) and App Store Connect. This needs your Google Play developer account and Apple Developer Program membership.
4. So that website links open the customer app, add two environment variables to the Vercel project and redeploy:
   - `ANDROID_APP_SHA256`: the app signing certificate fingerprint (Play Console → App integrity).
   - `APPLE_TEAM_ID`: your Apple team id (Apple Developer → Membership).
5. Put the store links in **Admin → Settings → App store links**; the website footer then shows them.

## 10. Backups

In GitHub, open **Settings → Secrets and variables → Actions** and add:

- `PROD_DATABASE_URL`: already added in step 4.
- `BACKUP_TARGET`: `s3://sahyadri-backups/db`
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: the backups IAM user.

The **Backups** workflow runs every night at 02:00 IST:

1. It dumps the database to S3, keeping 30 days. Change this with the `BACKUP_RETENTION_DAYS` variable.
2. It restores that night's backup into a throwaway database and checks it.

A red run means the last backup cannot be trusted, so look at it the same day. Start it by hand once after setup (**Actions → Backups → Run workflow**) to confirm it works.

To restore for real, see [RUNBOOK.md](RUNBOOK.md) (`scripts/backup/restore.sh`, into a new database first).

## 11. Launch checklist

- [ ] `https://www…/api/v1/health` returns `{"ok":true}`.
- [ ] The website and `/admin` load over HTTPS on your domain.
- [ ] **Database migrations** workflow green; Fly worker running (`fly status --app sahyadri-pearls-worker`).
- [ ] Owner can sign in; Settings filled in (GSTIN, address, WhatsApp, store links).
- [ ] Legal pages replaced with approved text.
- [ ] At least one city, WhatsApp number and delivery partner; products with real photos.
- [ ] Customer sign-in by SMS works (SMS provider set).
- [ ] One COD order placed, packed, delivered from the delivery screen with proof, cash reconciled.
- [ ] Razorpay live: ₹1 order paid, invoice received by email, refunded.
- [ ] Backups workflow green, including the restore test.
- [ ] Search engines: submit `https://www.sahyadripearls.in/sitemap.xml` in Google Search Console.

## Updating the site later

- Push to the main branch. Vercel redeploys the website, admin and API by itself, and the **Database migrations** workflow applies any new migrations.
- Then update the worker: `fly deploy --config apps/api/fly.toml .`, or add the Fly GitHub Action.
