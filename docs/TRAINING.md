# Training Notes

Notes for a half-day onboarding session for Sahyadri Pearls head office staff, city managers, vendors, franchises and delivery partners.

Use these notes with the [Admin Guide](ADMIN-GUIDE.md). The guide has the full steps; this file has the session plan, practice exercises, common mistakes and quick fixes.

---

## 1. Before the session (for the trainer)

### Use a practice copy, never the live site

All exercises use the sample data on a **local or staging copy**. Never practise on the live site. Practice orders on the live site would message real customers, reserve real pieces and appear in tax reports.

The live site has no sample data, so the sample logins below do not exist there.

### Set up the practice copy

Ask your developer to do this the day before:

1. Start the practice copy in development mode (`pnpm dev`, with the database and Redis from `docker-compose.dev.yml`).
2. Load the sample data: `pnpm db:seed`. It is safe to run more than once; it does not overwrite changes.
3. Check the website opens at http://localhost:3000 and the admin at http://localhost:3001/admin.
4. Check that `DEV_FIXED_OTP=123456` is set and the copy runs in development mode, so every code is **123456**. On a staging copy that runs in production mode, real codes are sent by email or SMS instead.

### Sample logins (sample data only)

> **Sample data only. Change or remove these before going live.**

- Team password: the `SEED_PASSWORD` value used when the sample data was loaded. If none was set, it is `Sahyadri@2026`.
- Every code on a development copy: **123456**.

| Who | Sign in with |
|---|---|
| Super Admin | admin@sahyadripearls.test + password |
| Staff (catalogue, enquiries, content) | staff@sahyadripearls.test + password |
| City Manager, Pune | pune.manager@sahyadripearls.test + password |
| City Manager, Mumbai | mumbai.manager@sahyadripearls.test + password |
| Vendor, Konkan Pearl House | 98000 00003 or vendor@sahyadripearls.test |
| Franchise, Koregaon Park (Pune) | 98000 00004 or franchise.pune@sahyadripearls.test |
| Franchise, Bandra (Mumbai) | 98000 00014 or franchise.mumbai@sahyadripearls.test |
| Delivery partner, Vikram Pawar (Pune) | 98000 00005 |
| Customer, Asha Patil (Pune) | 98000 00007 on the website |
| Customer, Karan Mehta (Mumbai) | 98000 00017 on the website |

### Useful sample data

| Item | Why it is useful |
|---|---|
| Mulshi Baroque Strand, Solitaire Pearl Ring | Unique pieces (sold once) |
| Classic Studs 7mm, Tidepool Drop Earrings | Quantity stock |
| Royal Peshwai Haar, Collector Golden Pearl 12mm | Price on request |
| Baroque Statement Ring | Already sold: shows **Sold** |
| Lavender Hoops, Rose Petal Ring | Belong to the vendor Konkan Pearl House |
| Coupons WELCOME10, PEARL500, EARRINGS15 | First order 10% off, ₹500 off above ₹10,000, 15% off earrings |
| Manufacturers Zaveri Craftworks, Pune Silver Studio | For purchase orders |
| Routing rule "Pune → Pune team (Koregaon Park franchise)" | Pune enquiries go to the Koregaon Park franchise by themselves |

### What to bring

- A laptop per person, plus one phone for the delivery exercise.
- A small photo on each laptop to use as a product photo and a delivery photo.
- Printed copies of the [Admin Guide](ADMIN-GUIDE.md) sections for each role.

---

## 2. Agenda (about 4 hours)

