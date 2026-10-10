# Deployment guide

How to put Sahyadri Pearls online. Everything runs in Mumbai so customer data stays in India.

| Part | Service | Region |
|---|---|---|
| Website (`apps/web`) | Vercel | Mumbai (`bom1`) |
| Admin and partner panels (`apps/admin`) | Vercel | Mumbai (`bom1`) |
| API and background worker (`apps/api`) | Fly.io (Docker) | Mumbai (`bom`) |
| Database | Neon or Supabase PostgreSQL 16 | AWS `ap-south-1` (Mumbai) |
| Job queue | Upstash Redis | `ap-south-1` |
| Photos and documents | AWS S3 | `ap-south-1` |
| Backups | GitHub Actions → a separate S3 bucket | `ap-south-1` |

Example addresses used below: `www.sahyadripearls.in` (website), `admin.sahyadripearls.in` (admin), `api.sahyadripearls.in` (API). Use your own domain.

Never paste keys or passwords into chat, email or the code. They go only into each service's secret settings.

---

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

1. In Neon/Supabase, create the database. Copy its **connection string**: the pooled one for the app, the direct one for migrations if they differ.
2. Keep it for step 4. Migrations run automatically on every API deploy.

## 3. Secrets to generate

Run this three times on any computer:

```bash
openssl rand -hex 32
```

The three values are `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `APP_SECRET`. Each must be different.

## 4. API and worker on Fly.io

From a copy of the repository on your computer:

```bash
fly auth login
fly apps create sahyadri-pearls-api
fly secrets set --app sahyadri-pearls-api \
  DATABASE_URL='postgresql://…' \
  REDIS_URL='rediss://…' \
  JWT_ACCESS_SECRET='…' JWT_REFRESH_SECRET='…' APP_SECRET='…' \
  WEB_URL='https://www.sahyadripearls.in' \
  ADMIN_URL='https://admin.sahyadripearls.in' \
  API_URL='https://api.sahyadripearls.in' \
  S3_BUCKET='sahyadri-media' S3_ACCESS_KEY_ID='…' S3_SECRET_ACCESS_KEY='…' \
  EMAIL_PROVIDER='smtp' EMAIL_FROM='Sahyadri Pearls <care@sahyadripearls.in>' SMTP_HOST='…' SMTP_PORT='587' SMTP_USER='…' SMTP_PASSWORD='…'
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile .
fly scale count app=1 worker=1 --app sahyadri-pearls-api
fly certs add api.sahyadripearls.in --app sahyadri-pearls-api
```

Each deploy first runs the database migrations (`release_command`), then starts the new version. Check it is healthy:

```bash
curl https://api.sahyadripearls.in/api/v1/health   # {"ok":true}
```

### Create the owner login (once)

```bash
fly ssh console --app sahyadri-pearls-api -C "sh -c 'cd /repo/packages/db && SEED_MODE=production SEED_ADMIN_EMAIL=owner@sahyadripearls.in SEED_ADMIN_NAME=\"Owner\" SEED_ADMIN_PHONE=+9198xxxxxxxx SEED_ADMIN_PASSWORD=\"a long password\" npx tsx seed/seed.ts'"
```

This creates the settings, message templates, categories, draft legal pages and one Super Admin. It loads **no sample data**. Running it again changes nothing. The sample-data seed refuses to run in production.

## 5. Website and admin on Vercel

Create **two** Vercel projects from the same GitHub repository.

| Setting | Website | Admin |
|---|---|---|
| Root Directory | `apps/web` | `apps/admin` |
| Framework | Next.js (from `vercel.json`) | Next.js |
| Region | Mumbai (from `vercel.json`) | Mumbai |
| Environment variable `API_URL` | `https://api.sahyadripearls.in` | `https://api.sahyadripearls.in` |
| Domain | `www.sahyadripearls.in` (+ redirect the bare domain) | `admin.sahyadripearls.in` |

Each site forwards `/api/v1/*` to the API from its own address. Sign-in cookies therefore belong to the site the visitor is on, and `COOKIE_DOMAIN` stays empty.

## 6. DNS

At your domain registrar:

