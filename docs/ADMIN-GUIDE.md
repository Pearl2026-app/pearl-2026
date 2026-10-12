# Admin Guide

This guide is for the people who run Sahyadri Pearls every day: head office, city managers, vendors, franchises and delivery partners. It explains how to sign in, what you will see, and how to do common jobs, step by step.

Words in **bold** are the exact names of menus, buttons and fields on screen.

Training notes and practice exercises are in [TRAINING.md](TRAINING.md).

---

## Contents

1. [Before you start](#1-before-you-start)
2. [Signing in](#2-signing-in)
3. [Who sees what](#3-who-sees-what)
4. [Super Admin](#4-super-admin)
5. [Staff (head office)](#5-staff-head-office)
6. [City Manager](#6-city-manager)
7. [Vendor](#7-vendor)
8. [Franchise](#8-franchise)
9. [Delivery partner](#9-delivery-partner)
10. [Helping customers](#10-helping-customers)
11. [Order and payment status, explained](#11-order-and-payment-status-explained)
12. [Things that depend on the owner's setup](#12-things-that-depend-on-the-owners-setup)

---

## 1. Before you start

### Where things are

| What | Address on a local copy | On the live site |
|---|---|---|
| Website (customers) | http://localhost:3000 | your shop's web address |
| Admin and partner panel | http://localhost:3001/admin | your web address + `/admin` |
| Delivery app | Android and iPhone app "Sahyadri Pearls Delivery" (once published), or **My deliveries** in the admin on a phone browser | same |

### Golden rules

- **Practise on a local or staging copy, never on the live site.** The live site has real customers and real money.
- **Nothing important is deleted.** Products are archived, people and partners are deactivated. History stays for reports and tax.
- **Everything is recorded.** Every change by staff and partners goes into the **Audit log**: who, what, before and after, when and from which internet address.
- **Money is careful on purpose.** Refunds, recording payments, changing prices on orders, setting customized quotes and issuing certificates are for head office only. Partners will not see these buttons.
- **If you cannot see a menu or button, you do not have the permission for it.** Ask your Super Admin. Hiding a menu is not the only protection: the system also refuses the action.

### Sample logins (sample data only)

> **Sample data only. These logins exist only on a development or training copy that was filled with sample data. Change or remove them before going live.** The live system starts with one owner login and no sample data.

The team password is whatever was set in `SEED_PASSWORD` when the sample data was loaded. If nobody set it, the sample default is `Sahyadri@2026`.

On a development copy, every one-time code is **123456** (the `DEV_FIXED_OTP` value). This works only on a development copy, never on the live site.

| Role | Sign in with | Name and scope |
|---|---|---|
| Super Admin | admin@sahyadripearls.test + password | Super Admin, everything |
| Staff | staff@sahyadripearls.test + password | Catalogue Staff: Products, Categories, Collections, Farms, Enquiries, Content & pages |
| City Manager | pune.manager@sahyadripearls.test + password | Pune City Manager |
| City Manager | mumbai.manager@sahyadripearls.test + password | Mumbai City Manager |
| Vendor | vendor@sahyadripearls.test or 98000 00003 | Rohan Sawant, Konkan Pearl House |
| Vendor | vendor2@sahyadripearls.test or 98000 00013 | Meera Kulkarni, Deccan Settings |
| Franchise | franchise.pune@sahyadripearls.test or 98000 00004 | Anita Deshmukh, Sahyadri Pearls Koregaon Park (Pune) |
| Franchise | franchise.mumbai@sahyadripearls.test or 98000 00014 | Farah Khan, Sahyadri Pearls Bandra (Mumbai) |
| Delivery partner | 98000 00005 | Vikram Pawar (Pune) |
| Delivery partner | 98000 00015 | Suresh Naik (Mumbai) |
| Customer (website) | 98000 00007 | Asha Patil (Pune) |
| Customer (website) | 98000 00017 | Karan Mehta (Mumbai) |

---

## 2. Signing in

Open the admin address. You will see **Admin and partner sign-in** with two tabs: **Team** and **Vendor / Franchise / Delivery**.

### Team: Super Admin, Staff, City Manager (email + password + code)

1. Choose the **Team** tab.
2. Type your **Email** and **Password**.
3. Press **Continue**.
4. A 6-digit code is sent to you. It goes by SMS if your mobile number is on file and SMS is set up; otherwise by email.
5. Type it in **One-time code** and press **Sign in**.
6. If the SMS does not arrive, press **Send code by email instead**.
7. If you made a mistake, press **Start again**.

### Partners: Vendor, Franchise, Delivery partner (mobile or email + code)

1. Choose the **Vendor / Franchise / Delivery** tab.
2. Type your **Email or mobile number**. A 10-digit mobile number is fine; you do not need +91.
3. Press **Continue**.
4. Type the 6-digit code in **One-time code** and press **Sign in**.
5. Delivery partners go straight to **My deliveries**. Everyone else sees their **Dashboard**.

A code sent to a mobile needs the SMS service to be set up by the owner. A code sent to an email needs the email service. See [section 12](#12-things-that-depend-on-the-owners-setup).

### Rules about codes

- A code works for **5 minutes**.
- You get **5 tries** at typing a code.
- You can ask for at most **5 codes in 15 minutes** per mobile or email. After that, wait.
- For safety, the system gives the same answer whether or not a number has an account. If no code arrives, check you typed the number or email that head office registered.

### Signing out

Press **Sign out** at the top right. Always sign out on a shared computer.

### Forgot your password?

There is no self-service reset. Ask a Super Admin to press **Reset password** on your login (see [4.2](#42-add-or-change-a-login)).

---

## 3. Who sees what

The menu on the left shows only what your role may use. Your role and your city, vendor, franchise or delivery partner name are shown under "Sahyadri Pearls" at the top of the menu.

| Menu | Super Admin | Staff | City Manager | Vendor | Franchise | Delivery |
|---|---|---|---|---|---|---|
| Dashboard | Yes | If granted | Own city | Own products and orders | Own enquiries and orders | — |
| Enquiries | Yes | If granted | Own city | — | Assigned to them | — |
| Orders | Yes | If granted | Own city | Assigned to them | Assigned to them | — |
| Customized orders | Yes | If granted | Own city | — | — | — |
| Purchase orders | Yes | If granted | Own city (view only) | — | — | — |
| Payments | Yes | If granted | Own city (view only) | — | Own orders (view only) | — |
| Returns | Yes | If granted | Own city | — | Own orders (view only) | — |
| Abandoned carts | Yes | If Orders granted | — | — | — | — |
| My deliveries | — | — | — | — | — | Yes |
| Products | Yes | If granted | Sold in their city (view only) | Their own (**My products**) | View only | — |
| Categories, Collections, Farms | Yes | If granted | — | — | — | — |
| Certificates | Yes | If Products granted | — | — | — | — |
| Reviews | Yes | If granted | — | — | — | — |
| Customers | Yes | If granted | Own city (view only) | — | — | — |
| Coupons & offers | Yes | If granted | — | — | — | — |
| Push notifications, Message log, Newsletter | Yes | If granted | — | — | — | — |
| Banners, Home & page blocks, Pages & legal, Testimonials, Gallery, FAQ | Yes | If granted | — | — | — | — |
| Careers, Job applications | Yes | If granted | — | — | — | — |
| Cities | Yes | If granted | — | — | — | — |
| Vendors, Franchises, Manufacturers | Yes | If granted | Own city (view only) | — | — | — |
| Delivery partners | Yes | If granted | Own city (view and edit) | — | — | — |
| Price calculator | Yes | If granted | Yes | — | Yes | — |
| Pearl rates, Margin rules | Yes | If granted | — | — | — | — |
| Reports | Yes | If granted | Own city | Own data | Own data | — |
| WhatsApp numbers & routing | Yes | If granted | — | — | — | — |
| Staff & partner logins | Yes | **Never** | — | — | — | — |
| Settings | Yes | If granted | — | — | — | — |
| Audit log | Yes | View, if granted | — | — | — | — |

"Own city" means the system only ever shows that city's records. If a City Manager opens a link to another city's order, they get "not found".

Cost fields (metal, labour, pearl cost) are hidden from City Managers and Franchises.

---

## 4. Super Admin

A Super Admin can do everything in this guide, across every city. Only a Super Admin can do the jobs in this section.

### 4.1 First jobs after going live

1. **Settings** → **Business details (printed on invoices)**: fill in **Legal name**, **GSTIN**, **Registered state**, **State code (GST)** and **Address**. Press **Save**. Invoices say SAMPLE until the GSTIN is filled in.
2. **Settings** → **Payment methods**: switch **Online payment** and **Cash on delivery** on or off. Set **Highest order value for cash on delivery**. Press **Save**.
3. **Settings** → **Delivery charges**, **Returns**, **Referral rewards**, **Proof of delivery**: check each and press **Save**.
4. **Cities**: check your cities exist and are active.
5. **Staff & partner logins**: add your team (see 4.2). Remove or change all sample logins.

### 4.2 Add or change a login

For a vendor, franchise or delivery partner, first create the business record under **Vendors**, **Franchises** or **Delivery partners** (see 5.16). Then give the person a login.

1. Open **Staff & partner logins**.
2. Press **Add login**.
3. Choose the **Role**: Super Admin, Admin / Staff, City Manager, Vendor, Franchise or Delivery Partner.
4. Fill in **Name**, **Email** and **Mobile number**.
   - Team roles (Super Admin, Staff, City Manager) need an email and a **Password** of at least 10 characters.
   - Partners sign in with their email or mobile number and a code, so no password.
5. Link the login:
   - City Manager → choose the **City**.
   - Vendor → choose the **Vendor**.
   - Franchise → choose the **Franchise**.
   - Delivery Partner → choose the **Delivery partner**.
6. For Staff, tick the boxes in **Module permissions** (see 4.3).
7. Press **Create login**.

To change a login later, open it from the list, change the details and press **Save changes**. The role cannot be changed after creation; make a new login instead.

Other buttons on a login:

- **Reset password** (team roles): type the new password when asked.
- **Deactivate**: the person is signed out at once and cannot sign in. Their history stays. Use this when someone leaves.
- **Activate**: lets them back in.

### 4.3 Give staff permissions

Staff see only the modules you tick. For each module you can tick **View**, **Create**, **Edit** and **Delete**. Ticking Create, Edit or Delete also ticks View.

1. Open **Staff & partner logins** and click the staff member.
2. In **Module permissions**, tick what they need. Examples:
   - Catalogue team: Products, Categories, Collections, Farms (View, Create, Edit).
   - Order desk: Orders, Enquiries, Returns & cancellations (View, Create, Edit).
   - Accounts: Payments (View, Edit) to record payments and refunds.
3. Press **Save changes**.

Be careful with:

- **Payments → Edit**: lets the person record payments and issue refunds.
- **Products → Delete**: lets the person archive products.
- **Settings → Edit**: lets the person change GST details, payment methods and delivery charges.
- **Audit log**: staff can only ever view it. Nobody can change or delete it.
- Logins and their rights are not in the table: only a Super Admin manages **Staff & partner logins**.

### 4.4 Feature switches

**Settings** → **Features switched on later** lists features that are built but kept off (vendor commissions and settlements, live GPS tracking, multi-currency, loyalty points). Only a Super Admin can switch them. Do not switch one on without talking to your developer first.

### 4.5 Audit log

1. Open **Audit log**.
2. Type a person's name or a record id in **User name or record id**.
3. Choose a **Record type** (for example Order, Product, Setting) or leave **All records**.
4. Press **Filter**.

Each row shows **When**, **Who**, **Action**, **Record**, **Changes** (before and after) and **IP**. Entries cannot be edited or deleted by anyone.

---

## 5. Staff (head office)

Staff see only the modules a Super Admin has granted (see 4.3). Each task below says which module you need. A Super Admin can do all of these too.

### 5.1 Add a product

Needs: Products (Create, Edit).

1. Open **Products** and press **Add product**.
2. Fill in **Basics**: **Name**, **SKU**, **Category**, **Collection**, **Origin farm**, **Vendor** (leave empty for our own stock) and **Description**.
3. Fill in **Price and costs**:
   - **Price (incl. GST)**: the price the customer pays, in ₹.
   - **Was price (optional)**: shows a crossed-out older price.
   - **Price on request (hide price and Add to Cart)**: switch on for rare pieces sold through enquiry only.
   - **Metal cost**, **Labour cost**, **Pearl cost**: for our records. Customers never see these.
4. Fill in **Pearl specification**: **Carat weight**, **Shape**, **Colour**, **Lustre**, **Surface**, **Grade**, **Size (mm)**, **Metal / setting**, **Certification**.
5. Fill in **Stock**:
   - **Stock type**: **Unique piece (sold once)** or **Quantity stock**.
   - **Quantity** (only for quantity stock).
   - **Mark out of stock**, **Feature on the home page**, **Sort order**.
6. In **Where it is sold**, choose **Cities** (none selected = every city) and **Related pieces**.
7. Leave **Search engines** empty unless you want your own title and description.
8. Press **Create product**. The product is saved as a draft. Customers cannot see it yet.

### 5.2 Add photos and video

Needs: Products (Edit).

1. Open the product.
2. Under **Images**, press **Add images** and choose one or more photos. They are cropped square and compressed automatically.
3. Drag photos to change the order. Press **Make main** on the photo customers should see first. Press **Remove** to delete a photo.
4. Under **Video**, press **Upload video** (MP4, WebM or MOV). Use **Replace video** or **Remove** to change it.

Many photos at once: on the **Products** list, press **Bulk upload images**. Name each file by SKU, for example `SP-NE-0001.jpg`, or `SP-NE-0001_2.jpg` for a second photo. The message tells you which files did not match a SKU.

### 5.3 Publish a product

Needs: Products (Edit).

1. Open the product.
2. Check it has at least one photo. A product without a photo cannot be published.
3. Press **Publish**. It now shows on the website and apps.
4. Press **View on site** to check it.
5. To take it off the site without losing it, press **Unpublish**.

### 5.4 Approve a vendor's product or changes

Needs: Products (Edit).

Vendors can add products and change their own products, but nothing goes live until head office approves it. Stock changes by vendors apply straight away.

1. Open **Products** and tick **Waiting for approval**.
2. Open a product. A new product shows the status pending approval. A live product with changes shows a yellow box **Changes waiting for approval**, listing each change.
3. Check the details, photos and price.
4. Press **Approve** to accept. A new product goes live at once. Changes to a live product are applied.
5. Or press **Reject** and type the reason. A rejected new product goes back to draft. Rejected changes are thrown away.

Check the photos before you press **Approve**. A new product without a photo cannot be approved, just as it cannot be published.

### 5.5 Archive, restore or restock a product

- **Archive** (needs Products → Delete): takes the product off the site for good. It stays in old orders and reports.
- **Restore**: brings an archived product back as unpublished.
- **Restock**: appears on a sold unique piece. Use it only when the piece is really back in the shop (for example after a cancelled sale that was not handled through **Returns**). Press it and confirm **Put this piece back on sale?**

A unique piece goes back on sale by itself when a cancellation is approved or a return is marked received. You do not need **Restock** in those cases.

### 5.6 Import products from a spreadsheet

Needs: Products (Create).

1. On **Products**, press **Import CSV**.
2. Press **Download the template** and fill it in. Rows are matched by SKU: new SKUs are created, existing ones are updated.
3. Choose your file.
4. Press **Check file**. Nothing is saved yet. Fix any rows with errors and check again.
5. When there are no errors, press **Import** (it shows the number of rows).

### 5.7 Certificates of authenticity

Needs: Products (Edit). **Head office only.** Vendors, franchises and city managers cannot issue certificates.

1. Open the product.
2. Under **Certificates of authenticity**, press **Issue certificate**.
3. A certificate code appears (for example `CERT-SP-NE-0001-…`). Press **PDF with QR** to download and print it.
4. The QR code on the certificate opens the piece's page and its farm on the website, so customers can check it is genuine.

To see every certificate, open **Certificates**. Each row shows the code, product, date, status (**Valid** or **Revoked**) and a **PDF** link.

To withdraw a certificate (for example, a piece found to be misgraded), head office presses **Revoke** on its row and confirms. Its QR code then shows it as revoked. This cannot be undone.

### 5.8 Categories, collections and farms

Needs: Categories, Collections or Farms (Create, Edit).

1. Open **Categories**, **Collections** or **Farms**.
2. Press **Add category**, **Add collection** or **Add farm**.
3. Fill in the form. For a category, set **GST rate** and **HSN code**: these are printed on invoices. For a farm, the **Farm story** and **Main photo** appear on the farm's own page on the website.
4. Press **Create category** (or **Create collection**, **Create farm**).
5. To hide one, open it and press **Archive** (needs Delete) or switch off **Active** and press **Save changes**.

### 5.9 Handle an enquiry

Needs: Enquiries (Edit).

Every tap on **Enquire on WhatsApp** on the website, and every customized, bulk, contact, Ring Finder and consultation request, is saved in **Enquiries** before WhatsApp opens. Each has a reference like **ENQ-26-000123**. The customer's WhatsApp message carries the same reference.

1. Open **Enquiries**. Use the tabs **All**, **New**, **In progress**, **Quoted**, **Converted**, **Closed**.
2. Search by reference, name, phone or SKU. Tick **Mine** to see only yours.
3. The **Response** column shows how long a new enquiry has waited. Red means it is past the target set in **Settings** → **Enquiries**.
4. Open the enquiry. Check **Details**: product and price, customer, city, source and page.
5. Under **Work this enquiry**, set **Owner** to yourself.
6. Press **Reply on WhatsApp** to open a chat with the customer with a ready greeting.
7. Write what was discussed under **Add a note** and press **Add note**. Notes are internal; the customer never sees them.
8. Change **Stage** as you go: new → in progress → quoted → closed.

Any change to stage or owner, or any note, stops the response timer. Pressing **Reply on WhatsApp** alone does not, so always add a note.

The first note on a new enquiry moves it to **In progress** by itself.

Head office and City Managers can also hand the enquiry to a **Franchise**.

If a customer quotes a reference like **ENQ-W-XXXXXXXX**, their phone made it while our system was slow. Search for it in **Enquiries**; it is linked to the real enquiry.

### 5.10 Convert an enquiry into an order

Needs: Enquiries (Edit) and Orders (Create).

1. Open the enquiry and press **Convert to order**.
2. The order form opens with the customer, city and piece already filled in.
3. Check the **Pieces**. For a price-on-request piece, type the agreed price in rupees. Head office can also type an agreed price for any other piece.
4. Fill in the **Delivery address** and **Pincode**.
5. Choose the payment method:
   - **Cash on delivery**.
   - **Bank transfer / UPI to shop**. If the money is already in, head office switches on **Already paid** and types the **Payment reference**. Other logins do not see this switch: create the order, and head office records the payment on it.
   - **Other**.
6. Add a **Coupon code** if one applies. Switch off **Charge delivery as per settings** if delivery is free for this customer.
7. Press **Create order**. You go to the new order, with a number like **SP-2610-00042**. The enquiry is marked converted.

Orders made in the admin cannot be paid online: an online payment can only start at the customer's own checkout. Take cash on delivery or a bank transfer / UPI.

Customized enquiries do not have **Convert to order**. Use **Open the customized order** instead (see 5.13).

### 5.11 Take an order by phone, WhatsApp or in the shop

Needs: Orders (Create).

1. Open **Orders** and press **New manual order**.
2. Under **Pieces**, type at least 2 letters in **Find a piece by name or SKU** and pick the piece. Sold or out-of-stock pieces are greyed out.
3. Fill in **Customer**, **Delivery address**, **Payment and notes** as in 5.10.
4. Press **Create order**.

A unique piece is reserved as soon as the order is created, so it cannot also be sold online.

### 5.12 Run an order from start to finish

Needs: Orders (Edit). Recording money needs Payments (Edit) as well.

Open **Orders**. Filter by status, payment, city, vendor, franchise, manufacturer, dates or value, then press **Filter**. Open an order.

The buttons at the top only offer the next allowed steps.

1. **Confirm**: press **Mark confirmed** once you have checked stock and details. (Online orders are confirmed by themselves when payment arrives.)
2. **Pack**: press **Mark packed** when the parcel is ready. Print the **Packing slip**. For a gift order, print the **Gift packing slip**, which has no prices, and pack the message card.
3. **Assign delivery**: in the **Delivery partner** box, choose a partner in the order's city and press **Assign**. A packed order moves to **Assigned** and the partner gets a notification. (You can choose the partner before packing; the order moves to Assigned when it is packed.)
4. **Delivery steps**: the delivery partner does **Picked Up**, **Out for Delivery** and **Delivered** from their phone, with a photo and the customer's code or signature (see section 9).
5. **Cash on delivery**: when the rider marks the order delivered, the cash is recorded and the payment shows **COD Collected**. When the rider hands the cash to the office, record it in **Payments** (see 5.14).

Other buttons:

- **Cancel order**: asks for a reason. The piece goes back on sale.
- **Mark failed** / **Mark returned**: ask for a reason.
- **Unassign (back to packed)**: takes the job away from the delivery partner.
- **Invoice SP/2026-27/…**: appears once the order is paid. A cash-on-delivery invoice is made when the cash is collected.
- **Tracking page**: the page the customer sees.
- **Assignments** (head office and City Managers): set the **Vendor**, **Franchise** or **Manufacturer** for the order.

Head office and City Managers can also press **Mark picked up** and **Mark out for delivery** on the order page. Only head office sees **Mark delivered** there, and it asks how the order was handed over (for example, "collected at the store, bill 123"); the answer is kept in the timeline. It records no photo, code or cash, so use it only when the rider could not finish in the app, and record any cash with **COD collected** (5.13).

If you see **Payment arrived after the piece was released. A refund was started automatically.**, the customer paid too late and the piece had already been sold. The refund is automatic; call the customer to explain.

### 5.13 Record a payment by hand

Needs: Payments (Edit). **Head office only.**

Use this when money comes outside the website: cash, bank transfer or UPI to the shop.

1. Open the order. Find the **Record a payment** box.
2. Press **COD collected** (cash orders) and confirm the amount, or press **Bank transfer** and type the bank or UPI reference.
3. The full order amount is recorded. The order shows **Paid** or **COD Collected** and the invoice is made.

Partial payments are only allowed on customized orders.

### 5.14 Cash received at the office (COD reconciliation)

Needs: Payments (Edit).

1. Open **Payments**. A yellow box says how much cash on delivery is collected but not yet received at the office. Press **Show them**, or tick **COD not yet received**.
2. Count the cash from the rider. Tick the matching payments.
3. Check the total shown, then press **Mark cash received** and confirm.

### 5.15 Returns, cancellations and refunds

Needs: Returns & cancellations (Edit). Refunds need Payments (Edit) and are **head office only**.

Customers ask for a return or cancellation from their order page. Requests appear in **Returns**.

1. Open **Returns**. Filter by status and type (**Returns** or **Cancellations**).
2. For a new request, press **Approve** (you can add a note for the customer) or **Reject** (you must give a reason; it is sent to the customer).
   - Approving a **cancellation** cancels the order and puts the piece back on sale.
3. For an approved **return**:
   1. Press **Schedule pickup** and type the date and time, like `2026-10-12 14:00`.
   2. When collected, press **Picked up**.
   3. When the piece is back at the shop and checked, press **Mark received**. The piece goes back on sale and the order shows **Returned**.
4. Press **Refund**. For a paid order, type the amount in ₹ (it suggests the full order value) and confirm. Online payments go back through the payment gateway. For cash or bank payments the refund is recorded, and you pay the customer back by hand.
5. Press **Close** when everything is done.

Each step sends the customer an update.

You can also refund from the order page: in the **Refund** box, type the **Amount** and **Reason**, then press **Refund**. You can never refund more than was paid.

### 5.16 Cities, vendors, franchises, manufacturers, delivery partners

Needs: the matching module (Create, Edit).

1. Open **Cities**, **Vendors**, **Franchises**, **Manufacturers** or **Delivery partners**.
2. Press **Add city** (or **Add vendor**, **Add franchise**, **Add manufacturer**, **Add delivery partner**).
3. Fill in the form:
   - City: **City name**, **State**, and **Delivery charge override** if this city has a different charge.
   - Vendor: **Vendor name**, **Phone**, **Cities served**.
   - Franchise: **Franchise name**, **City**, **Area**, **Address**, **Phone**. Switch on **Show on the website's "Visit us" page** only when the franchise agrees to have its address and phone published.
   - Manufacturer: **Name**, **City**, **Speciality**.
   - Delivery partner: **Name**, **Mobile number** (they sign in with this), **Vehicle**, **Cities**.
4. Press **Create city** (or **Create vendor**, **Create franchise**, **Create manufacturer**, **Create delivery partner**).
5. A Super Admin then gives the person a login (4.2).

To stop working with someone, open the record and press **Deactivate**. Their history stays.

A new city is live as soon as it is added. No developer is needed.

### 5.17 Customized orders and purchase orders

Needs: Customized orders and Purchase orders. **Only head office sets costs and the quote.**

Customized requests from the website's Customized Jewellery page appear in **Customized orders** by themselves. Stages run: Requirement → Quoted → Advance Paid → PO raised → In Manufacturing → Quality Check → Ready → Dispatched → Delivered.

**Start one by hand**

1. Open **Customized orders** and press **New customized order** (or **Start a customized order** on an enquiry).
2. Fill in **Customer** and **Requirement**: **Jewellery type**, **Metal**, **Size**, **Weight (grams)**, **Pearl details**, **Design notes**, **Customer budget (₹)**.
3. Press **Start customized order**.

**Quote**

1. Open the customized order.
2. Under **Cost breakdown and quote**, type **Metal**, **Labour**, **Pearl** and **Margin** in ₹. The quote including 3% GST is worked out for you.
3. Press **Save quote**, then **Move to quoted**. Send the quote to the customer on WhatsApp.
4. Add design files or photos under **Images and design files** and press **Upload**.

**Advance**

1. When the customer pays the advance, fill in **Record the advance**: amount, how they paid, reference and delivery address.
2. Press **Record advance and create order**. A normal order is created for the full quote. The quote is now locked.

**Purchase order to the workshop**

1. On the customized order, press **Raise a purchase order**. (Or open **Purchase orders** → **New purchase order**.)
2. Choose the **Manufacturer**, write the **Specification**, **Quantity**, **Agreed cost (₹)**, **Due date** and **Notes**.
3. Press **Create and generate PDF**. The PO gets a number like **PO-2026-00007** and the customized order moves to **PO raised**.
4. Press **PDF** to check it. While it is a draft you can change it and press **Save and regenerate PDF**.
5. Press **Mark sent**. If the manufacturer has an email, the PDF link is emailed to them. **After this the PO cannot be changed.** If it is wrong, **Close** it and make a new one.
6. Move it on with **Mark accepted**, **Mark in production**, **Mark received**, then **Close**.

**Production**

1. Back on the customized order, press **Move to in manufacturing**, **Move to quality check** and **Move to ready** as the work goes on. You can add a note each time. **Back to …** undoes a step.
2. Dispatch and delivery follow the order's normal delivery steps (5.12).
3. Record the balance on the order with **Record a payment** (5.13). The invoice is made once it is fully paid.

### 5.18 Pearl pricing

Needs: Pearl pricing. **Only head office changes rates and margins.**

**Rates and margins**

1. **Pearl rates** → **Add rate**: **Grade**, **Farm** (empty = any farm), **Size from (mm)**, **Size to (mm)**, **Rate per carat**, **Effective from**. Press **Create rate**.
2. **Margin rules** → **Add margin rule**: **Name**, **Category**, **Grade**, **Margin over cost**, **Minimum margin**, **Priority (lower runs first)**. The calculator uses the first active rule that matches.

**Price calculator**

1. Open **Price calculator**.
2. To price a piece in the catalogue, search for it in **Price an existing piece (optional)**. Its details fill in.
3. Otherwise type **Carat weight**, **Grade**, **Farm**, **Pearl size (mm)**, **Category**, and any **Metal cost** and **Labour cost**.
4. Press **Calculate**. The **Suggested price** shows the cost, margin, GST and which rate and rule were used.
5. Head office can press **Apply to SP-…** to set the product's price.

The live market rate feed is off until the owner confirms a source. The manual rates are always used.

### 5.19 Coupons and offers

Needs: Coupons & offers.

1. Open **Coupons & offers** and press **Add coupon**.
2. **Code**: 3 to 20 letters and digits, for example `DIWALI10`.
3. **Description shown to customers**.
4. **Discount type**: **Percentage** (then **Percentage off** and **Maximum discount (optional)**) or **Flat amount** (then **Amount off**).
5. **Minimum order value**, **Starts**, **Ends**, **Total uses allowed (optional)**, **Uses per customer (optional)**.
6. **Only these categories (optional)** or **Only these pieces (optional)** to limit it.
7. **First order only**, **Show on offers page** (lists the code publicly on the Offers page), **Active**.
8. Press **Create coupon**.

Open a coupon to see **Usage**: times used, discount given, and paid sales with the code. To stop a coupon, press **Deactivate**.

### 5.20 Banners, page blocks and pages

Needs: Content & pages.

**Home page banners**

1. **Banners** → **Add banner**.
2. **Placement** (**Home – hero**, **Home – secondary**, **Category – top**), **Title**, **Subtitle**, **Image (desktop)**, **Image (mobile, optional)**, **Link** (a page on our site like `/jewellery`, or an `https://` address), **Button text**, **Starts**, **Ends**.
3. Press **Create banner**.

**Home & page blocks**

These are the story, trust points, footer text and contact details. Change the **Title** and the text inside **Content**, then press **Save changes**. The **Content** box is in a strict format: change only the words between quote marks, and keep every bracket, comma and quote mark. If the save fails, press **Cancel** and start again.

**Pages & legal** (Our Story, About and the five legal pages)

1. Open **Pages & legal** and click the page.
2. Edit the **Title** and text.
3. Press **Publish new version**. The page changes on the website at once.
4. Earlier versions are kept under **Version history**. Press **View** to read one.

The legal pages start with sample text. The owner must supply the final approved text before going live.

**Testimonials**, **Gallery** and **FAQ** work like banners: press **Add testimonial**, **Add gallery item** or **Add question**, fill in the form, then press **Create testimonial**, **Create gallery item** or **Create question**.

**Careers**: **Add job opening**. **Job applications**: press **Open** to read a resume (the link is private and each view is recorded) and set the status: NEW, SHORTLISTED, REJECTED, HIRED.

### 5.21 Abandoned carts

Needs: Orders (View).

1. Open **Abandoned carts**. It lists carts left for over 30 minutes in the last 30 days, with the shopper, pieces and value.
2. Choose **Not reminded yet** to see who has not had a reminder.
3. Press **Remind now** to send a WhatsApp reminder with a link to the cart. Press **Remind again** only if really needed.

One reminder goes out by itself after the delay in **Settings** → **Abandoned cart reminder** (sample setting: 120 minutes). Shoppers without a phone number cannot be reminded.

### 5.22 Push notifications

Needs: Push notifications.

1. Open **Push notifications** and press **New notification**.
2. Type a **Title** (up to 65 letters) and **Message** (up to 240).
3. **Opens**: the page to open, like `/offers`. Add an **Image** if you like.
4. **Send to**: **All customers**, **Customers in chosen cities** or **A customer segment** (repeat buyers, bought in the last 90 days, signed up but never ordered, have pieces in their wishlist).
5. Press **Save draft**. Check the **Preview**.
6. Press **Send now**, or pick a time in **Or schedule (India time)** and press **Schedule**.
7. **Cancel notification** stops a scheduled one.

The list shows **Devices** and **Delivered / failed** counts. Notifications reach only customers who use the customer app. If a yellow box says Firebase keys are needed, nothing reaches phones yet (see section 12). Order updates go out by themselves; you do not send those here.

### 5.23 Message log

Needs: Push notifications.

**Message log** shows every WhatsApp, email, SMS and push message the system sent, with its status.

- **Send on WhatsApp**: appears while WhatsApp Business is not set up. Press it to send that message from your own WhatsApp.
- **Retry**: sends a failed message again.

For safety, on the live site one-time codes are hidden in the message log once they have been sent.

### 5.24 Newsletter

Needs: Push notifications.

**Newsletter** lists people who signed up on the website with their consent date. Filter **Subscribed** or **Unsubscribed**, and press **Download CSV** to use the list in your email tool. The admin does not send newsletters itself.

### 5.25 Customers

Needs: Customers.

1. Open **Customers**. Search, filter by city and status.
2. Open a customer to see their details, addresses, orders, enquiries and referral code.
3. **Block** stops them placing orders and signs them out. **Unblock** reverses it.

### 5.26 Reviews

Needs: Reviews.

Customers are asked for a review a few days after delivery. Reviews show on the website only after approval.

1. Open **Reviews** and choose **Waiting**.
2. Press **Approve** or **Reject**.

### 5.27 WhatsApp numbers and routing

Needs: WhatsApp numbers, templates & routing.

Open **WhatsApp numbers & routing**. There are three tabs:

- **Numbers**: the WhatsApp numbers customers are sent to, one per city team if you like. Press **Add whatsapp number**.
- **Routing rules**: which number, franchise or person gets an enquiry, by city and type (**Add routing rule**). Lowest **Priority** wins. Sample rules send bulk enquiries to the wholesale number, Pune enquiries to the Pune team and the Koregaon Park franchise, and Mumbai enquiries to the Mumbai team.
- **Message templates**: the wording of WhatsApp, email, SMS and push messages. Keep the `{{placeholders}}` such as `{{orderNumber}}`. Press **Add template** for a new one.

### 5.28 Reports

Needs: Reports.

1. Open **Reports** and choose **Sales**, **WhatsApp analytics**, **Enquiries**, **Franchises & vendors**, **Best sellers** or **GST register**.
2. Choose dates and press **Apply**. Without dates it shows the last 30 days.
3. Press **Download CSV** for a spreadsheet.

Every list in the admin also has an **Export CSV** button.

### 5.29 Settings

Needs: Settings. Changes take effect at once and are recorded in the audit log. Each box has its own **Save** button.

| Box | What it controls |
|---|---|
| Business details (printed on invoices) | Legal name, GSTIN, state, address, invoice prefix |
| Payment methods | Online on or off, cash on delivery on or off, the highest COD order value, COD on price-on-request pieces |
| Delivery charges | Charge, free-delivery level, delivery promise text |
| Returns | Return window in days, whether customized pieces can be returned |
| Referral rewards | On or off, reward amounts, how long reward coupons last |
| Abandoned cart reminder | On or off, delay in minutes |
| Review requests | On or off, days after delivery |
| Proof of delivery | Orders at or above this value need the customer's code |
| Enquiries | Automatic acknowledgement, response target in minutes |
| Website extras | Announcement bar, free gift packing, delivery estimate, video call and store visit bookings |
| App store links (website footer) | Google Play and App Store links |
| Search engines | Title suffix and default description |

---

## 6. City Manager

You sign in on the **Team** tab with email, password and code. Everything you see is limited to your city. Your dashboard says "Figures for Pune" (or your city).

**Your menu:** Dashboard, Enquiries, Orders, Customized orders, Purchase orders, Payments, Returns, Products, Customers, Vendors, Franchises, Manufacturers, Delivery partners, Price calculator, Reports.

### What you can do

- **Enquiries**: work them, add notes, set owner, hand them to a franchise in your city, convert to orders. Same steps as 5.9 and 5.10.
- **Orders**: create manual orders in your city (5.11), move orders through every step (5.12), assign a delivery partner from your city, set the franchise and manufacturer.
- **Returns**: **Approve**, **Reject**, **Schedule pickup**, **Picked up**, **Mark received**, **Close** (5.15).
- **Customized orders**: start them, add details and files, and move production stages (5.17). Head office sets the quote and records the advance.
- **Delivery partners**: view and edit the partners who serve your city.
- **Price calculator**: work out a suggested price for a WhatsApp quote (5.18).
- **Reports**: your city's reports, including the GST register.
- **Dashboard**: your city's cards, monthly sales and orders, recent orders and enquiries. Choose a date range at the top.

### What you cannot do

- Refund money or record any payment: bank or cash on an order, **Already paid** on a new order, or a customized order's advance. Head office does this.
- Mark COD cash received at the office.
- Set prices on orders or customized quotes. A price-on-request piece shows **Head office sets the price**.
- See cost fields on products.
- Raise purchase orders (you can view them).
- Change products, coupons, content, settings or logins.
- See or move anything in another city.

When a customer pays a customized order's advance, send head office the bank or UPI reference so they can record it.

---

## 7. Vendor

You sign in on the **Vendor / Franchise / Delivery** tab with your email or mobile number and a code.

**Your menu:** Dashboard, Orders, Products (shown as **My products**), Reports.

### Add a product

1. Open **My products** and press **Add product**.
2. Fill in the form as in 5.1. You will not see **Vendor**, **Feature on the home page** or **Sort order**; head office sets those.
3. Press **Create product**. It goes to head office for approval.
4. Open the product again and press **Add images** to add photos (5.2).
5. Head office checks and approves it. Only then does it appear on the website.

### Change a product

1. Open the product, change the details and press **Send changes for approval** (or **Save changes** if it is not live yet).
2. You will see **Changes sent for approval**. The website keeps the old details until head office approves.
3. Stock changes (quantity, out of stock) apply straight away, without approval.

Once a piece is live, its photos and video are changed by head office: send them the new photos. On drafts you change photos yourself.

You cannot publish, unpublish, archive or approve products. You cannot issue certificates.

### Orders

1. Open **Orders**. You see only orders assigned to your vendor account.
2. Open an order. Press **Mark confirmed** when you accept it, then **Mark packed** when it is ready.
3. Print the **Packing slip**.

You can move an order only as far as **Packed**. Head office, the City Manager or the franchise assigns the delivery partner after that. You cannot cancel orders, record payments or refund.

The commission and settlement screens are switched off for now.

---

## 8. Franchise

You sign in on the **Vendor / Franchise / Delivery** tab with your email or mobile number and a code.

**Your menu:** Dashboard, Enquiries, Orders, Payments, Returns, Products, Price calculator, Reports.

You see only the enquiries and orders assigned to your franchise.

### Enquiries

1. Open **Enquiries**. Enquiries for your area are assigned to you by the routing rules or by head office.
2. Work each one as in 5.9: set the **Owner**, press **Reply on WhatsApp**, **Add note**, change the **Stage**.
3. When the customer agrees, press **Convert to order** (5.10).

You cannot hand an enquiry to another franchise or city.

### Orders

1. **New manual order** for a shop or phone sale in your city (5.11). The order is linked to your franchise.
2. On an order, press **Mark confirmed**, then **Mark packed**.
3. In the **Delivery partner** box, choose a partner from your city and press **Assign**.
4. If a delivery fails, choose a partner and press **Assign** again to retry.

### What you can see but not change

- **Payments** for your orders, including cash on delivery.
- **Returns** for your orders. Head office or the City Manager handles the request.
- **Products** and the **Price calculator**.

### What you cannot do

- Set or change prices. A price-on-request piece shows **Head office sets the price**. Ask head office.
- Record payments, refund money or cancel orders.
- See product cost fields.

If a customer has already paid by bank transfer or UPI, create the order as **Bank transfer / UPI to shop** and send head office the reference; they record the payment.

---

## 9. Delivery partner

You can work from the **Delivery app** on your phone, or from **My deliveries** in the admin on your phone's browser. Both work the same way.

### Sign in (delivery app)

1. Open the app. Type your **Mobile number** and press **Send code**.
2. Type the **6-digit code** and press **Sign in**.
3. Wrong number? Press **Use a different number**.

In the admin, use the **Vendor / Franchise / Delivery** tab (section 2).

### Your screens

- **To deliver**: today's jobs.
- **Completed**: your history.
- **Account**: your number, a short "How deliveries work" note, and **Sign out**.

On the web screen, a grey box shows **Cash to hand over at the office** with the total.

### Deliver an order

1. Open the job. Check the customer, address and pieces. It says **Collect cash ₹…** or **Already paid: collect nothing.**
2. Use **Call** and **Maps** (web: **Call customer**, **Open in Maps**).
3. At the store, press **Picked up from the store**.
4. When you leave, press **Start delivery**. The customer gets a delivery code by SMS.
5. At the door, under **Proof of delivery**:
   1. Take the handover photo: **Take handover photo (required)** in the app, or **Photo of the handover (required)** on the web.
   2. Ask for the code and type it in **Customer's delivery code**. If they did not get it, press **Send the code to the customer again** (web: **Send code**).
   3. If the code is not marked "(required)", the customer can sign instead under **Or the customer's signature**.
   4. For cash orders, collect the exact amount and switch on **I have collected ₹… in cash**.
6. Press **Mark delivered**.

Orders at or above the value in **Settings** → **Proof of delivery** (sample setting: ₹50,000) always need the customer's code. A signature is not enough.

### If you cannot deliver

1. Press **Could not deliver** (customer not there, wrong address, refused, could not collect payment) or **Return to store**.
2. Choose or type the reason (at least 3 letters) and press **Confirm**.

The office will see the reason and can assign the job again.

### No signal?

Keep working. Your steps are saved on the phone and sent when the signal returns. You will see **You are offline. Updates are saved on this phone and sent when the signal returns.** Do not uninstall the app or clear its data while steps are waiting.

If the office refuses a saved step (for example, the order was cancelled meanwhile), it shows **Not accepted** with the reason. Press **Dismiss** and call the office.

### What you cannot do

- See other partners' deliveries.
- Mark delivered without a photo, and a code or signature.
- Mark failed or returned without a reason.
- Change payments or prices.

Hand all cash to the office every day. The office marks it received in **Payments**.

---

## 10. Helping customers

Customers use the website or the customer app. Here is what they can do, so you can guide them.

### Signing in

- Customers sign in with their **Mobile number** and a code: **Sign in or sign up** → **Send code** → **One-time code** → **Continue**. New customers add their name and an optional referral code.
- They can also buy as a guest without signing in. Their order is linked to their mobile number, so they see it later when they sign in.

### Buying

- **Add to Cart**, then checkout: address, city, **Pay online** or **Cash on delivery**, then **Pay ₹…** or **Place order**.
- A one-of-a-kind piece is held for 15 minutes while the customer pays online. If they do not pay in time, the order shows **Failed** and the piece goes back on sale.
- **Price on request** pieces have only **Enquire on WhatsApp**. Sold unique pieces show **Enquire about a similar piece**.
- Cash on delivery is offered only up to the limit in Settings (sample setting: ₹50,000) and not on price-on-request pieces.

### After ordering

- Every order has a tracking link. Customers find it under **My Orders** → **Shareable tracking link**. Staff can open it from the order with **Tracking page**.
- **Download GST invoice** appears once the order is paid.
- Order updates go by WhatsApp and email at each step, and by push notification in the customer app. See section 12 for what depends on setup.

### Cancellations and returns

- **Request cancellation**: on the order page while the order is Placed or Confirmed (before it is packed).
- **Cancel this unpaid order**: for an online order that was never paid.
- **Request a return (within 7 days)**: after delivery, within the window in Settings. Customized pieces cannot be returned unless Settings allows it.
- The customer picks a **Reason**, adds **Details** and **Photos (optional)**, and presses **Send request**.
- The request appears in **Returns** (5.15). The customer gets an update at each step.

### Enquiries

Every enquiry carries a reference like **ENQ-26-000123** in the WhatsApp message. Ask the customer for it and search for it in **Enquiries**.

### Deleting an account

Customers delete their own account from their account page, the app, or the website page `/delete-account`. They must type DELETE. Past orders and invoices are kept because tax law needs them. There is no button in the admin to delete a customer's account; guide them to do it themselves.

---

## 11. Order and payment status, explained

### Order status

| Status | Meaning | Who moves it on |
|---|---|---|
| Placed | Order received | Head office, City Manager, vendor or franchise → Confirmed |
| Confirmed | Accepted; online orders reach this by themselves when paid | → Packed |
| Packed | Parcel ready | Assign a delivery partner → Assigned |
| Assigned | Delivery partner chosen | Delivery partner → Picked Up |
| Picked Up | Rider has it | Delivery partner → Out for Delivery |
| Out for Delivery | On the way | Delivery partner → Delivered |
| Delivered | Handed over with proof | Return requests only |
| Cancelled | Stopped before dispatch | Refund if paid |
| Failed | Not delivered, or online payment not completed | Re-assign, return or cancel |
| Returned | Came back to the store | Refund |
| Refunded | Money given back | Final |

Cancelled, Failed and Returned always need a written reason.

### Payment status

| Status | Meaning |
|---|---|
| Pending | Waiting for online payment or bank transfer |
| Paid | Money received |
| COD Pending | Cash on delivery, not yet collected |
| COD Collected | Rider collected the cash |
| Failed | Payment did not go through |
| Refunded | Money given back |

---

## 12. Things that depend on the owner's setup

Some features need accounts that the owner must arrange. Until then, the system uses a simpler fallback.

| Feature | Needs | Until then |
|---|---|---|
| Online payment (UPI, cards, net banking, wallets) and gateway refunds | Live payment gateway keys | Cash on delivery only on the live site. A test payment page works on a development copy only. |
| Automatic WhatsApp messages (order updates, enquiry acknowledgement, cart reminders, review requests) | WhatsApp Business API approval | Messages go by email, and staff can send each one by hand with **Send on WhatsApp** in the **Message log**. |
| Codes by SMS (customer sign-in, partner sign-in by mobile, delivery codes) | An SMS provider with DLT registration | Team members get codes by email. Partners can sign in with their email. Customers cannot sign in by mobile on the live site, but can still buy as guests. Customers cannot receive delivery codes, so riders must use a signature, and orders that require a code cannot be completed by the rider. |
| Emails | Email service | Messages wait in the queue and show in the **Message log**. |
| Push notifications | Firebase keys | Notifications are recorded and counted, but no phone receives them. |
| Ring Finder explanations | An AI service key | Customers get plain matching results without the one-line reasons. |
| Live pearl market rates | A confirmed rate source | The manual **Pearl rates** table is used. |
| Invoices without "SAMPLE" | GSTIN in **Settings** | Invoices are marked SAMPLE. |
| Delivery and customer apps in the stores | Google Play and Apple developer accounts | Riders use **My deliveries** in the phone browser. Customers use the website. |
