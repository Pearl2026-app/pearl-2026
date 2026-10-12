# Sahyadri Pearls

The Sahyadri Pearls platform: a premium pearl jewellery store (website plus Android and iOS customer apps) and the business platform behind it (central admin, partner panels and a delivery app), on one database and one API.

## Status

Phases 0–6 are built and tested: website, admin and partner panels, API, customer app, delivery app, deployment kit, backups, security review, load test, end-to-end tests and handover documents. Going live needs the owner's accounts and keys; see [`docs/STATUS.md`](docs/STATUS.md) (final report and what is needed from the owner).

## Documents

| Document | For | Contents |
|---|---|---|
| [STATUS.md](docs/STATUS.md) | Everyone | Final report, checklist, what the owner must provide |
| [ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md) | Shop team and partners | Task-by-task guide for each role |
| [TRAINING.md](docs/TRAINING.md) | Trainer | Half-day onboarding: agenda, exercises, troubleshooting, glossary |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Developer | Hosting set-up, app store builds |
| [RUNBOOK.md](docs/RUNBOOK.md) | Developer | Day-to-day operations, incidents, backups and restore |
| [api/API-REFERENCE.md](docs/api/API-REFERENCE.md) | Developer | Every API route and who may call it ([openapi.json](docs/api/openapi.json)) |
| [QUALITY.md](docs/QUALITY.md) | Developer | Load test, end-to-end tests, Lighthouse results |
| [STORE-LISTING.md](docs/STORE-LISTING.md) | Owner | Play Store and App Store listing text and privacy answers |
| [PERMISSION-MATRIX.md](docs/PERMISSION-MATRIX.md) | Owner, developer | Roles, modules, actions and data scope |
| [DECISIONS.md](docs/DECISIONS.md) · [OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) | Owner | Choices made, and what still needs the owner's answer |
| [SPEC.md](docs/SPEC.md) · [PHASE-PLAN.md](docs/PHASE-PLAN.md) · [SITEMAP.md](docs/SITEMAP.md) · [DATA-MODEL.md](docs/DATA-MODEL.md) · [API-OUTLINE.md](docs/API-OUTLINE.md) · [DESIGN-DIRECTION.md](docs/DESIGN-DIRECTION.md) | Developer | The original specification and planning package |

## Run it locally

Needs Node 22, pnpm 9.12 (`corepack enable`), PostgreSQL 16 and Redis 7.

```bash
pnpm install
cp .env.example apps/api/.env                 # development values; no real keys needed
echo 'DATABASE_URL=postgresql://sahyadri:sahyadri@localhost:5432/sahyadri' > packages/db/.env
pnpm db:generate && pnpm db:migrate && pnpm db:seed   # sample catalogue, orders and logins
pnpm dev                                      # API :4000, website :3000, admin :3001/admin
```

Sample logins are listed in [ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md#sample-logins-sample-data-only). In development every sign-in code is `123456` (`DEV_FIXED_OTP`), and payments use the built-in sandbox. Each third-party service falls back safely until its keys are set (see `.env.example`).

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` (browser journeys), `pnpm load` (load test against a local or staging API), `pnpm api:docs` (regenerate the API reference). The mobile apps: see [`apps/mobile-customer/README.md`](apps/mobile-customer/README.md) and [`apps/mobile-delivery/README.md`](apps/mobile-delivery/README.md).

## Repository layout

```
apps/web               customer storefront (Next.js)
apps/admin             central admin + City Manager, Vendor, Franchise, Delivery panels (Next.js)
apps/api               NestJS REST API, BullMQ workers, webhooks
apps/mobile-customer   customer app (React Native + Expo)
apps/mobile-delivery   delivery partner app (React Native + Expo)
packages/db            Prisma schema, migrations, seed data
packages/shared        types, validation, permission rules, price and GST maths
packages/ui            design tokens and shared components
packages/api-client    typed API client used by both apps
e2e                    Playwright end-to-end journeys
scripts                backups, load test, API reference, app icons
docs                   planning, reference and runbooks
```

## Stack

pnpm workspaces + Turborepo · TypeScript throughout · Next.js · NestJS · PostgreSQL + Prisma · Redis + BullMQ · React Native + Expo · Tailwind CSS · S3-compatible storage behind a CDN · Docker, hosted in an India cloud region.

Configuration is documented in [`.env.example`](.env.example).

---

Developed by Sahyadri Pearls · © 2026 Sahyadri Pearls. All Rights Reserved.
