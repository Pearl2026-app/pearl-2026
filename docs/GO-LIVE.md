# Going live: Vercel + Supabase

The shop runs on the **existing Vercel project** (`sahyadri-pearls-demo`, website + admin + API). **Supabase** holds the
database and the photos. Nothing else is needed to open: no Fly.io, no Redis, no AWS account and no terminal.
The API is a normal Vercel Function, not a container. It works on the free plans, and the owner is moving both to
**Pro** (Vercel Pro about $20 a month, Supabase Pro about $25 a month): see [Pro plans](#pro-plans-what-changes) below.

Setting it up takes about 30 minutes. You do it once, in four websites: Supabase, Gmail, Vercel and the admin.

---

## 1. Supabase: database and photo storage (10 minutes)

1. At supabase.com, click **New project**.
   - Name: `sahyadri-pearls`
   - Region: **South Asia (Mumbai)**
   - Database password: make up a long one and **save it**.
2. When the project is ready, click **Connect** (at the top). You need two addresses from there; in both, replace
   `[YOUR-PASSWORD]` with your password.
   - **Transaction pooler** (port **6543**). It looks like
     `postgresql://postgres.abcd:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`.
     Add this to the end: `?pgbouncer=true&connection_limit=1&sslmode=require`. This is your **DATABASE_URL**: the
     website uses it for every visit, and it copes with many visitors at once.
   - **Session pooler** (port **5432**), the same address with `:5432`. Add `?sslmode=require` to the end. This is your
     **DATABASE_MIGRATE_URL**: only the deploy uses it, to set up and update the tables.
3. Left menu, **Storage**: click **New bucket**.
   - Name: `sahyadri-media`
   - Leave it **private**.
4. Left menu, **Project Settings → Storage**, then under **S3 access keys** click **New access key**. Copy three things:
   - the **Endpoint**, like `https://abcd.supabase.co/storage/v1/s3`
   - the **Access key ID**
   - the **Secret access key**, which is shown only once

> An AWS S3 bucket works the same way, if you prefer it. Leave `S3_ENDPOINT` empty and use the AWS keys instead.

## 2. Gmail: the admin sign-in code (5 minutes)

Every admin sign-in asks for a 6-digit code sent by email, so the site must be able to send email.

1. Use the shop's Gmail account. In **Google Account → Security**, turn on **2-Step Verification**.
2. Search the account settings for **App passwords**. Create one called `Sahyadri website` and copy the 16-letter password.

## 3. Vercel: switch the project from demo to live (10 minutes)

Open the project → **Settings → Environment Variables**. Edit the **Production** values as below, then save.

**Delete** these variables, or set them to `false`: `DEMO_MODE`.

**Add or change** these:

| Name | Value |
|---|---|
| `DATABASE_URL` | the transaction pooler address from step 1.2 (port 6543) |
| `DATABASE_MIGRATE_URL` | the session pooler address from step 1.2 (port 5432) |
| `SETUP_ON_START` | `true` (on each production deploy, the build creates any missing tables, the owner login and the signature collection) |
| `SEED_ADMIN_EMAIL` | the owner's email, for the first admin login |
| `SEED_ADMIN_PASSWORD` | a password of 12+ characters with letters and digits |
| `SEED_ADMIN_NAME` | the owner's name |
| `JWT_ACCESS_SECRET` | secret 1 (Claude sends you three long random secrets; or make each with `openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | secret 2 |
| `APP_SECRET` | secret 3 |
| `QUEUE_MODE` | `inline` (reminders and expiring holds run as visitors arrive, plus the scheduled check; no Redis needed) |
| `STORAGE_DRIVER` | `s3` (required: Vercel Functions keep no files between visits, so photos you upload must go to the bucket) |
| `S3_ENDPOINT` | the Supabase endpoint from step 1.4 |
| `S3_REGION` | `ap-south-1` |
| `S3_BUCKET` | `sahyadri-media` |
| `S3_ACCESS_KEY_ID` | from step 1.4 |
| `S3_SECRET_ACCESS_KEY` | from step 1.4 |
| `EMAIL_PROVIDER` | `smtp` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | the Gmail address |
| `SMTP_PASSWORD` | the 16-letter app password from step 2 |
| `EMAIL_FROM` | `Sahyadri Pearls <the Gmail address>` |

Leave `WEB_URL`, `ADMIN_URL` and `API_URL` out: the site takes its address from Vercel, including your own domain once
it is connected.

Then open **Deployments**, click **⋯** on the top one and choose **Redeploy**. The first deploy takes about 20 minutes
(the build sets up the database). When it is ready:

- `https://<your-site>/api/v1/health` shows `{"ok":true,…}`
- the home page shows the signature collection (51 pieces)

## 4. First sign-in (in the admin)

1. Open `https://<your-site>/admin` and sign in with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. The code comes by email.
2. In Vercel, **delete `SEED_ADMIN_PASSWORD`** now. It is only needed once.
3. In the admin, work through this list:
   1. **Settings → Business details**: legal name, GSTIN, address, phone and WhatsApp number (printed on invoices).
   2. **Cities**, then **WhatsApp numbers & routing**.
   3. **Pages & legal**: replace the five draft policies with the approved texts.
   4. **Products**: check the 51 signature pieces and their prices (they start as "Price on request"), and add farms
      and other pieces.
   5. **Staff & partner logins**: create logins for the team.

## 5. Before taking paid orders

| What | Why | Where |
|---|---|---|
| Razorpay live keys | Card/UPI payments. Without them, customers can still enquire on WhatsApp. | Vercel variables `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; webhook URL `https://<site>/api/v1/webhooks/payment` |
| SMS provider (DLT registered) | Customer accounts sign in with a code sent to their phone. Guest checkout works without it. | `SMS_PROVIDER=http` and the `SMS_*` variables. Tell Claude which provider you choose (MSG91, Fast2SMS…) to connect it. |
| Domain | The real address. | Vercel → Settings → Domains (the site picks up the new address by itself on the next deploy) |

## Pro plans: what changes

Upgrade **Supabase first, then Vercel**. Neither upgrade loses data or takes the site down.

**Supabase Pro** (Organization → Billing → Upgrade to Pro):
- Nothing to change in the shop. The project keeps its addresses and password.
- You get daily backups kept for 7 days (Database → Backups), no pausing after a quiet week, and room for 8 GB of
  data and 100 GB of photos.
- Point-in-time recovery is a paid add-on; daily backups are enough to start.

**Vercel Pro** (Team settings → Billing → Upgrade):
1. Merge the pull request **"Vercel Pro: checks every 5 minutes, longer requests"** on GitHub (one click,
   "Merge pull request"). Merge it only **after** the upgrade: the free plan refuses a check more often than daily, so
   deploys would fail. It changes two settings in `vercel.json`:
   - the background check (`/api/v1/system/tick`) runs every 5 minutes instead of once a night, so reminders, expiring
     checkout holds and live gold/silver rates stay on time even when nobody is visiting;
   - a request may run for up to 2 minutes instead of 1 (large exports and PDFs).
2. Settings → **Billing → Spend management**: set a monthly limit, e.g. $50, so a traffic spike cannot surprise you.
3. Nothing else: the server already runs in **Mumbai** (`bom1`), next to a Supabase project in Mumbai.

Check after the merge: Vercel → the project → **Settings → Cron Jobs** lists the check as "every 5 minutes", and
`https://<your-site>/api/v1/health` still shows `{"ok":true,…}`.

### Optional extras

- **The 646-piece manufacturer stock list**: set `IMPORT_STOCK_LIST=true` and redeploy. Prices are cost + 35%.
- **Skip the signature collection**: set `IMPORT_SIGNATURE_COLLECTION=false`.
- **Upstash Redis**: for many visitors at once, add Upstash from the Vercel Marketplace. Then set
  `QUEUE_MODE=redis` and `REDIS_URL`.

Each setting is described in full in [DEPLOYMENT.md](DEPLOYMENT.md).
