# Permission Matrix

This is defined once in `packages/shared/permissions` and imported by the API (guards and query scoping) and by every interface (menus and buttons). **The API is the enforcement point.** The interfaces only use the matrix to decide what to show.

## Roles and sign-in

| Role | Sign-in | Scope (applied to every query) |
|---|---|---|
| Super Admin | Email + password + OTP | Global |
| Admin / Staff | Email + password + OTP | Global, limited to the modules and actions granted in `StaffPermission` |
| City Manager | Email + password + OTP | `cityId = user.cityId` |
| Vendor | Email or phone + OTP | `vendorId = user.vendorId` |
| Franchise | Email or phone + OTP | `franchiseId = user.franchiseId` (enquiries and orders assigned to them) |
| Delivery Partner | Phone + OTP | `Delivery.deliveryPartnerId = user.deliveryPartnerId` |
| Customer | Phone + OTP | `customerId = user.customer.id` |

Staff OTP goes by SMS when a phone is on file, otherwise by email (the fallback).

## How scope is enforced

1. **Authentication guard.** Verifies the JWT and loads the user. Rejects users who are inactive or blocked.
2. **Permission guard.** Each route declares `@Requires(module, action)`. The guard checks the role's fixed grants, or `StaffPermission` for STAFF. Failure returns `403`.
3. **Scope at the repository layer.** Every service method receives a `Scope` object built from the user, and every Prisma query is built with `where: { ...scopeFilter(scope, entity) }`. There is no unscoped repository method reachable from a controller.
4. **Out-of-scope id returns `404 Not Found`, never `403`.** Fetching `/orders/:id` for an order in another city returns the same response as a non-existent id, so ids can't be probed.
5. **Writes re-check scope.** Assignments must also stay in scope: a franchise can only assign a delivery partner linked to its city, and a City Manager can only set the city to their own.
6. **Field-level rules.** For example, a vendor can only move an order status up to `PACKED`. Cost fields (metal, labour, pearl cost, margin) are hidden from Vendor, Franchise and Customer responses.

## Module × role matrix

V = view · C = create · E = edit · D = archive/delete · — = no access · *own* = own records only · *city* = own city only · *asg* = assigned to them

| Module | Super Admin | Staff* | City Manager | Vendor | Franchise | Delivery | Customer |
|---|---|---|---|---|---|---|---|
| Dashboard | V | grant | V *city* | V *own* | V *own* | — | — |
| Customers (user DB) | VCED | grant | V *city* | — | V *asg* (contact only) | — | V/E *self* |
| Staff & partner users | VCED | grant | — | — | — | — | — |
| Categories / Collections / Farms | VCED | grant | V | V | V | — | V (public) |
| Products | VCED | grant | V *city* | VCE *own* (goes to approval) | V | — | V (published) |
| Product approval | V/E | grant | — | — | — | — | — |
| Orders | VCED | grant | VCE *city* | V/E *own*, status ≤ Packed | VCE *asg* | V/E *asg* (via Delivery) | VC *own* |
| Customized orders | VCED | grant | VCE *city* | — | V *asg* | — | V *own* |
| Purchase orders / Manufacturers | VCED | grant | V *city* | — | — | — | — |
| Enquiries | VCED | grant | VCE *city* | — | VCE *asg* (stage, notes, convert) | — | C (public) |
| WhatsApp numbers / templates / routing | VCED | grant | — | — | — | — | — |
| Content, banners, pages, FAQ | VCED | grant | — | — | — | — | V (public) |
| Careers / applications | VCED | grant | — | — | — | — | C apply |
| Coupons & offers | VCED | grant | V | — | — | — | V (public offers) |
| Push notifications | VCED | grant | — | — | — | — | — |
| Cities | VCED | grant | V *city* | — | — | — | V (public) |
| Vendors / Franchises / Delivery partners | VCED | grant | V *city* (+ assign) | V *self* | V *self* | V *self* | — |
| Pearl pricing & calculator | VCED | grant | V calc | — | V calc | — | — |
| Payments / COD reconciliation | VCED | grant | V *city* | — | V *asg* | C COD amount *asg* | V *own* |
| Returns & cancellations | VCED | grant | VE *city* | — | V *asg* | E pickup *asg* | C *own* |
| Reviews moderation | VCED | grant | — | — | — | — | C *own* (delivered) |
| Reports | V | grant | V *city* | V *own* | V *own* | V *own* history | — |
| Settings & feature flags | VCED | grant | — | — | — | — | — |
| Audit log | V | grant | — | — | — | — | — |
| Commissions & settlements (flag off) | VCED | grant | — | V *own* (hidden until flag on) | — | — | — |

\* Staff get only the modules and actions a Super Admin grants. No staff grant can include **Staff & partner users** with create/edit on SUPER_ADMIN accounts, **Settings → feature flags**, or **Audit log** delete. The audit log has no delete action for anyone.

Customer access is always to their own records: their account, addresses, cart, wishlist, orders, invoices, returns, reviews and referral code.

## Negative tests (Phase 1, extended each phase)

An integration test suite signs in as each of the seven roles against seeded data (two cities, two vendors, two franchises, two delivery partners, two customers) and asserts:

| Role | Must fail |
|---|---|
| Staff (only Products granted) | Read orders; edit settings; read audit log; create a staff user |
| Staff (Products view only) | Create, edit or archive a product |
| City Manager (Pune) | Get a Mumbai order or enquiry by id → 404; list returns no Mumbai rows; change an order's city to Mumbai; read settings; global reports |
| Vendor A | Get or edit Vendor B's product → 404; set an order to Out for Delivery; see cost fields of other vendors; publish without approval |
| Franchise A | Get an enquiry or order assigned to Franchise B → 404; assign a delivery partner from another city |
| Delivery Partner A | Get or update a delivery assigned to B → 404; mark Failed/Returned without a reason; mark Delivered without proof |
| Customer A | Get Customer B's order, invoice, address or return → 404; place an order with a client-sent total that differs (server total wins); review a product they never received |
| Any | Call any endpoint with an expired or revoked token; sign in as a deactivated user; alter or delete an audit log row |
