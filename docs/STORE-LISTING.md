# App store listings

Text and answers for Google Play Console and App Store Connect. Replace `sahyadripearls.in` with the live domain. Review every answer with the owner before submitting: the stores treat these as legal declarations.

---

## 1. Sahyadri Pearls (customer app)

| Field | Value |
|---|---|
| App name | Sahyadri Pearls |
| Package / bundle id | `in.sahyadripearls.app` |
| Category | Shopping |
| Content rating | Everyone / 4+ (no user-generated public content, no gambling, no violence) |
| Price | Free; in-app purchases: none (physical goods are paid through the payment gateway, which is allowed) |
| Support email | the store email in Admin → Settings → Business details |
| Privacy policy | `https://www.sahyadripearls.in/privacy` |
| Account deletion link | `https://www.sahyadripearls.in/delete-account` |

**Short description (80 characters max)**
Farm-traced pearl jewellery from Maharashtra, with a certificate for every piece.

**Full description**
Pearls with a birthplace. Every Sahyadri Pearls piece names the farm its pearls came from, in the Sahyadri hills and on the Konkan coast, and arrives with a certificate you can verify by QR code.

• Browse necklaces, earrings, rings, bracelets, pendants and loose pearls
• Filter by pearl colour, shape, price and collection
• Ring Finder: answer a few questions and see rings picked for you
• Customized Jewellery: share your idea and photos with our designers
• Chat with us on WhatsApp about any piece
• Pay online (UPI, cards, net banking) or cash on delivery
• Free gift packing with a message card
• Track your order and request returns from the app
• Save favourites to your wishlist and share them
• Refer a friend and both of you get a reward

Insured delivery across India. Questions? Our team answers on WhatsApp.

**Screenshots (phone, 1080×1920 or larger, at least 4)**
1. Home (hero and collections)
2. Shop with filters
3. Product page (price, origin farm, certificate)
4. Ring Finder results
5. Checkout with gift packing
6. Order tracking

Take them from a production build with real product photos (the sample data has placeholder images).

### Google Play: Data safety
| Data type | Collected | Shared | Purpose | Optional |
|---|---|---|---|---|
| Name, phone number, email, address | Yes | No* | Account management, app functionality (delivery) | Email optional |
| Purchase history | Yes | No | App functionality | Required for orders |
| Photos | Yes, only when added to a custom design request | No | App functionality | Optional |
| Device or other IDs (push token) | Yes | No | App functionality (notifications) | Optional (permission) |
| Payment card / UPI details | No: entered on the payment gateway's page, never seen by the app | — | — | — |
| Location | No | — | — | — |

\* Delivery partners and the payment gateway receive what they need to deliver and to take payment. They act as service providers, which Play does not count as sharing.

- Data is encrypted in transit: **Yes** (HTTPS only).
- Users can request deletion: **Yes**, in the app (Account → Delete my account) and at `/delete-account`.

### App Store: App Privacy
- **Data linked to the user:** Contact info (name, email, phone, physical address), Purchases, User content (photos in custom requests), Identifiers (device push token). Used for App functionality and Customer support.
- **Not used for tracking.** There is no advertising SDK; no App Tracking Transparency prompt is needed.

---

## 2. Sahyadri Pearls Delivery (delivery partner app)

Release files: built by the "Delivery app (Android release)" GitHub workflow (branch `android-builds`), then signed
with the owner's upload key (kept off GitHub; SHA-1 `A4:AB:C1:F7:0E:77:34:0F:70:B4:63:74:F2:F4:6C:76:2F:F7:CA:27`).
Google keeps the app signing key (Play App Signing).

**Which track.** Only registered partners can sign in, so start on **Internal testing** (live within minutes, up to
100 testers by email). A *personal* developer account made after November 2023 must run a closed test with at least
12 testers for 14 days before it may publish to Production; an *organisation* account can go to Production directly.

| Field | Value |
|---|---|
| App name | Sahyadri Pearls Delivery |
| Package | `in.sahyadripearls.delivery` |
| Category | Business |
| Content rating | Everyone (questionnaire: no violence, no user-generated content shared with others, no purchases) |
| Privacy policy | `https://<site>/delivery-app-privacy` (today `https://sahyadri-pearls-demo.vercel.app/delivery-app-privacy`) |
| Account deletion | `https://<site>/delete-account` |
| Ads | No |

**Short description** (80 characters at most)
Deliveries for Sahyadri Pearls partners: jobs, proof of delivery and cash.

**Full description**
For registered Sahyadri Pearls delivery partners only.
• Your deliveries for today, and the ones you have completed
• One tap for "Picked up" and "Start delivery"
• Proof of delivery: a photo of the handover, plus the customer's code or a signature
• Cash on delivery: shows what to collect, and records it
• Works with a weak signal: updates are saved on the phone and sent when you are back online

Not in this first version: push notifications (they need a Firebase project; the jobs list refreshes by itself).

**Reviewer access.** Google's reviewers need a working login. Create a test partner in the admin (Staff & partner
logins → Delivery partner) with a spare number, give it one sample order, and put the number and how to get the
code in Play Console → App content → App access. Never use a real partner's details.

### Google Play: Data safety
| Data type | Collected | Shared | Purpose |
|---|---|---|---|
| Name, phone number | Yes | No | Account management |
| Precise location | Optional, once at the moment of handover (never in the background) | No | App functionality (proof of delivery) |
| Photos | Yes, the handover photo | No | App functionality (proof of delivery) |

Encrypted in transit: **Yes**. Users can ask for deletion: **Yes**, at `/delete-account` or through the city team.
No ads, no analytics, no data sold.

---

## 3. Before submitting
- [ ] Production builds point at the live API (`eas.json` → production).
- [ ] Privacy policy page approved and published (Admin → Pages & legal).
- [ ] `ANDROID_APP_SHA256` and `APPLE_TEAM_ID` set on the website, so links open the app.
- [ ] Store links added in Admin → Settings → App store links (the website footer shows them).
- [ ] Payment: live Razorpay keys set; until then the app offers cash on delivery only.
- [ ] Customer sign-in needs the SMS provider (DLT registered) to be live.
