# API reference

Generated from the running code by `pnpm api:docs`; do not edit by hand. The machine-readable version is [openapi.json](openapi.json) (OpenAPI 3), which tools such as Postman or Insomnia can import. In development the same reference is browsable at `/api/docs`; it is switched off in production.

- Base path: `/api/v1`. Money is in integer paise (₹1 = 100 paise).
- **Access:** `public` needs no sign-in. `signed in` needs a session: cookies for the website and admin, or `Authorization: Bearer <token>` for the apps. `roles …` limits a route to those roles. `permission MODULE.action` is checked against docs/PERMISSION-MATRIX.md. Partners are further limited to their own city, vendor or franchise records.
- Browser requests that change data with cookies must send the header `X-SP-Client: web` (or `admin`).
- Errors come back as `{ code, message, fields? }`.

One API for the website, admin, partner panels and both apps. Money is in integer paise.

| Area | Routes |
|---|---|
| [system](#system) | 2 |
| [auth](#auth) | 11 |
| [network](#network) | 40 |
| [catalogue](#catalogue) | 51 |
| [media](#media) | 1 |
| [content](#content) | 57 |
| [users](#users) | 11 |
| [settings](#settings) | 8 |
| [catalogue (public)](#catalogue-public) | 10 |
| [content (public)](#content-public) | 12 |
| [enquiries](#enquiries) | 32 |
| [cart & checkout](#cart--checkout) | 13 |
| [account](#account) | 17 |
| [orders](#orders) | 13 |
| [returns](#returns) | 2 |
| [coupons](#coupons) | 9 |
| [payments](#payments) | 2 |
| [delivery](#delivery) | 9 |
| [custom orders](#custom-orders) | 6 |
| [purchase orders](#purchase-orders) | 6 |
| [pricing](#pricing) | 19 |
| [reports](#reports) | 2 |
| [notifications](#notifications) | 8 |
| [newsletter](#newsletter) | 3 |

## system

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/health` | public |  |
| GET | `/ready` | public |  |

## auth

| Method | Path | Access | Body |
|---|---|---|---|
| POST | `/auth/device-token` | signed in | yes |
| POST | `/auth/logout` | public |  |
| POST | `/auth/otp/request` | public | yes |
| POST | `/auth/otp/verify` | public | yes |
| POST | `/auth/partner/otp/request` | public | yes |
| POST | `/auth/partner/otp/verify` | public | yes |
| POST | `/auth/refresh` | public | yes |
| POST | `/auth/staff/login` | public | yes |
| POST | `/auth/staff/otp/email` | public | yes |
| POST | `/auth/staff/verify` | public | yes |
| GET | `/me` | signed in |  |

## network

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/cities` | signed in; permission CITIES.view |  |
| POST | `/admin/cities` | signed in; permission CITIES.create | yes |
| GET | `/admin/cities/{id}` | signed in; permission CITIES.view |  |
| PATCH | `/admin/cities/{id}` | signed in; permission CITIES.edit | yes |
| DELETE | `/admin/cities/{id}` | signed in; permission CITIES.delete |  |
| POST | `/admin/cities/{id}/activate` | signed in; permission CITIES.edit |  |
| POST | `/admin/cities/{id}/deactivate` | signed in; permission CITIES.edit |  |
| POST | `/admin/cities/{id}/restore` | signed in; permission CITIES.edit |  |
| GET | `/admin/delivery-partners` | signed in; permission DELIVERY_PARTNERS.view |  |
| POST | `/admin/delivery-partners` | signed in; permission DELIVERY_PARTNERS.create | yes |
| GET | `/admin/delivery-partners/{id}` | signed in; permission DELIVERY_PARTNERS.view |  |
| PATCH | `/admin/delivery-partners/{id}` | signed in; permission DELIVERY_PARTNERS.edit | yes |
| DELETE | `/admin/delivery-partners/{id}` | signed in; permission DELIVERY_PARTNERS.delete |  |
| POST | `/admin/delivery-partners/{id}/activate` | signed in; permission DELIVERY_PARTNERS.edit |  |
| POST | `/admin/delivery-partners/{id}/deactivate` | signed in; permission DELIVERY_PARTNERS.edit |  |
| POST | `/admin/delivery-partners/{id}/restore` | signed in; permission DELIVERY_PARTNERS.edit |  |
| GET | `/admin/franchises` | signed in; permission FRANCHISES.view |  |
| POST | `/admin/franchises` | signed in; permission FRANCHISES.create | yes |
| GET | `/admin/franchises/{id}` | signed in; permission FRANCHISES.view |  |
| PATCH | `/admin/franchises/{id}` | signed in; permission FRANCHISES.edit | yes |
| DELETE | `/admin/franchises/{id}` | signed in; permission FRANCHISES.delete |  |
| POST | `/admin/franchises/{id}/activate` | signed in; permission FRANCHISES.edit |  |
| POST | `/admin/franchises/{id}/deactivate` | signed in; permission FRANCHISES.edit |  |
| POST | `/admin/franchises/{id}/restore` | signed in; permission FRANCHISES.edit |  |
| GET | `/admin/manufacturers` | signed in; permission MANUFACTURERS.view |  |
| POST | `/admin/manufacturers` | signed in; permission MANUFACTURERS.create | yes |
| GET | `/admin/manufacturers/{id}` | signed in; permission MANUFACTURERS.view |  |
| PATCH | `/admin/manufacturers/{id}` | signed in; permission MANUFACTURERS.edit | yes |
| DELETE | `/admin/manufacturers/{id}` | signed in; permission MANUFACTURERS.delete |  |
| POST | `/admin/manufacturers/{id}/activate` | signed in; permission MANUFACTURERS.edit |  |
| POST | `/admin/manufacturers/{id}/deactivate` | signed in; permission MANUFACTURERS.edit |  |
| POST | `/admin/manufacturers/{id}/restore` | signed in; permission MANUFACTURERS.edit |  |
| GET | `/admin/vendors` | signed in; permission VENDORS.view |  |
| POST | `/admin/vendors` | signed in; permission VENDORS.create | yes |
| GET | `/admin/vendors/{id}` | signed in; permission VENDORS.view |  |
| PATCH | `/admin/vendors/{id}` | signed in; permission VENDORS.edit | yes |
| DELETE | `/admin/vendors/{id}` | signed in; permission VENDORS.delete |  |
| POST | `/admin/vendors/{id}/activate` | signed in; permission VENDORS.edit |  |
| POST | `/admin/vendors/{id}/deactivate` | signed in; permission VENDORS.edit |  |
| POST | `/admin/vendors/{id}/restore` | signed in; permission VENDORS.edit |  |

## catalogue

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/categories` | signed in; permission CATEGORIES.view |  |
| POST | `/admin/categories` | signed in; permission CATEGORIES.create | yes |
| GET | `/admin/categories/{id}` | signed in; permission CATEGORIES.view |  |
| PATCH | `/admin/categories/{id}` | signed in; permission CATEGORIES.edit | yes |
| DELETE | `/admin/categories/{id}` | signed in; permission CATEGORIES.delete |  |
| POST | `/admin/categories/{id}/activate` | signed in; permission CATEGORIES.edit |  |
| POST | `/admin/categories/{id}/deactivate` | signed in; permission CATEGORIES.edit |  |
| POST | `/admin/categories/{id}/restore` | signed in; permission CATEGORIES.edit |  |
| GET | `/admin/certificates` | signed in; permission PRODUCTS.view |  |
| POST | `/admin/certificates` | signed in; permission PRODUCTS.edit |  |
| GET | `/admin/certificates/{id}/pdf` | signed in; permission PRODUCTS.view |  |
| POST | `/admin/certificates/{id}/revoke` | signed in; permission PRODUCTS.edit |  |
| GET | `/admin/collections` | signed in; permission COLLECTIONS.view |  |
| POST | `/admin/collections` | signed in; permission COLLECTIONS.create | yes |
| GET | `/admin/collections/{id}` | signed in; permission COLLECTIONS.view |  |
| PATCH | `/admin/collections/{id}` | signed in; permission COLLECTIONS.edit | yes |
| DELETE | `/admin/collections/{id}` | signed in; permission COLLECTIONS.delete |  |
| POST | `/admin/collections/{id}/activate` | signed in; permission COLLECTIONS.edit |  |
| POST | `/admin/collections/{id}/deactivate` | signed in; permission COLLECTIONS.edit |  |
| POST | `/admin/collections/{id}/restore` | signed in; permission COLLECTIONS.edit |  |
| GET | `/admin/farms` | signed in; permission FARMS.view |  |
| POST | `/admin/farms` | signed in; permission FARMS.create | yes |
| GET | `/admin/farms/{id}` | signed in; permission FARMS.view |  |
| PATCH | `/admin/farms/{id}` | signed in; permission FARMS.edit | yes |
| DELETE | `/admin/farms/{id}` | signed in; permission FARMS.delete |  |
| POST | `/admin/farms/{id}/activate` | signed in; permission FARMS.edit |  |
| POST | `/admin/farms/{id}/deactivate` | signed in; permission FARMS.edit |  |
| POST | `/admin/farms/{id}/restore` | signed in; permission FARMS.edit |  |
| GET | `/admin/products` | signed in; permission PRODUCTS.view |  |
| POST | `/admin/products` | signed in; permission PRODUCTS.create |  |
| GET | `/admin/products/{id}` | signed in; permission PRODUCTS.view |  |
| PATCH | `/admin/products/{id}` | signed in; permission PRODUCTS.edit |  |
| DELETE | `/admin/products/{id}` | signed in; permission PRODUCTS.delete |  |
| POST | `/admin/products/{id}/approve` | signed in; permission PRODUCTS.edit |  |
| POST | `/admin/products/{id}/images` | signed in; permission PRODUCTS.edit |  |
| PATCH | `/admin/products/{id}/images/{imageId}` | signed in; permission PRODUCTS.edit |  |
| DELETE | `/admin/products/{id}/images/{imageId}` | signed in; permission PRODUCTS.edit |  |
| PATCH | `/admin/products/{id}/images/order` | signed in; permission PRODUCTS.edit |  |
| POST | `/admin/products/{id}/publish` | signed in; permission PRODUCTS.edit |  |
| POST | `/admin/products/{id}/reject` | signed in; permission PRODUCTS.edit |  |
| PUT | `/admin/products/{id}/related` | signed in; permission PRODUCTS.edit |  |
| POST | `/admin/products/{id}/restock` | signed in; permission PRODUCTS.edit |  |
| POST | `/admin/products/{id}/restore` | signed in; permission PRODUCTS.edit |  |
| POST | `/admin/products/{id}/unpublish` | signed in; permission PRODUCTS.edit |  |
| POST | `/admin/products/{id}/video` | signed in; permission PRODUCTS.edit |  |
| DELETE | `/admin/products/{id}/video` | signed in; permission PRODUCTS.edit |  |
| POST | `/admin/products/bulk-images` | signed in; permission PRODUCTS.edit |  |
| POST | `/admin/products/import` | signed in; permission PRODUCTS.create |  |
| GET | `/admin/products/import/template` | signed in; permission PRODUCTS.create |  |
| GET | `/admin/reviews` | signed in; permission REVIEWS.view |  |
| POST | `/admin/reviews/{id}/{decision}` | signed in; permission REVIEWS.edit |  |

## media

| Method | Path | Access | Body |
|---|---|---|---|
| POST | `/admin/uploads` | signed in; permission CONTENT.create |  |

## content

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/banners` | signed in; permission CONTENT.view |  |
| POST | `/admin/banners` | signed in; permission CONTENT.create | yes |
| GET | `/admin/banners/{id}` | signed in; permission CONTENT.view |  |
| PATCH | `/admin/banners/{id}` | signed in; permission CONTENT.edit | yes |
| DELETE | `/admin/banners/{id}` | signed in; permission CONTENT.delete |  |
| POST | `/admin/banners/{id}/activate` | signed in; permission CONTENT.edit |  |
| POST | `/admin/banners/{id}/deactivate` | signed in; permission CONTENT.edit |  |
| POST | `/admin/banners/{id}/restore` | signed in; permission CONTENT.edit |  |
| GET | `/admin/content-blocks` | signed in; permission CONTENT.view |  |
| POST | `/admin/content-blocks` | signed in; permission CONTENT.create | yes |
| GET | `/admin/content-blocks/{id}` | signed in; permission CONTENT.view |  |
| PATCH | `/admin/content-blocks/{id}` | signed in; permission CONTENT.edit | yes |
| DELETE | `/admin/content-blocks/{id}` | signed in; permission CONTENT.delete |  |
| POST | `/admin/content-blocks/{id}/activate` | signed in; permission CONTENT.edit |  |
| POST | `/admin/content-blocks/{id}/deactivate` | signed in; permission CONTENT.edit |  |
| POST | `/admin/content-blocks/{id}/restore` | signed in; permission CONTENT.edit |  |
| GET | `/admin/faq` | signed in; permission CONTENT.view |  |
| POST | `/admin/faq` | signed in; permission CONTENT.create | yes |
| GET | `/admin/faq/{id}` | signed in; permission CONTENT.view |  |
| PATCH | `/admin/faq/{id}` | signed in; permission CONTENT.edit | yes |
| DELETE | `/admin/faq/{id}` | signed in; permission CONTENT.delete |  |
| POST | `/admin/faq/{id}/activate` | signed in; permission CONTENT.edit |  |
| POST | `/admin/faq/{id}/deactivate` | signed in; permission CONTENT.edit |  |
| POST | `/admin/faq/{id}/restore` | signed in; permission CONTENT.edit |  |
| GET | `/admin/gallery` | signed in; permission CONTENT.view |  |
| POST | `/admin/gallery` | signed in; permission CONTENT.create | yes |
| GET | `/admin/gallery/{id}` | signed in; permission CONTENT.view |  |
| PATCH | `/admin/gallery/{id}` | signed in; permission CONTENT.edit | yes |
| DELETE | `/admin/gallery/{id}` | signed in; permission CONTENT.delete |  |
| POST | `/admin/gallery/{id}/activate` | signed in; permission CONTENT.edit |  |
| POST | `/admin/gallery/{id}/deactivate` | signed in; permission CONTENT.edit |  |
| POST | `/admin/gallery/{id}/restore` | signed in; permission CONTENT.edit |  |
| GET | `/admin/job-applications` | signed in; permission CAREERS.view |  |
| PATCH | `/admin/job-applications/{id}` | signed in; permission CAREERS.edit |  |
| GET | `/admin/job-applications/{id}/resume` | signed in; permission CAREERS.view |  |
| GET | `/admin/jobs` | signed in; permission CAREERS.view |  |
| POST | `/admin/jobs` | signed in; permission CAREERS.create | yes |
| GET | `/admin/jobs/{id}` | signed in; permission CAREERS.view |  |
| PATCH | `/admin/jobs/{id}` | signed in; permission CAREERS.edit | yes |
| DELETE | `/admin/jobs/{id}` | signed in; permission CAREERS.delete |  |
| POST | `/admin/jobs/{id}/activate` | signed in; permission CAREERS.edit |  |
| POST | `/admin/jobs/{id}/deactivate` | signed in; permission CAREERS.edit |  |
| POST | `/admin/jobs/{id}/restore` | signed in; permission CAREERS.edit |  |
| GET | `/admin/pages` | signed in; permission CONTENT.view |  |
| POST | `/admin/pages` | signed in; permission CONTENT.create |  |
| GET | `/admin/pages/{id}` | signed in; permission CONTENT.view |  |
| PATCH | `/admin/pages/{id}` | signed in; permission CONTENT.edit |  |
| GET | `/admin/pages/{id}/versions/{versionId}` | signed in; permission CONTENT.view |  |
| POST | `/admin/pages/{id}/versions/{versionId}/restore` | signed in; permission CONTENT.edit |  |
| GET | `/admin/testimonials` | signed in; permission CONTENT.view |  |
| POST | `/admin/testimonials` | signed in; permission CONTENT.create | yes |
| GET | `/admin/testimonials/{id}` | signed in; permission CONTENT.view |  |
| PATCH | `/admin/testimonials/{id}` | signed in; permission CONTENT.edit | yes |
| DELETE | `/admin/testimonials/{id}` | signed in; permission CONTENT.delete |  |
| POST | `/admin/testimonials/{id}/activate` | signed in; permission CONTENT.edit |  |
| POST | `/admin/testimonials/{id}/deactivate` | signed in; permission CONTENT.edit |  |
| POST | `/admin/testimonials/{id}/restore` | signed in; permission CONTENT.edit |  |

## users

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/customers` | signed in; permission USERS.view |  |
| GET | `/admin/customers/{id}` | signed in; permission USERS.view |  |
| POST | `/admin/customers/{id}/{action}` | signed in; permission USERS.edit |  |
| GET | `/admin/users` | signed in; roles SUPER_ADMIN |  |
| POST | `/admin/users` | signed in; roles SUPER_ADMIN |  |
| GET | `/admin/users/{id}` | signed in; roles SUPER_ADMIN |  |
| PATCH | `/admin/users/{id}` | signed in; roles SUPER_ADMIN |  |
| POST | `/admin/users/{id}/activate` | signed in; roles SUPER_ADMIN |  |
| POST | `/admin/users/{id}/deactivate` | signed in; roles SUPER_ADMIN |  |
| POST | `/admin/users/{id}/password` | signed in; roles SUPER_ADMIN |  |
| PUT | `/admin/users/{id}/permissions` | signed in; roles SUPER_ADMIN |  |

## settings

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/audit-logs` | signed in; permission AUDIT_LOG.view |  |
| GET | `/admin/audit-logs/entities` | signed in; permission AUDIT_LOG.view |  |
| GET | `/admin/feature-flags` | signed in; permission SETTINGS.view |  |
| PATCH | `/admin/feature-flags/{key}` | signed in; roles SUPER_ADMIN |  |
| GET | `/admin/messages` | signed in; permission NOTIFICATIONS.view |  |
| POST | `/admin/messages/{id}/resend` | signed in; permission NOTIFICATIONS.edit |  |
| GET | `/admin/settings` | signed in; permission SETTINGS.view |  |
| PATCH | `/admin/settings/{key}` | signed in; permission SETTINGS.edit |  |

## catalogue (public)

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/catalogue/categories` | public |  |
| GET | `/catalogue/categories/{slug}` | public |  |
| GET | `/catalogue/collections` | public |  |
| GET | `/catalogue/collections/{slug}` | public |  |
| GET | `/catalogue/farms` | public |  |
| GET | `/catalogue/farms/{slug}` | public |  |
| GET | `/catalogue/filters` | public |  |
| GET | `/catalogue/products` | public |  |
| GET | `/catalogue/products/{slug}` | public |  |
| POST | `/ring-finder` | public |  |

## content (public)

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/careers` | public |  |
| GET | `/careers/{slug}` | public |  |
| POST | `/careers/{slug}/apply` | public |  |
| GET | `/content/faq` | public |  |
| GET | `/content/gallery` | public |  |
| GET | `/content/home` | public |  |
| GET | `/content/pages/{slug}` | public |  |
| GET | `/content/testimonials` | public |  |
| GET | `/offers` | public |  |
| GET | `/seo/sitemap` | public |  |
| GET | `/site` | public |  |
| GET | `/verify/{code}` | public |  |

## enquiries

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/enquiries` | signed in; permission ENQUIRIES.view |  |
| GET | `/admin/enquiries/{id}` | signed in; permission ENQUIRIES.view |  |
| PATCH | `/admin/enquiries/{id}` | signed in; permission ENQUIRIES.edit |  |
| POST | `/admin/enquiries/{id}/notes` | signed in; permission ENQUIRIES.edit |  |
| GET | `/admin/enquiries/meta/owners` | signed in; permission ENQUIRIES.view |  |
| GET | `/admin/message-templates` | signed in; permission WHATSAPP_SETTINGS.view |  |
| POST | `/admin/message-templates` | signed in; permission WHATSAPP_SETTINGS.create | yes |
| GET | `/admin/message-templates/{id}` | signed in; permission WHATSAPP_SETTINGS.view |  |
| PATCH | `/admin/message-templates/{id}` | signed in; permission WHATSAPP_SETTINGS.edit | yes |
| DELETE | `/admin/message-templates/{id}` | signed in; permission WHATSAPP_SETTINGS.delete |  |
| POST | `/admin/message-templates/{id}/activate` | signed in; permission WHATSAPP_SETTINGS.edit |  |
| POST | `/admin/message-templates/{id}/deactivate` | signed in; permission WHATSAPP_SETTINGS.edit |  |
| POST | `/admin/message-templates/{id}/restore` | signed in; permission WHATSAPP_SETTINGS.edit |  |
| GET | `/admin/routing-rules` | signed in; permission WHATSAPP_SETTINGS.view |  |
| POST | `/admin/routing-rules` | signed in; permission WHATSAPP_SETTINGS.create | yes |
| GET | `/admin/routing-rules/{id}` | signed in; permission WHATSAPP_SETTINGS.view |  |
| PATCH | `/admin/routing-rules/{id}` | signed in; permission WHATSAPP_SETTINGS.edit | yes |
| DELETE | `/admin/routing-rules/{id}` | signed in; permission WHATSAPP_SETTINGS.delete |  |
| POST | `/admin/routing-rules/{id}/activate` | signed in; permission WHATSAPP_SETTINGS.edit |  |
| POST | `/admin/routing-rules/{id}/deactivate` | signed in; permission WHATSAPP_SETTINGS.edit |  |
| POST | `/admin/routing-rules/{id}/restore` | signed in; permission WHATSAPP_SETTINGS.edit |  |
| GET | `/admin/whatsapp-numbers` | signed in; permission WHATSAPP_SETTINGS.view |  |
| POST | `/admin/whatsapp-numbers` | signed in; permission WHATSAPP_SETTINGS.create | yes |
| GET | `/admin/whatsapp-numbers/{id}` | signed in; permission WHATSAPP_SETTINGS.view |  |
| PATCH | `/admin/whatsapp-numbers/{id}` | signed in; permission WHATSAPP_SETTINGS.edit | yes |
| DELETE | `/admin/whatsapp-numbers/{id}` | signed in; permission WHATSAPP_SETTINGS.delete |  |
| POST | `/admin/whatsapp-numbers/{id}/activate` | signed in; permission WHATSAPP_SETTINGS.edit |  |
| POST | `/admin/whatsapp-numbers/{id}/deactivate` | signed in; permission WHATSAPP_SETTINGS.edit |  |
| POST | `/admin/whatsapp-numbers/{id}/restore` | signed in; permission WHATSAPP_SETTINGS.edit |  |
| POST | `/enquiries` | public |  |
| POST | `/enquiries/consultation` | public |  |
| POST | `/enquiries/custom` | public |  |

## cart & checkout

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/cart` | public |  |
| GET | `/cart/count` | public |  |
| POST | `/cart/coupon` | public |  |
| DELETE | `/cart/coupon` | public |  |
| POST | `/cart/items` | public |  |
| PATCH | `/cart/items/{productId}` | public |  |
| DELETE | `/cart/items/{productId}` | public |  |
| POST | `/checkout` | public |  |
| POST | `/checkout/quote` | public |  |
| POST | `/payments/verify` | public |  |
| GET | `/track/{number}` | public |  |
| GET | `/track/{number}/invoice.pdf` | public |  |
| GET | `/track/{number}/payment` | public |  |

## account

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/me/addresses` | signed in; roles CUSTOMER |  |
| POST | `/me/addresses` | signed in; roles CUSTOMER |  |
| PATCH | `/me/addresses/{id}` | signed in; roles CUSTOMER |  |
| DELETE | `/me/addresses/{id}` | signed in; roles CUSTOMER |  |
| POST | `/me/delete-account` | signed in; roles CUSTOMER |  |
| GET | `/me/orders` | signed in; roles CUSTOMER |  |
| GET | `/me/orders/{number}` | signed in; roles CUSTOMER |  |
| POST | `/me/orders/{number}/cancel-unpaid` | signed in; roles CUSTOMER |  |
| POST | `/me/orders/{number}/returns` | signed in; roles CUSTOMER |  |
| PATCH | `/me/profile` | signed in; roles CUSTOMER |  |
| GET | `/me/referral` | signed in; roles CUSTOMER |  |
| GET | `/me/returns` | signed in; roles CUSTOMER |  |
| POST | `/me/reviews` | signed in; roles CUSTOMER |  |
| GET | `/me/wishlist` | signed in; roles CUSTOMER |  |
| POST | `/me/wishlist` | signed in; roles CUSTOMER |  |
| DELETE | `/me/wishlist/{productId}` | signed in; roles CUSTOMER |  |
| GET | `/me/wishlist/ids` | signed in; roles CUSTOMER |  |

## orders

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/abandoned-carts` | signed in; roles SUPER_ADMIN, STAFF; permission ORDERS.view |  |
| POST | `/admin/abandoned-carts/{id}/remind` | signed in; roles SUPER_ADMIN, STAFF; permission ORDERS.edit |  |
| POST | `/admin/enquiries/{id}/convert` | signed in; permission ORDERS.create |  |
| GET | `/admin/orders` | signed in; permission ORDERS.view |  |
| POST | `/admin/orders` | signed in; permission ORDERS.create |  |
| GET | `/admin/orders/{id}` | signed in; permission ORDERS.view |  |
| PATCH | `/admin/orders/{id}` | signed in; permission ORDERS.edit |  |
| POST | `/admin/orders/{id}/assign-delivery` | signed in; permission ORDERS.edit |  |
| GET | `/admin/orders/{id}/invoice.pdf` | signed in; permission ORDERS.view |  |
| GET | `/admin/orders/{id}/packing-slip.pdf` | signed in; permission ORDERS.view |  |
| POST | `/admin/orders/{id}/payments` | signed in; permission PAYMENTS.edit |  |
| POST | `/admin/orders/{id}/refunds` | signed in; permission PAYMENTS.edit |  |
| POST | `/admin/orders/{id}/status` | signed in; permission ORDERS.edit |  |

## returns

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/returns` | signed in; permission RETURNS.view |  |
| POST | `/admin/returns/{id}/{action}` | signed in; permission RETURNS.edit |  |

## coupons

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/coupons` | signed in; permission COUPONS.view |  |
| POST | `/admin/coupons` | signed in; permission COUPONS.create | yes |
| GET | `/admin/coupons/{id}` | signed in; permission COUPONS.view |  |
| PATCH | `/admin/coupons/{id}` | signed in; permission COUPONS.edit | yes |
| DELETE | `/admin/coupons/{id}` | signed in; permission COUPONS.delete |  |
| POST | `/admin/coupons/{id}/activate` | signed in; permission COUPONS.edit |  |
| POST | `/admin/coupons/{id}/deactivate` | signed in; permission COUPONS.edit |  |
| POST | `/admin/coupons/{id}/restore` | signed in; permission COUPONS.edit |  |
| GET | `/admin/coupons/{id}/usage` | signed in; permission COUPONS.view |  |

## payments

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/payments` | signed in; permission PAYMENTS.view |  |
| POST | `/admin/payments/reconcile` | signed in; permission PAYMENTS.edit |  |

## delivery

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/deliveries/{id}/proof` | signed in; permission ORDERS.view |  |
| GET | `/delivery/jobs` | signed in; roles DELIVERY_PARTNER |  |
| GET | `/delivery/jobs/{orderId}` | signed in; roles DELIVERY_PARTNER |  |
| POST | `/delivery/jobs/{orderId}/delivered` | signed in; roles DELIVERY_PARTNER |  |
| POST | `/delivery/jobs/{orderId}/failed` | signed in; roles DELIVERY_PARTNER |  |
| POST | `/delivery/jobs/{orderId}/otp` | signed in; roles DELIVERY_PARTNER |  |
| POST | `/delivery/jobs/{orderId}/out-for-delivery` | signed in; roles DELIVERY_PARTNER |  |
| POST | `/delivery/jobs/{orderId}/picked-up` | signed in; roles DELIVERY_PARTNER |  |
| POST | `/delivery/jobs/{orderId}/returned` | signed in; roles DELIVERY_PARTNER |  |

## custom orders

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/custom-orders` | signed in; permission CUSTOM_ORDERS.view |  |
| POST | `/admin/custom-orders` | signed in; permission CUSTOM_ORDERS.create |  |
| GET | `/admin/custom-orders/{id}` | signed in; permission CUSTOM_ORDERS.view |  |
| PATCH | `/admin/custom-orders/{id}` | signed in; permission CUSTOM_ORDERS.edit |  |
| POST | `/admin/custom-orders/{id}/files` | signed in; permission CUSTOM_ORDERS.edit |  |
| POST | `/admin/custom-orders/{id}/stage` | signed in; permission CUSTOM_ORDERS.edit |  |

## purchase orders

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/purchase-orders` | signed in; permission PURCHASE_ORDERS.view |  |
| POST | `/admin/purchase-orders` | signed in; permission PURCHASE_ORDERS.create |  |
| GET | `/admin/purchase-orders/{id}` | signed in; permission PURCHASE_ORDERS.view |  |
| PATCH | `/admin/purchase-orders/{id}` | signed in; permission PURCHASE_ORDERS.edit |  |
| GET | `/admin/purchase-orders/{id}/pdf` | signed in; permission PURCHASE_ORDERS.view |  |
| POST | `/admin/purchase-orders/{id}/status` | signed in; permission PURCHASE_ORDERS.edit |  |

## pricing

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/margin-rules` | signed in; permission PRICING.view |  |
| POST | `/admin/margin-rules` | signed in; permission PRICING.create | yes |
| GET | `/admin/margin-rules/{id}` | signed in; permission PRICING.view |  |
| PATCH | `/admin/margin-rules/{id}` | signed in; permission PRICING.edit | yes |
| DELETE | `/admin/margin-rules/{id}` | signed in; permission PRICING.delete |  |
| POST | `/admin/margin-rules/{id}/activate` | signed in; permission PRICING.edit |  |
| POST | `/admin/margin-rules/{id}/deactivate` | signed in; permission PRICING.edit |  |
| POST | `/admin/margin-rules/{id}/restore` | signed in; permission PRICING.edit |  |
| GET | `/admin/pearl-rates` | signed in; permission PRICING.view |  |
| POST | `/admin/pearl-rates` | signed in; permission PRICING.create | yes |
| GET | `/admin/pearl-rates/{id}` | signed in; permission PRICING.view |  |
| PATCH | `/admin/pearl-rates/{id}` | signed in; permission PRICING.edit | yes |
| DELETE | `/admin/pearl-rates/{id}` | signed in; permission PRICING.delete |  |
| POST | `/admin/pearl-rates/{id}/activate` | signed in; permission PRICING.edit |  |
| POST | `/admin/pearl-rates/{id}/deactivate` | signed in; permission PRICING.edit |  |
| POST | `/admin/pearl-rates/{id}/restore` | signed in; permission PRICING.edit |  |
| POST | `/admin/pricing/calculate` | signed in; permission PRICING.view |  |
| GET | `/admin/pricing/feed/status` | signed in; permission PRICING.view |  |
| POST | `/admin/pricing/feed/sync` | signed in; permission PRICING.edit |  |

## reports

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/dashboard` | signed in; permission DASHBOARD.view |  |
| GET | `/admin/reports/{kind}` | signed in; permission REPORTS.view |  |

## notifications

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/campaigns` | signed in; permission NOTIFICATIONS.view |  |
| POST | `/admin/campaigns` | signed in; permission NOTIFICATIONS.create |  |
| GET | `/admin/campaigns/{id}` | signed in; permission NOTIFICATIONS.view |  |
| PATCH | `/admin/campaigns/{id}` | signed in; permission NOTIFICATIONS.edit |  |
| POST | `/admin/campaigns/{id}/cancel` | signed in; permission NOTIFICATIONS.edit |  |
| POST | `/admin/campaigns/{id}/send` | signed in; permission NOTIFICATIONS.edit |  |
| POST | `/admin/campaigns/estimate` | signed in; permission NOTIFICATIONS.view |  |
| GET | `/admin/campaigns/meta/segments` | signed in; permission NOTIFICATIONS.view |  |

## newsletter

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/admin/newsletter` | signed in; permission NOTIFICATIONS.view |  |
| POST | `/newsletter` | public |  |
| POST | `/newsletter/unsubscribe` | public |  |
