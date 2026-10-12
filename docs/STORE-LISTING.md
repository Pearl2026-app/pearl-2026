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

Listed as **unlisted / private** where possible: on Play, internal or closed testing; on iOS, Apple Business Manager custom app or an unlisted app. Only registered partners can sign in.

| Field | Value |
|---|---|
| App name | Sahyadri Pearls Delivery |
| Package / bundle id | `in.sahyadripearls.delivery` |
| Category | Business |
| Content rating | Everyone / 4+ |
| Privacy policy | `https://www.sahyadripearls.in/privacy` |

**Short description**
Deliveries for Sahyadri Pearls partners: jobs, proof of delivery and cash.

**Full description**
For registered Sahyadri Pearls delivery partners only.
• Today's deliveries and history
• One tap for picked up and out for delivery
• Proof of delivery: photo, customer code or signature
• Cash on delivery collection and cash to hand over
• Works with no signal: updates are sent when you are back online
• A notification for every new delivery

**Reviewer access (both stores):** provide a test partner login. The reviewer signs in with a phone number and a one-time code, so give them a dedicated test number whose code the team can read from the admin message log, or arrange a fixed review code with the SMS provider. Never put a real partner's details in the review notes.

### Google Play: Data safety
| Data type | Collected | Purpose |
|---|---|---|
| Name, phone number | Yes | Account management |
| Precise location | Yes, once when a delivery is completed (not in the background) | App functionality (proof of delivery) |
| Photos | Yes (proof-of-delivery photos) | App functionality |
| Device IDs (push token) | Yes | Notifications |

Encrypted in transit: **Yes**. Deletion: the partner asks the city team, who deactivate the login in the admin.

---

## 3. Before submitting
- [ ] Production builds point at the live API (`eas.json` → production).
- [ ] Privacy policy page approved and published (Admin → Pages & legal).
- [ ] `ANDROID_APP_SHA256` and `APPLE_TEAM_ID` set on the website, so links open the app.
- [ ] Store links added in Admin → Settings → App store links (the website footer shows them).
- [ ] Payment: live Razorpay keys set; until then the app offers cash on delivery only.
- [ ] Customer sign-in needs the SMS provider (DLT registered) to be live.