| Time | Topic | Who |
|---|---|---|
| 0:00 – 0:15 | Welcome. How the business runs on one system: website, admin, partner panels, delivery app. Golden rules: practise on the copy, nothing is deleted, everything is logged, money is head office only. | Everyone |
| 0:15 – 0:30 | Signing in: Team tab and partner tab, codes, signing out. Everyone signs in once. | Everyone |
| 0:30 – 0:45 | Who sees what. Compare menus on two screens (Super Admin and Franchise). | Everyone |
| 0:45 – 1:30 | Catalogue: add, photograph, publish a product; vendor approval; certificates; prices. | Head office, vendors |
| 1:30 – 2:15 | Enquiry to delivered order: the full journey, shared across roles. | Everyone |
| 2:15 – 2:30 | Break | |
| 2:30 – 3:00 | Payments, cash on delivery, returns and refunds. | Head office, city managers |
| 3:00 – 3:30 | Customized orders, purchase orders, pearl pricing. | Head office, city managers |
| 3:30 – 3:45 | Marketing and content: coupons, banners, pages, abandoned carts, push, newsletter. Settings and logins (Super Admin). | Head office |
| 3:45 – 4:00 | Common mistakes, "what to do when…", questions. | Everyone |

Delivery partners can join for 0:00 – 0:30 and 1:30 – 2:15 only.

---

## 3. Hands-on exercises

Do the exercises in order; later ones use orders made in earlier ones. Write down each order number (SP-…) and enquiry reference (ENQ-…) as you go.

### Exercise 1: Everyone signs in (all roles)

1. Team members: admin address → **Team** → email and password → **Continue** → code **123456** → **Sign in**.
2. Partners: **Vendor / Franchise / Delivery** → mobile number → **Continue** → **123456** → **Sign in**.
3. Look at the menu. Check the role and city or partner name under "Sahyadri Pearls".
4. Press **Sign out**, then sign in again.

Note: the sample Staff login has no Dashboard permission, so its welcome page keeps showing a loading sign. Use the menu on the left.

### Exercise 2: Give permissions (Super Admin)

1. **Staff & partner logins** → open **Catalogue Staff**.
2. In **Module permissions**, tick Orders (View, Create, Edit) and Returns & cancellations (View, Edit). Press **Save changes**.
3. Ask the staff trainee to sign out and in again. They now see **Orders**, **Returns** and **Abandoned carts**.
4. Open **Audit log**, choose **Record type** "User" or search "Catalogue Staff", press **Filter**. Find your change.

### Exercise 3: Add and publish a product (Staff)

1. **Products** → **Add product**.
2. Name "Training Pearl Pendant", SKU `TR-PE-0001`, Category Pendants, Origin farm Mulshi Lake Farm.
3. **Price (incl. GST)** ₹9,500. **Stock type** **Quantity stock**, **Quantity** 3.
4. Press **Create product**. The status is draft.
5. Press **Publish**. Read the error: a product needs a photo first.
6. **Add images** → choose your photo. Then press **Publish**.
7. Press **View on site** and find it on the website.
8. Under **Certificates of authenticity**, press **Issue certificate**, then **PDF with QR**. Scan the QR code with a phone (on a local copy it opens a localhost address, which only works on that computer).
9. Press **Unpublish**. Check the piece is gone from the website. Note that the sample Staff login has no **Archive** button, because it has no Delete permission.

### Exercise 4: Vendor product and approval (Vendor, then Staff)

1. Vendor: **My products** → **Add product**. Name "Vendor Training Studs", SKU `TR-EA-0002`, Category Earrings, price ₹3,900, **Quantity stock** 10. Press **Create product**. Add a photo.
2. Vendor: open **Lavender Hoops**. Change **Quantity** to 8 and the price to ₹7,200. Press **Send changes for approval**.
3. Vendor: check the website. The quantity changed at once; the price did not.
4. Staff: **Products** → tick **Waiting for approval**. Open **Lavender Hoops**, read **Changes waiting for approval**, press **Approve**.
5. Staff: open **Vendor Training Studs**. Press **Reject** with the reason "Photo too dark, please retake". Vendor: check it is back in draft.

### Exercise 5: From enquiry to order (Customer, Franchise, Super Admin)

