# apps/mobile-delivery — Delivery partner app (Android and iOS)

React Native with Expo (SDK 57) and expo-router. Uses the shared `@sahyadri/api-client` (token sign-in).

## What it does
- Sign in with the partner's mobile number and a one-time code.
- **To deliver** / **Completed** lists, cash to hand over at the office.
- A job: call the customer, open Maps, one tap for Picked up → Start delivery.
- Proof of delivery: handover photo (camera), the customer's code or a finger signature, cash collected for COD. Location is saved with it when allowed.
- Could not deliver / Return to store need a reason.
- **No signal:** steps are saved on the phone (photos copied to app storage) and sent in order when the signal returns. Each step has an event id, so nothing is applied twice; a step the server refuses is shown, not retried (`src/queue.ts`, tested in `test/queue.test.ts`).
- Push notification for each new assignment; tapping it opens the job.

## Run
```bash
pnpm --filter @sahyadri/mobile-delivery start          # Expo dev server (API at http://localhost:4000)
EXPO_PUBLIC_API_URL=http://192.168.1.10:4000/api/v1 pnpm --filter @sahyadri/mobile-delivery start   # phone on the same Wi-Fi
pnpm --filter @sahyadri/mobile-delivery test
```
Test login (sample data): a delivery partner phone from `packages/db/seed`, code shown in the API log in development.

## Release
`eas build --profile production` then `eas submit` (needs the owner's Google Play and Apple developer accounts). The API address is set per profile in `eas.json`. Icons: `node scripts/brand/make-app-icons.mjs`.
