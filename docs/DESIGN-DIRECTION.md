# Design Direction

The storefront should feel like a fine-jewellery house, not a marketplace template. The pearls and the farms are the story, so photography carries the pages and the interface stays quiet.

## Tokens (packages/ui)

Every value below is a token, so the brand can be adjusted in one place. Tailwind reads them through a shared preset.

### Colour
| Token | Value | Use |
|---|---|---|
| `color.bg` | `#FBF8F3` warm ivory | Page background |
| `color.surface` | `#FFFFFF` pearl white | Cards, product image backgrounds |
| `color.surface-muted` | `#F3EEE6` | Section bands, filters panel |
| `color.text` | `#1F2326` deep charcoal | Body and headings |
| `color.text-muted` | `#5C6166` | Secondary text (contrast 5.9:1 on bg) |
| `color.border` | `#E4DDD2` | Hairlines |
| `color.accent` | `#1F4E52` deep teal | Primary buttons, links, focus ring (contrast 8.7:1 on bg; white text on it 9.3:1) |
| `color.accent-hover` | `#173B3E` | |
| `color.gold` | `#A8875A` muted gold | Small details only: dividers, star ratings, "certified" seal. 3.2:1 on ivory, so never used for text. |
| `color.whatsapp` | `#1F7A4D` | WhatsApp button, deepened from the brand green so white text reaches 5.3:1 |
| `color.success / warning / danger / info` | `#2E7D4F / #A86B12 / #B3261E / #2B5C8A` | Status only, mainly in the admin |

There are no bright sale-banner colours. Offers use the accent and typography, not red.

### Type
| Token | Value |
|---|---|
| `font.serif` | **Cormorant Garamond** (headings, product names, prices), fallback Georgia |
| `font.sans` | **Inter** (body, interface, admin), fallback system-ui |
| Scale (mobile → desktop) | display 36→56 · h1 30→44 · h2 24→32 · h3 20→24 · body 16→17 · small 14 · caption 12 |
| Line height | Headings 1.15 · body 1.6 |
| Tracking | Small caps labels +0.08em (e.g. "ORIGIN · SAHYADRI FARM") |

Fonts are self-hosted, subset and loaded with `font-display: swap`.

### Space, shape, motion
- Spacing on a 4 px base: 4, 8, 12, 16, 24, 32, 48, 64, 96. Sections are separated by 64 px on mobile and 96 px on desktop.
- Radius: 2 px on buttons and inputs (crisp, not bubbly) and 0 on product images.
- Shadow: one soft shadow for overlays only.
- Motion: 300–500 ms ease-out fades and slow image scale (1.00 → 1.03) on hover. Nothing blocks a tap. `prefers-reduced-motion` turns all of it off.

## Layout principles
- One clear action per screen.
- Product images are square (1:1) on a consistent neutral background (`color.surface`), photographed on the same backdrop.
- Calm grid: 2 columns on mobile, 3 on tablet, 4 on desktop, with generous gutters (16 / 24 / 32 px).
- **Trust next to money:** farm origin, certification and the delivery promise sit directly under the price and above the buy buttons.

## Accessibility
- WCAG 2.2 AA contrast. Every token pair above has been checked.
- Visible 2 px accent focus ring with an offset on every interactive element.
- Every form field has a label, and errors appear next to the field in text, not colour alone.
- Touch targets are at least 44 × 44 px; 56 px in the delivery app.
- Images have alt text, which the admin requires for the main image.

## Sample screens (mobile first)

### Home
```
┌──────────────────────────────┐
│ ☰  SAHYADRI PEARLS     🔍 👜2 │  header, sticky, ivory
├──────────────────────────────┤
│                              │
│   [ full-bleed hero photo:   │
│     pearls on farm water ]   │
│                              │
│   Pearls with a birthplace   │  serif display
│   [ Explore Jewellery ]      │  one teal button
├──────────────────────────────┤
│ COLLECTIONS                  │
│ [Bridal] [Everyday] [Men] →  │  horizontal scroll, image cards
├──────────────────────────────┤
│ FROM OUR FARMS               │
│ [farm photo]  Every pearl is │
│ traced to a named farm…      │
│ Visit our farm →             │
├──────────────────────────────┤
│ FEATURED PIECES              │
│ [img] [img]                  │  2-col grid
│ Name  Name                   │
│ ₹42,500 ₹18,900              │
├──────────────────────────────┤
│ ✓ Certified  ✓ Farm-traced   │  trust points
│ ✓ Insured delivery           │
├──────────────────────────────┤
│ "Testimonial…" — Name, Pune  │
├──────────────────────────────┤
│ footer                       │
└──────────────────────────────┘
                         (💬) ← floating WhatsApp
```