1. Customer: on the website, sign in as Asha (98000 00007, code 123456). Make sure the city is Pune.
2. Customer: open **Classic Studs 7mm** and press **Enquire on WhatsApp**. WhatsApp opens with a message that has a reference like ENQ-26-000001. Write it down. (You do not need to send the WhatsApp message.)
3. Customer: open **Royal Peshwai Haar** (price on request) and press **Enquire on WhatsApp** again.
4. Franchise (Koregaon Park): open **Enquiries**. Both enquiries are there, because Pune enquiries are routed to this franchise.
5. Franchise: open the Classic Studs enquiry. Set **Owner** to yourself. Add the note "Customer wants gift packing" and press **Add note**. See the stage change to in progress.
6. Franchise: press **Convert to order**. Fill in the address and pincode (411004), **Cash on delivery**, then **Create order**. Write down the order number.
7. Franchise: open the Royal Peshwai Haar enquiry and press **Convert to order**. See **Head office sets the price**: you cannot finish this one. Press **Close**.
8. Super Admin: open the same enquiry, **Convert to order**, type the agreed price ₹1,50,000, choose **Bank transfer / UPI to shop**, switch on **Already paid**, type reference "TRAINING-UTR-1", press **Create order**.

### Exercise 6: Pack, assign and deliver (Franchise, Delivery partner, Super Admin)

1. Franchise: open the Classic Studs order. Press **Mark confirmed**, then **Mark packed**. Print the **Packing slip**.
2. Franchise: in **Delivery partner**, choose Vikram Pawar and press **Assign**. The order shows Assigned.
3. Delivery partner (admin address, partner tab, 98000 00005): open **My deliveries**. The job shows **Collect cash ₹…**. Use a phone if it can reach the practice copy (a staging copy, or the same Wi-Fi as a local copy); otherwise use a laptop browser.
4. Press **Picked up from the store**.
5. **Practise no signal:** stay on the job screen and turn on airplane mode (on a laptop, turn off Wi-Fi). Press **Start delivery**. The screen says the update is saved on this phone and shows it as waiting to send. Turn the connection back on. Within a minute the step is sent and the job shows Out for Delivery.
6. At the "door": take a photo, type the code **123456**, switch on **I have collected ₹… in cash**, press **Mark delivered**.
7. Super Admin: open **Payments**. See the yellow cash box. Tick the payment, press **Mark cash received**, confirm.
8. Super Admin: open the order. The payment shows COD Collected and there is now an **Invoice** button.

### Exercise 7: Online payment with a coupon (Customer)

1. Customer (Karan, Mumbai, 98000 00017): add **Tidepool Drop Earrings** to the cart. Enter coupon **EARRINGS15**.
2. Checkout → **Pay online** → **Pay ₹…**.
3. On the test payment page press **Simulate successful payment**. (This page exists on practice copies only.)
4. Mumbai City Manager: open **Orders**. The order is already Confirmed and Paid.
5. Repeat with another piece and press **Simulate failed payment**. The order shows Failed and the piece is back on sale.

### Exercise 8: Return and refund (Customer, Super Admin)

1. Customer (Asha): **My Orders** → the delivered Classic Studs order → **Request a return (within 7 days)**. Choose a reason, add details, **Send request**.
2. Super Admin: **Returns** → **Approve** (add a note) → **Schedule pickup** (type a date like `2026-10-20 11:00`) → **Picked up** → **Mark received**.
3. Super Admin: press **Refund**, keep the suggested amount, confirm. Press **Close**.
4. Open the order and read the timeline. Open **Audit log** and find the refund.

### Exercise 9: Cancellation and scope (Customer, City Managers)

1. Customer (Asha): place a cash-on-delivery order for **Single Pearl Bracelet**. On the order page press **Request cancellation**, give a reason, **Send request**.
2. Pune City Manager: **Returns** → **Approve**. The order is cancelled and the stock comes back.
3. Pune City Manager: note that there is no **Refund** button. Refunds are head office only.
4. Pune City Manager: copy the web address of a Pune order. Mumbai City Manager: paste it into the browser. It says not found. This is how city limits work.