- `www`: the CNAME Vercel shows for the website.
- `admin`: the CNAME Vercel shows for the admin.
- `api`: the records `fly certs add` printed.
- Bare domain: the record Vercel shows (redirects to `www`).

## 7. First sign-in and setup (in the admin)

1. Sign in at `https://admin.sahyadripearls.in` with the owner email and password. The code arrives by email, or by SMS once SMS is set up.
2. Under **Settings → Store**, enter the legal name, GSTIN, registered address, phone, WhatsApp number and the app store links.
3. Add **Cities**, then **WhatsApp numbers & routing**, then **Vendors**, **Franchises**, **Manufacturers** and **Delivery partners**.
4. Under **Staff & partner logins**, create logins for the team.
5. Add **Farms**, **Collections** and **Products** with real photos (or use **Products → Import CSV**).
6. Under **Pages & legal**, replace the five draft legal pages with the approved texts. **Do this before launch.**
7. Add **Coupons**, **Banners** and home page blocks as wanted.

## 8. Payments (Razorpay)

Until the live keys are set, the site offers **cash on delivery only**. The test gateway is never used in production.

1. In the Razorpay dashboard, create live API keys.
2. Add a webhook:
   - URL: `https://api.sahyadripearls.in/api/v1/webhooks/payment`
   - Events: `payment.captured`, `payment.failed`, `refund.processed`
   - Choose a webhook secret.
3. Set the keys and redeploy:

   ```bash
   fly secrets set --app sahyadri-pearls-api RAZORPAY_KEY_ID='…' RAZORPAY_KEY_SECRET='…' RAZORPAY_WEBHOOK_SECRET='…'
   ```

   (Setting secrets restarts the app.)
4. Place a ₹1 test order on the live site, then refund it from **Admin → Orders**.

## 9. Optional services (each has a fallback until set)

| Service | Secrets | Without it |
|---|---|---|
| WhatsApp Business API | `WHATSAPP_PROVIDER=cloudapi`, `WHATSAPP_API_*`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_*` | Messages are logged with a click-to-send link; email goes out |
| SMS (DLT registered) | `SMS_PROVIDER=http`, `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_DLT_*` | Codes go by email for staff. **Customers need SMS to sign in.** |
| Push (Firebase) | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | Notifications are recorded but not delivered |
| AI for Ring Finder | `AI_PROVIDER=openai-compatible`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` | Plain filtered results with simple reasons |
| CDN for images | `CDN_BASE_URL` | Images are served from S3 directly |

## 10. Backups

In GitHub, open **Settings → Secrets and variables → Actions** and add:

- `PROD_DATABASE_URL`: the direct (non-pooled) connection string.
- `BACKUP_TARGET`: `s3://sahyadri-backups/db`
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: the backups IAM user.

The **Backups** workflow runs every night at 02:00 IST:

1. It dumps the database to S3, keeping 30 days. Change this with the `BACKUP_RETENTION_DAYS` variable.
2. It restores that night's backup into a throwaway database and checks it.

A red run means the last backup cannot be trusted, so look at it the same day. Start it by hand once after setup (**Actions → Backups → Run workflow**) to confirm it works.

To restore for real, see [RUNBOOK.md](RUNBOOK.md) (`scripts/backup/restore.sh`, into a new database first).

## 11. Launch checklist

- [ ] `https://api…/api/v1/health` returns `{"ok":true}`.
- [ ] Website and admin load over HTTPS on their own domains.
- [ ] Owner can sign in; Settings filled in (GSTIN, address, WhatsApp, store links).
- [ ] Legal pages replaced with approved text.
- [ ] At least one city, WhatsApp number and delivery partner; products with real photos.
- [ ] Customer sign-in by SMS works (SMS provider set).
- [ ] One COD order placed, packed, delivered from the delivery screen with proof, cash reconciled.
- [ ] Razorpay live: ₹1 order paid, invoice received by email, refunded.
- [ ] Backups workflow green, including the restore test.
- [ ] Search engines: submit `https://www.sahyadripearls.in/sitemap.xml` in Google Search Console.

## Updating the site later

- Push to the main branch.
- Vercel redeploys the website and admin by itself.
- For the API, run `fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile .`, or add the Fly GitHub Action.
- Migrations run before the new version starts.
