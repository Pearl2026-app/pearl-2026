# Hosting on Hostinger (Web App, Business plan)

The whole shop runs as **one** Hostinger Web App on one address: the website, `/admin` and the API, behind a small
router (`scripts/hostinger/start.mjs`), the same split `vercel.json` makes. The database stays where it is (the
Postgres used on Vercel); Hostinger only runs the code.

## Upload instead of Git

While a collaborator manages the account, Hostinger switches Git deployment off. Then make an archive with
`bash scripts/hostinger/pack.sh` (add `NO_VIDEOS=1` to stay under a 10 MB upload) and choose **Upload your files**.
Inside the archive, `npm run build` runs `scripts/hostinger/build.sh`, because the form only offers the standard script
names; the entry file is `scripts/hostinger/start.mjs`.

## Create the app (hPanel → Websites → Web Apps → Get started)

1. Domain: **Use temporary domain** to test first (a real domain such as `shop.sahyadripearls.com` can be connected later).
2. Source: **GitHub**, repository `Pearl2026-app/pearl-2026`, branch `ring-box` (later `main`). The owner authorises
   Hostinger's GitHub access himself.
3. Build settings:
   - Node.js version: **22** (20.11 or newer)
   - Root directory: the repository root (`/` or empty)
   - Install command: `npx -y pnpm@9.12.0 install --frozen-lockfile` (if the form has one; otherwise leave it to the build)
   - Build command: `npm run hostinger:build`
   - Start command / entry file: `npm start` (runs `scripts/hostinger/start.mjs`)
4. Environment variables: copy them from Vercel (project `sahyadri-pearls-demo` → Settings → Environment Variables,
   Production) and add:

| Variable | Value |
| --- | --- |
| `PUBLIC_URL` | the app's address, e.g. `https://<temporary-domain>` (no trailing slash) |
| `DATABASE_URL` | the same database string as on Vercel |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `APP_SECRET` | the same as on Vercel (16+ characters each) |
| `DEMO_MODE` / `SETUP_ON_START` | as on Vercel (`DEMO_MODE=true` for the demo) |
| everything else set on Vercel | the same values (payments, storage, mail, Redis if used) |

Do **not** set `DEV_FIXED_OTP` (refused in production), `API_INTERNAL_URL`, `WEB_URL`, `ADMIN_URL` or `API_URL`:
the start script sets those from `PUBLIC_URL`. Uploaded images go to `~/sahyadri-media` unless `STORAGE_LOCAL_DIR`
or S3 settings say otherwise.

## Check

`/` (shop), `/admin` (sign-in), `/api/v1/site` (JSON), `/pearl-stories/the-farm`. Tested locally on 11 Nov 2026:
all four answer 200 from the one app.