### Exercise 10: Unique piece race (Customers)

1. Two people on two computers, as two different customers, add **Solitaire Pearl Ring** to the cart.
2. Both go to checkout and press **Pay online** at the same moment.
3. Only one gets the payment page. The other is told the piece is reserved in another checkout and to try again in a few minutes.
4. Look at **Baroque Statement Ring** on the website: it shows **Sold** and **Enquire about a similar piece**.

### Exercise 11: Customized order and purchase order (Customer, Super Admin, City Manager)

1. Customer (Asha, city Pune): open **Customized Jewellery** on the website. Fill in a ring request with a budget of ₹40,000. Submit.
2. Pune City Manager: open **Customized orders**. The request is there. Open it and read the requirement. Note there are no cost fields.
3. Super Admin: open it. Under **Cost breakdown and quote**, type Metal ₹12,000, Labour ₹5,000, Pearl ₹9,000, Margin ₹8,000. Press **Save quote**, then **Move to quoted**.
4. Super Admin: fill in **Record the advance** (₹20,000, Bank transfer / UPI, a reference, an address) and press **Record advance and create order**.
5. Super Admin: press **Raise a purchase order**. Manufacturer Pune Silver Studio, a short specification, agreed cost ₹24,000, a due date. Press **Create and generate PDF**. Open the **PDF**.
6. Super Admin: press **Mark sent**. See that the PO can no longer be edited.
7. City Manager: on the customized order, press **Move to in manufacturing**, then **Move to quality check**, then **Move to ready**.

### Exercise 12: Pricing (Staff or Super Admin)

1. **Price calculator** → search "Mulshi Baroque Strand" in **Price an existing piece (optional)**.
2. Press **Calculate**. Read which rate and margin rule were used.
3. Change **Grade** and calculate again. Compare.
4. Do not press **Apply to …** unless the trainer says so.

### Exercise 13: Marketing and content (Staff or Super Admin)

1. **Coupons & offers** → **Add coupon**: code `TRAINING10`, **Percentage**, 10%, maximum ₹1,000, ends tomorrow, **Show on offers page** on. **Create coupon**. Check the website's Offers page.
2. **Banners** → **Add banner**: **Home – secondary**, a title, your photo, link `/jewellery`. **Create banner**. Check the home page.
3. **Pages & legal** → open **Refund Policy** → add one sentence → **Publish new version**. Open **Version history**.
4. **FAQ** → **Add question** → **Create question**.
5. **Push notifications** → **New notification** → **Save draft** → **Send now**. Note the yellow box: on a practice copy without Firebase keys, nothing reaches phones.
6. **Abandoned carts**: if a cart is listed, press **Remind now**. Then open **Message log** and find the reminder. Note the **Send on WhatsApp** link.

### Exercise 14: Settings and logins (Super Admin only)

1. **Settings** → **Proof of delivery** → change the value to ₹10,000 → **Save**. Now any order of ₹10,000 or more needs the customer's code. Change it back.
2. **Delivery partners** → **Add delivery partner** (name, a new 10-digit mobile, city Pune) → **Create delivery partner**.
3. **Staff & partner logins** → **Add login** → Role Delivery Partner → link the new partner → **Create login**.
4. Open the login and press **Deactivate**. Try to sign in as that partner: it fails. Press **Activate**.

---

## 4. Common mistakes and how to avoid them

