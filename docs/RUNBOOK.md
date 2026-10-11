# Runbook

What to do when something needs attention in production. Commands assume the setup in [DEPLOYMENT.md](DEPLOYMENT.md).

## Daily checks
- **Backups** workflow green in GitHub Actions (backup and restore test).
- Admin → **Message log**: failed WhatsApp/SMS/email messages (resend from there).
- Admin → **Payments**: cash on delivery not yet received at the office.

## The site is down
1. `curl https://www.sahyadripearls.in/api/v1/health`. If it fails, open the Vercel project's **Deployments → Logs** and filter by the `api` service.
2. Website, admin and API share one Vercel project: roll back all three with **Instant Rollback** (or **Promote to production** on the previous deployment).
3. Messages, reminders or timers not running: `fly status --app sahyadri-pearls-worker` and `fly logs --app sahyadri-pearls-worker`; restart with `fly apps restart sahyadri-pearls-worker`.

## Roll back a bad release
- Website, admin and API: Vercel **Instant Rollback** to the previous deployment.
- Worker:
  ```bash
  fly releases --app sahyadri-pearls-worker --image   # find the previous good image
  fly deploy --config apps/api/fly.toml --image <previous image ref>
  ```
Migrations only add; a rollback keeps the newer database columns, which older code ignores. If a migration itself is wrong, restore (below) into a **new** database and point `DATABASE_URL` at it after checking.

## Restore a backup
Never restore over the live database directly.
1. Create a new empty database in Neon/Supabase (Mumbai).
2. List backups: `aws s3 ls s3://sahyadri-backups/db/`
3. Restore:
   ```bash
   ./scripts/backup/restore.sh s3://sahyadri-backups/db/sahyadri-<date>.dump 'postgresql://…new database…'
   ```
   It checks the file's checksum and refuses a non-empty target.
4. Check the restored data (orders, products) in a staging copy of the admin, or with `psql`.
5. Switch: update `DATABASE_URL` in Vercel (then **Redeploy**) and on Fly (`fly secrets set --app sahyadri-pearls-worker DATABASE_URL='…new…'`), and update `PROD_DATABASE_URL` in GitHub.
6. Orders placed after the backup time are not in it: compare with Razorpay's dashboard and the message log, and re-enter them as manual orders.

## A payment shows paid at Razorpay but not in the admin
Webhooks are retried by Razorpay. In the Razorpay dashboard, open the payment's webhook log; re-send it. The API ignores duplicates, and a payment that arrives after the piece was released marks the order **Failed** and refunds automatically (see DECISIONS D15).

## Rotate a secret
Secrets live in two places: Vercel **Environment Variables** (then **Redeploy**) and the Fly worker (`fly secrets set --app sahyadri-pearls-worker …`). Always change both.
- JWT secrets: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`. Everyone signs in again.
- `APP_SECRET`: also invalidates codes being entered and private file links; harmless otherwise.
- Provider keys: replace at the provider, then update both places.
- Database password: change in Neon/Supabase, then update `DATABASE_URL` in Vercel and on Fly, and `PROD_DATABASE_URL` in GitHub.

## Someone leaves the team
Admin → **Staff & partner logins** → deactivate. Their sessions end immediately; history stays.

## Scale up
- More API capacity: Vercel scales the `api` service by itself; raise its CPU/memory in the project settings if needed.
- Slow queues (messages late): `fly scale count worker=2 --app sahyadri-pearls-worker`.
- Database: upgrade the Neon/Supabase plan; no code change.
