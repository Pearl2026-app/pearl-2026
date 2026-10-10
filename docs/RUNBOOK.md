# Runbook

What to do when something needs attention in production. Commands assume the setup in [DEPLOYMENT.md](DEPLOYMENT.md).

## Daily checks
- **Backups** workflow green in GitHub Actions (backup and restore test).
- Admin → **Message log**: failed WhatsApp/SMS/email messages (resend from there).
- Admin → **Payments**: cash on delivery not yet received at the office.

## The site is down
1. `curl https://api.sahyadripearls.in/api/v1/health` — if it fails, `fly status --app sahyadri-pearls-api` and `fly logs --app sahyadri-pearls-api`.
2. Restart: `fly machine restart --app sahyadri-pearls-api` (all machines) or `fly apps restart sahyadri-pearls-api`.
3. Website/admin errors only: check the Vercel project's **Deployments → Logs**; roll back with **Promote to production** on the previous deployment.

## Roll back a bad API release
```bash
fly releases --app sahyadri-pearls-api            # find the previous good version
fly deploy --app sahyadri-pearls-api --image <previous image ref from the list>
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
5. Switch: `fly secrets set --app sahyadri-pearls-api DATABASE_URL='…new…'` (restarts the API), and update `PROD_DATABASE_URL` in GitHub.
6. Orders placed after the backup time are not in it: compare with Razorpay's dashboard and the message log, and re-enter them as manual orders.

## A payment shows paid at Razorpay but not in the admin
Webhooks are retried by Razorpay. In the Razorpay dashboard, open the payment's webhook log; re-send it. The API ignores duplicates, and a payment that arrives after the piece was released marks the order **Failed** and refunds automatically (see DECISIONS D15).

## Rotate a secret
- JWT secrets: `fly secrets set JWT_ACCESS_SECRET=… JWT_REFRESH_SECRET=…` — everyone signs in again.
- `APP_SECRET`: also invalidates codes being entered and private file links; harmless otherwise.
- Provider keys: replace at the provider, then `fly secrets set …`.
- Database password: change in Neon/Supabase, then update `DATABASE_URL` on Fly and `PROD_DATABASE_URL` in GitHub.

## Someone leaves the team
Admin → **Staff & partner logins** → deactivate. Their sessions end immediately; history stays.

## Scale up
- More API capacity: `fly scale count app=2 --app sahyadri-pearls-api`.
- Slow queues (messages late): `fly scale count worker=2`.
- Database: upgrade the Neon/Supabase plan; no code change.