| Mistake | What happens | How to avoid it |
|---|---|---|
| Practising on the live site | Real customers get messages; pieces get reserved; reports and GST registers include fake sales | Always check the web address before you start. Practise only on the practice copy. |
| Publishing without checking photos and price | Wrong price or no photo on the website | Use **View on site** after publishing. Approving a vendor's new product publishes it even without a photo. |
| Changing the price after an order is placed and expecting the order to change | The order keeps the price it was placed at | See "Wrong price" in section 5. |
| Not adding a note after replying on WhatsApp | The enquiry still looks unanswered and the response time is wrong | Always **Add note** after you reply. |
| Switching on **Already paid** before the money arrives | The order shows paid and an invoice is made for money you do not have | Only switch it on when the money is in the bank and you have the reference. |
| Pressing **Mark delivered** on the order page (head office) instead of the rider doing it | No photo, no code, no cash recorded; only your note | Let the rider complete delivery in the app. If you must do it, write exactly how it was handed over, and record the cash with **COD collected**. |
| Rider marking delivered before collecting cash | Cash is recorded as collected but is not in hand | Collect the exact cash first, then switch on **I have collected ₹… in cash**. |
| Not handing cash to the office daily | Cash builds up on **Payments** as "not yet received" | Riders hand over cash daily; head office presses **Mark cash received**. |
| Pressing **Restock** on a returned piece | Not needed; it already went back on sale | Use **Returns** → **Mark received**. Use **Restock** only for sales that were not handled through Returns. |
| Marking a PO **Mark sent** before checking it | A sent PO cannot be changed | Open the **PDF** and check it first. If it is wrong, **Close** it and make a new one. |
| Editing the **Content** box of a page block carelessly | The save fails or the block shows wrongly | Change only the words between quote marks. |
| Sharing logins | The audit log shows the wrong person; you cannot remove one person's access | One login per person. Ask a Super Admin to add a login. |
| Leaving someone's login active after they leave | They can still sign in | Super Admin presses **Deactivate** on the same day. |
| Ticking "Payments → Edit" or "Settings → Edit" for staff who do not need it | They can refund money or change GST and delivery charges | Give the least access needed. |

---

## 5. What to do when…

### A customer did not get the sign-in code

1. Check the mobile number is correct (10 digits).
2. Ask them to wait a minute; codes work for 5 minutes.
3. Too many tries: after 5 codes in 15 minutes they must wait.
4. On the live site, codes to mobiles need the owner's SMS service. If it is not set up yet, customers cannot sign in with their mobile. They can still buy as a guest, and track the order with the link sent to them or shared by you from **Tracking page**.
5. On the live site, one-time codes are hidden in the **Message log** once sent. Never ask a customer to read their code to you.

### A team member or partner did not get the code

1. Team: on the code screen, press **Send code by email instead**.
2. Partners: sign in with your **email** instead of your mobile.
3. Check that the email or mobile on your login is right. A Super Admin can fix it in **Staff & partner logins**.

### A payment shows Pending

1. Online orders: the customer may still be paying. A unique piece is held for 15 minutes. If they do not pay, the order becomes Failed by itself and the piece goes back on sale.
2. If the customer says they paid but the order is still Pending after some minutes, ask for the payment reference and tell your Super Admin. They check the payment gateway's dashboard; the payment message from the gateway can be sent again from there.
3. If the payment arrives after the piece was sold to someone else, the order shows Failed and the money is refunded automatically. Call the customer and offer a similar piece.
4. Bank transfer or UPI orders: head office records the payment with **Record a payment** → **Bank transfer** once the money is in the bank.
5. Cash on delivery orders show COD Pending until the rider collects the cash.

### A rider is offline

1. The rider keeps working. Steps are saved on the phone and sent when the signal comes back. The app says it is offline.
2. The rider must not uninstall the app or clear its data while steps are waiting.
3. The customer's delivery code is sent when the **Start delivery** step reaches the office. If the rider pressed it with no signal, the code goes out only once the phone reconnects.
4. If a saved step is refused (for example the order was cancelled meanwhile), it shows **Not accepted** with the reason. The rider presses **Dismiss** and calls the office.
5. If the customer has no code and the order does not require one, the rider uses the signature instead.

### A piece shows Sold

1. A unique piece is sold once paid online or once a cash-on-delivery or manual order is placed. This is correct; it cannot be sold twice.
2. If it says sold but the sale was cancelled through **Returns**, it should already be back on sale. Refresh the page.
3. If the sale fell through outside the system, head office opens the product and presses **Restock**.
4. While someone is paying online, a unique piece is held for 15 minutes and cannot be bought by others. Wait and check again.
5. To sell to another customer, use **Enquire about a similar piece** and offer something similar.

