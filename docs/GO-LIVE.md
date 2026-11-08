# Going live: Vercel + Supabase

The shop runs on the **existing Vercel project** (`sahyadri-pearls-demo`, website + admin + API). **Supabase** holds the
database and the photos. Nothing else is needed to open: no Fly.io, no Redis, no AWS account and no terminal.

Setting it up takes about 30 minutes. You do it once, in four websites: Supabase, Gmail, Vercel and the admin.

---

## 1. Supabase: database and photo storage (10 minutes)

1. At supabase.com, click **New project**.
   - Name: `sahyadri-pearls`
   - Region: **South Asia (Mumbai)**
   - Database password: make up a long one and **save it**.
2. When the project is ready, click **Connect** (at the top).
   - Choose **Session pooler**, the one that works everywhere.
   - Copy the URI. It looks like `postgresql://postgres.abcd:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`.
   - Replace `[YOUR-PASSWORD]` with your password.
   - Add this to the end: `?sslmode=require&connection_limit=5`
   - This is your **DATABASE_URL**.
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
| `DATABASE_URL` | the Supabase URI from step 1.2 |
| `SETUP_ON_START` | `true` (creates the tables, the owner login and the signature collection by itself) |
| `SEED_ADMIN_EMAIL` | the owner's email, for the first admin login |
| `SEED_ADMIN_PASSWORD` | a password of 12+ characters with letters and digits |
| `SEED_ADMIN_NAME` | the owner's name |
| `JWT_ACCESS_SECRET` | secret 1 (Claude sends you three long random secrets; or make each with `openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | secret 2 |
| `APP_SECRET` | secret 3 |
| `QUEUE_MODE` | `inline` (reminders and timers run inside the site; no Redis needed) |
| `RUN_WORKERS` | `true` |
| `STORAGE_DRIVER` | `s3` |
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

Then open **Deployments**, click **⋯** on the top one and choose **Redeploy**. When it is ready:

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
| SMS provider (DLT registered) | Customers sign in with a code sent to their phone. | `SMS_PROVIDER=http` and the `SMS_*` variables. Tell Claude which provider you choose (MSG91, Fast2SMS…) to connect it. |
| Domain | The real address. | Vercel → Settings → Domains (the site picks up the new address by itself on the next deploy) |

### Optional extras

- **The 646-piece manufacturer stock list**: set `IMPORT_STOCK_LIST=true` and redeploy. Prices are cost + 35%.
- **Skip the signature collection**: set `IMPORT_SIGNATURE_COLLECTION=false`.
- **Upstash Redis**: for many visitors at once, add Upstash from the Vercel Marketplace. Then set
  `QUEUE_MODE=redis` and `REDIS_URL`.

Each setting is described in full in [DEPLOYMENT.md](DEPLOYMENT.md).
