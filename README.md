# Sahyadri Pearls

The Sahyadri Pearls platform: a premium pearl jewellery store (website plus Android and iOS customer apps) and the business platform behind it (central admin, partner panels and a delivery app), on one database and one API.

## Status

**Phase 0: plan for approval.** The planning package is in [`docs/`](docs). No feature code is written until the client approves it. Live status is in [`docs/STATUS.md`](docs/STATUS.md).

## Planning package

| Document | Contents |
|---|---|
| [PHASE-PLAN.md](docs/PHASE-PLAN.md) | Seven phases, scope, exit criteria, estimates, definition of done |
| [SITEMAP.md](docs/SITEMAP.md) | Every storefront, admin, panel and app screen |
| [DESIGN-DIRECTION.md](docs/DESIGN-DIRECTION.md) | Palette, type, layout, motion, sample screens |
| [DATA-MODEL.md](docs/DATA-MODEL.md) | Entities, relations and rules; draft schema in [`packages/db/prisma/schema.prisma`](packages/db/prisma/schema.prisma) |
| [PERMISSION-MATRIX.md](docs/PERMISSION-MATRIX.md) | Seven roles, modules, actions and data scope |
| [API-OUTLINE.md](docs/API-OUTLINE.md) | REST endpoints, webhooks and provider interfaces |
| [DECISIONS.md](docs/DECISIONS.md) | How source conflicts were resolved, and other choices |
| [OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) | What the client needs to confirm, with assumed defaults |

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
docs                   planning, reference and runbooks
```

## Stack

pnpm workspaces + Turborepo · TypeScript throughout · Next.js · NestJS · PostgreSQL + Prisma · Redis + BullMQ · React Native + Expo · Tailwind CSS · S3-compatible storage behind a CDN · Docker, hosted in an India cloud region.

Configuration is documented in [`.env.example`](.env.example).

---

Developed by Sahyadri Pearls · © 2026 Sahyadri Pearls. All Rights Reserved.