### The price is wrong

1. **On the website**: head office opens the product, corrects **Price (incl. GST)** and presses **Save changes**. Or use the **Price calculator** and **Apply to …**. If a vendor changed it, head office checks the change before pressing **Approve**.
2. **On an order already placed**: the order price cannot be edited. Head office either gives a partial refund for the difference (order page → **Refund**), or cancels the order and makes a new manual order with the correct agreed price.
3. **Price-on-request piece**: only head office can type the agreed price on an order. City managers and franchises must ask head office.
4. **Coupon not applying**: check the coupon's dates, minimum order value, category or piece limits, uses left, and **First order only**.

### An enquiry is lost or the customer quotes a reference you cannot find

1. Search the reference in **Enquiries**. References that start with ENQ-W- were made on the customer's phone while our system was slow; they are still found by search.
2. Search by the customer's phone number.
3. A City Manager or franchise only sees their own enquiries. Ask head office to search.

### A message did not reach the customer

1. Open **Message log** and filter by status FAILED. Press **Retry**.
2. If WhatsApp Business is not set up yet, press **Send on WhatsApp** to send it from your own WhatsApp.

### A delivery needs the customer's code but the customer never gets it

1. The rider presses **Send the code to the customer again**.
2. Delivery codes go by SMS. On the live site this needs the owner's SMS service.
3. If the code still does not arrive, the rider calls the office. Head office decides; they can mark the order delivered from the order page, which asks them how it was handed over. It records no photo or code, so be specific.

---

## 6. Glossary

| Word | Meaning |
|---|---|
| Admin | The back-office website used by head office and partners, at your web address + `/admin`. |
| Audit log | The permanent record of every change: who, what, before and after, when, from where. Nobody can edit it. |
| Certificate | Our certificate of authenticity for a piece, with a code like CERT-SP-NE-0001-… and a QR code that opens the piece and its farm. It is our own grading, not a laboratory report. Head office only. |
| City Manager | A team member who runs one city. Sees only that city. |
| COD | Cash on delivery. The rider collects cash at the door. |
| COD reconciliation | Head office confirming that riders' cash reached the office (**Mark cash received**). |
| Code / OTP | The 6-digit one-time code used to sign in, and the customer's delivery code. Valid for 5 minutes. |
| Customized order | A made-to-order piece: requirement, quote, advance, purchase order, production, delivery. |
| Delivery partner | A rider who delivers orders, using the delivery app. |
| Enquiry | A customer question saved before WhatsApp opens. Reference like **ENQ-26-000123** (ENQ, year, number). |
| Franchise | A partner store in a city that handles enquiries and orders assigned to it. |
| GST | Goods and Services Tax. Catalogue prices include GST. |
| HSN code | The tax code printed on invoices (7113 for jewellery, 7101 for loose pearls). |
| Invoice number | Like **SP/2026-27/00001**: prefix, financial year, number. |
| Manufacturer | A workshop that makes customized pieces and receives purchase orders. |
| Order number | Like **SP-2610-00042**: SP, year and month, number. |
| Price on request | A piece with no price on the website. Customers can only enquire. Head office sets the agreed price on the order. |
| Purchase order (PO) | Our order to a manufacturer. Number like **PO-2026-00007**. Fixed once sent. |
| Quantity stock | A piece we have several of. |
| Routing rule | Decides which WhatsApp number, franchise or person gets a new enquiry, by city and type. |
| SKU | The product code, like SP-NE-0001. |
| Super Admin | The owner-level login. Manages logins, permissions, settings and feature switches. |
| Staff | Head office team member. Sees only the modules a Super Admin grants. |
| Unique piece | One of a kind. It can be sold only once and is held for 15 minutes while a customer pays online. |
| Vendor | A supplier who lists their own products (after approval) and packs orders assigned to them. |