### Catalogue
```
┌──────────────────────────────┐
│ Jewellery › Necklaces        │  breadcrumb
│ Necklaces            48 pieces│
│ [ Filter (3) ]  [ Sort: New ▾]│  filter opens a bottom sheet on mobile
│ chips: Round ✕  6–8ct ✕  ✕all │
├──────────────────────────────┤
│ [img      ] [img      ]      │
│ Name        Name             │
│ Farm · 7.2ct Farm · 5.1ct    │
│ ₹42,500     Price on request │
│ [img SOLD ] [img      ]      │  sold unique piece: muted + label
└──────────────────────────────┘
Desktop: filter sidebar (category, collection, farm, carat range slider,
shape, colour, price range) on the left; 4-col grid.
```

### Product page
```
┌──────────────────────────────┐
│ [ image gallery, swipe, ⤢ ]  │  pinch/tap to zoom; video as a slide
│ ● ○ ○ ○ ▶                    │
├──────────────────────────────┤
│ Ratnagiri Baroque Strand     │  serif h1
│ SKU SP-NK-0142   ★4.8 (12)   │
│ ₹42,500  incl. GST           │  serif price
│ ┌──────────────────────────┐ │
│ │ ◈ Origin: Sahyadri Farm  │ │  trust block, next to price
│ │ ✓ Certified · QR verified│ │
│ │ 🚚 Insured, 3–5 days     │ │
│ └──────────────────────────┘ │
│ SPECIFICATION                │
│ Carat 7.20 · Shape Baroque   │
│ Colour Cream · Lustre High   │
│ Surface Clean · Cert. …      │
├──────────────────────────────┤
│ THE FARM                     │
│ [photo] story… Visit farm →  │
├──────────────────────────────┤
│ Reviews · Related pieces     │
├──────────────────────────────┤
│[ Add to Cart ][💬 Enquire  ]│  ← sticky bottom bar on mobile
└──────────────────────────────┘
Price on request: price line reads "Price on request"; bar shows only
[ 💬 Enquire on WhatsApp ] full width.
Sold unique piece: "Sold" label; bar shows [ Enquire about a similar piece ].
Desktop: gallery left 60%, details right 40% with the buttons in-flow.
```

### Checkout (one page)
```
┌──────────────────────────────┐
│ Checkout          🔒 Secure  │
│ Continue as guest · Sign in  │
├──────────────────────────────┤
│ 1  CONTACT                   │
│ Mobile [+91 _________]       │
│ Email  [______________]      │
│ 2  DELIVERY ADDRESS          │
│ (saved address cards) / form │
│ City [ Pune ▾ ]  Pincode [ ] │
│ 3  PAYMENT                   │
│ (•) Pay online: UPI, cards,  │
│     net banking, wallets     │
│ ( ) Cash on delivery         │  only methods enabled in the admin
├──────────────────────────────┤
│ ORDER SUMMARY  (collapsible) │
│ 1 × Baroque Strand  ₹41,262  │
│ Coupon [PEARL10 ] Applied ✓  │
│ Subtotal          ₹41,262    │
│ Discount         −₹4,126     │
│ GST 3%            ₹1,114     │
│ Delivery          Free       │
│ Total             ₹38,250    │
├──────────────────────────────┤
│ [   Pay ₹38,250   ]          │  sticky
│ This piece is held for you   │
│ for 15:00                    │  shown for unique pieces
└──────────────────────────────┘
```

## Admin and panels
- Plain, dense and fast: Inter at 14 px, compact tables with sticky headers, row actions, bulk select.
- Status colours are consistent everywhere: grey = new/draft, blue = in progress, amber = waiting/pending, green = done/paid/delivered, red = failed/cancelled, purple = returned/refunded.
- Forms are single-column with labels above fields and inline errors. Unsaved-changes guard.
- Keyboard: `/` focuses search and `g o` opens orders.

## Delivery app
High-contrast mode by default for sunlight: white background, black text, buttons 56 px tall and full-width, a maximum of three fields per step, and everything reachable with one hand.
