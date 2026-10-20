/* Seed data. Safe to run more than once (upserts by unique keys; existing rows are never overwritten).
 * Development: pnpm --filter @sahyadri/db seed  → sample catalogue, partners and test logins
 *   Env: DATABASE_URL, SEED_PASSWORD (staff/partner password, development only), STORAGE_LOCAL_DIR
 * Demo site:   the API runs SEED_MODE=demo itself when DEMO_MODE=true (sample data, also in production)
 * Production:  SEED_MODE=production pnpm --filter @sahyadri/db seed  → base data and one owner login, no samples
 *   Env: DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME, SEED_ADMIN_PHONE (optional)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
import { pickNearestVendor } from '@sahyadri/shared';
import { hashPassword } from '../src/password';
import { productSvg, sceneSvg } from './art';
import { photo, SAMPLE_BANNER_ART, SAMPLE_PHOTOS, SAMPLE_PRODUCTS, sampleSlug } from './samples';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? 'Sahyadri@2026';
const STORAGE = resolve(process.env.STORAGE_LOCAL_DIR ?? join(__dirname, '../../../uploads'));
const rupees = (r: number) => Math.round(r * 100);

function writeMedia(rel: string, content: string): string {
  const file = join(STORAGE, 'public', rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
  return `/media/${rel}`;
}

async function upsertSetting(key: string, value: unknown, description: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, description },
    update: {},
  });
}

async function seedSettings() {
  // ── Settings & flags ──────────────────────────────────────────
  await upsertSetting(
    'store',
    {
      legalName: 'Sahyadri Pearls',
      gstin: null,
      state: 'Maharashtra',
      stateCode: '27',
      address: 'Sahyadri Pearls, Prabhat Road, Erandwane, Pune 411004, Maharashtra',
      phone: '+919800000000',
      email: 'care@sahyadripearls.test',
      whatsapp: '+919800000000',
      mapUrl: 'https://maps.google.com/?q=Prabhat+Road+Pune',
      invoicePrefix: 'SP',
    },
    'Business details printed on invoices and the website. Fill in the GSTIN before going live.',
  );
  await upsertSetting(
    'payments',
    { onlineEnabled: true, codEnabled: true, codMaxPaise: rupees(50000), codForPriceOnRequest: false },
    'Payment methods shown at checkout.',
  );
  await upsertSetting(
    'delivery',
    {
      chargePaise: rupees(150),
      freeAbovePaise: rupees(5000),
      promise: 'Insured delivery in 3–5 working days',
    },
    'Delivery charge (GST-inclusive) and free-delivery threshold. Cities can override the charge.',
  );
  await upsertSetting(
    'returns',
    { windowDays: 7, customizedReturnable: false },
    'Return window after delivery.',
  );
  await upsertSetting(
    'referral',
    { enabled: true, referrerRewardPaise: rupees(500), refereeRewardPaise: rupees(500), rewardValidDays: 90 },
    'Referral rewards, issued as personal coupons after the first order is delivered.',
  );
  await upsertSetting(
    'cart_reminder',
    { enabled: true, delayMinutes: 120 },
    'Abandoned-cart WhatsApp reminder timing.',
  );
  await upsertSetting(
    'review_request',
    { enabled: true, delayDays: 3 },
    'Days after delivery to ask for a review.',
  );
  await upsertSetting(
    'delivery_proof',
    { otpAbovePaise: rupees(50000) },
    'Orders at or above this value need a customer OTP (not just a signature) at delivery.',
  );
  await upsertSetting('app_links', { android: '', ios: '' }, 'Store links shown in the website footer.');
  await upsertSetting(
    'seo',
    {
      titleSuffix: ' | Sahyadri Pearls',
      defaultDescription:
        'Fine pearl jewellery traced to named farms. Certified pearls, insured delivery across India.',
    },
    'Default SEO text.',
  );
  await upsertSetting(
    'enquiry',
    { acknowledgeAutomatically: true, responseTargetMinutes: 30 },
    'Enquiry acknowledgement and response timer target.',
  );

  for (const [key, description] of [
    ['vendor_commissions', 'Vendor commissions and settlements'],
    ['live_gps', 'Live GPS tracking of delivery partners'],
    ['multi_currency', 'Prices in currencies other than INR'],
    ['loyalty_points', 'Loyalty points'],
    ['pearl_rate_feed', 'Live pearl market-rate feed'],
    ['ai_ring_finder', 'AI ranking and explanations in the Ring Finder'],
  ] as const) {
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, description, enabled: false },
      update: {},
    });
  }
}

/** Message templates (WhatsApp, email, SMS, push). Existing ones are never overwritten. */
async function seedTemplates() {
  const templates: Array<[string, 'WHATSAPP' | 'EMAIL' | 'SMS' | 'PUSH', string, string?]> = [
    [
      'ENQUIRY_PRODUCT',
      'WHATSAPP',
      'Hello Sahyadri Pearls, I am interested in {{productName}} (SKU {{sku}}). My enquiry reference is {{reference}}.',
    ],
    [
      'ENQUIRY_GENERAL',
      'WHATSAPP',
      'Hello Sahyadri Pearls, my enquiry reference is {{reference}}. {{message}}',
    ],
    [
      'ENQUIRY_ACK',
      'WHATSAPP',
      'Thank you for your enquiry {{reference}}. Our {{cityName}} team will reply shortly.',
    ],
    [
      'ENQUIRY_ACK',
      'EMAIL',
      'Dear {{name}},\n\nThank you for your enquiry {{reference}}. A member of our team will contact you shortly.\n\nSahyadri Pearls',
      'We received your enquiry {{reference}}',
    ],
    [
      'ORDER_PLACED',
      'WHATSAPP',
      'Thank you {{name}}! Your order {{orderNumber}} for {{total}} is placed. Track it here: {{trackUrl}}',
    ],
    [
      'ORDER_PLACED',
      'EMAIL',
      'Dear {{name}},\n\nThank you for your order {{orderNumber}} ({{total}}).\nTrack it any time: {{trackUrl}}\nInvoice: {{invoiceUrl}}\n\nSahyadri Pearls',
      'Order {{orderNumber}} confirmed',
    ],
    ['ORDER_STATUS', 'WHATSAPP', 'Your order {{orderNumber}} is now {{status}}. Track it: {{trackUrl}}'],
    [
      'ORDER_STATUS',
      'EMAIL',
      'Dear {{name}},\n\nYour order {{orderNumber}} is now {{status}}.\nTrack it: {{trackUrl}}\n\nSahyadri Pearls',
      'Order {{orderNumber}}: {{status}}',
    ],
    ['ORDER_STATUS', 'PUSH', 'Order {{orderNumber}} is now {{status}}.', 'Order update'],
    ['CART_REMINDER', 'WHATSAPP', 'Hi {{name}}, your pearls are waiting in your cart: {{cartUrl}}'],
    [
      'CART_REMINDER',
      'EMAIL',
      'Hi {{name}},\n\nYou left some pieces in your cart. Pick up where you left off: {{cartUrl}}\n\nSahyadri Pearls',
      'Your cart is waiting',
    ],
    [
      'REVIEW_REQUEST',
      'WHATSAPP',
      'Hi {{name}}, how do you like {{productName}}? Leave a review: {{reviewUrl}}',
    ],
    [
      'REVIEW_REQUEST',
      'EMAIL',
      'Hi {{name}},\n\nWe hope you love {{productName}}. Tell us what you think: {{reviewUrl}}\n\nSahyadri Pearls',
      'How is your {{productName}}?',
    ],
    ['OTP', 'SMS', '{{code}} is your Sahyadri Pearls verification code. It expires in 5 minutes.'],
    [
      'OTP',
      'EMAIL',
      'Your Sahyadri Pearls verification code is {{code}}. It expires in 5 minutes.',
      'Your verification code',
    ],
    ['DELIVERY_OTP', 'SMS', 'Share {{code}} with our delivery partner to receive order {{orderNumber}}.'],
    ['DELIVERY_ASSIGNED', 'PUSH', 'New delivery: order {{orderNumber}}, {{area}}.', 'New delivery assigned'],
    [
      'CUSTOM_STAGE',
      'WHATSAPP',
      'Hi {{name}}, an update on your customized {{item}}: it is now {{stage}}. {{quote}}',
    ],
    [
      'CUSTOM_STAGE',
      'EMAIL',
      'Dear {{name}},\n\nYour customized {{item}} is now {{stage}}. {{quote}}\n\nSahyadri Pearls',
      'Your customized {{item}}: {{stage}}',
    ],
    [
      'PO_SENT',
      'EMAIL',
      'Dear {{manufacturer}},\n\nPlease find purchase order {{number}} (due {{dueDate}}): {{pdfUrl}}\nKindly confirm acceptance.\n\nSahyadri Pearls',
      'Purchase order {{number}}',
    ],
    [
      'REFERRAL_REWARD',
      'EMAIL',
      'Hi {{name}},\n\nYour referral reward is ready. Use code {{code}} for {{amount}} off your next order.\n\nSahyadri Pearls',
      'Your referral reward',
    ],
  ];
  for (const [key, channel, body, subject] of templates) {
    await prisma.messageTemplate.upsert({
      where: { key_channel_language: { key, channel, language: 'en' } },
      create: { key, channel, body, subject },
      update: {},
    });
  }
}

async function seedPages(pages: Array<[string, string, boolean, string]>) {
  for (const [slug, title, isLegal, body] of pages) {
    const existing = await prisma.page.findUnique({ where: { slug } });
    if (existing) continue;
    const page = await prisma.page.create({ data: { slug, title, isLegal } });
    const v = await prisma.pageVersion.create({ data: { pageId: page.id, version: 1, body } });
    await prisma.page.update({ where: { id: page.id }, data: { currentVersionId: v.id } });
  }
}

/** The catalogue's categories (GST 3%; HSN 7113 jewellery, 7101 loose pearls). */
async function seedCategories(withImages: boolean) {
  const catDefs = [
    ['Necklaces', 'necklaces', '7113'],
    ['Earrings', 'earrings', '7113'],
    ['Rings', 'rings', '7113'],
    ['Bracelets', 'bracelets', '7113'],
    ['Pendants', 'pendants', '7113'],
    ['Loose Pearls', 'loose-pearls', '7101'],
  ] as const;
  const cats: Record<string, { id: string }> = {};
  for (const [i, [name, slug, hsn]] of catDefs.entries()) {
    cats[slug] = await prisma.category.upsert({
      where: { slug },
      create: {
        name,
        slug,
        description: `Pearl ${name.toLowerCase()} traced to named farms.`,
        imageUrl: withImages
          ? writeMedia(
              `samples/category-${slug}.svg`,
              productSvg(slug === 'loose-pearls' ? 'loose' : slug, 'White'),
            )
          : null,
        sortOrder: i + 1,
        gstRateBp: 300,
        hsnCode: hsn,
      },
      update: {},
    });
  }
  return cats;
}

/**
 * Production setup (SEED_MODE=production): settings, feature flags, message templates, categories,
 * draft legal pages and one Super Admin login. No sample products, partners, customers or test logins.
 */
async function seedProduction() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Owner';
  const phone = process.env.SEED_ADMIN_PHONE?.trim() || null;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new Error('Set SEED_ADMIN_EMAIL to the owner’s email address.');
  if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
    throw new Error('Set SEED_ADMIN_PASSWORD: at least 12 characters with letters and digits.');
  if (phone && !/^\+91[6-9]\d{9}$/.test(phone))
    throw new Error('SEED_ADMIN_PHONE must look like +919812345678.');

  await seedSettings();
  await seedTemplates();
  await seedCategories(false);
  const draft = (title: string) =>
    `## ${title}\n\n> Draft. Replace with the approved ${title.toLowerCase()} in Admin → Pages & legal before launch.`;
  await seedPages([
    ['terms', 'Terms & Conditions', true, draft('Terms & Conditions')],
    ['refund-policy', 'Refund Policy', true, draft('Refund Policy')],
    ['privacy', 'Privacy Policy', true, draft('Privacy Policy')],
    [
      'return-cancellation-policy',
      'Return & Cancellation Policy',
      true,
      draft('Return & Cancellation Policy'),
    ],
    ['shipping-policy', 'Shipping / Delivery Policy', true, draft('Shipping / Delivery Policy')],
  ]);
  const existing = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (existing) {
    console.log(`A Super Admin already exists (${existing.email}); no login created.`);
  } else {
    await prisma.user.create({
      data: { role: 'SUPER_ADMIN', name, email, phone, passwordHash: await hashPassword(password) },
    });
    console.log(`Super Admin created: ${email}`);
  }
  console.log('Production setup complete. Add cities, WhatsApp numbers, partners and products in the admin.');
}

async function main() {
  if (process.env.SEED_MODE === 'production') return seedProduction();
  // The demo site (DEMO_MODE, D66) is the one production setting that may hold sample data; the API runs this itself.
  const demo =
    process.env.SEED_MODE === 'demo' &&
    ['1', 'true', 'yes', 'on'].includes(String(process.env.DEMO_MODE ?? '').toLowerCase());
  if (process.env.NODE_ENV === 'production' && !demo)
    throw new Error('Refusing to load sample data with NODE_ENV=production. Use SEED_MODE=production.');
  const pw = await hashPassword(PASSWORD);

  await seedSettings();

  // ── Cities ───────────────────────────────────────────────────
  const pune = await prisma.city.upsert({
    where: { slug: 'pune' },
    create: { name: 'Pune', slug: 'pune', state: 'Maharashtra', sortOrder: 1 },
    update: {},
  });
  const mumbai = await prisma.city.upsert({
    where: { slug: 'mumbai' },
    create: { name: 'Mumbai', slug: 'mumbai', state: 'Maharashtra', sortOrder: 2 },
    update: {},
  });

  // Delivery cities across India. Pieces are not limited by city, so all of them can be ordered anywhere; orders from
  // a city without its own team go to head office. "Rest of India" lets anyone else check out (their town goes in
  // the address).
  const moreCities: Array<[name: string, slug: string, state: string]> = [
    ['Delhi NCR', 'delhi-ncr', 'Delhi'],
    ['Bengaluru', 'bengaluru', 'Karnataka'],
    ['Hyderabad', 'hyderabad', 'Telangana'],
    ['Chennai', 'chennai', 'Tamil Nadu'],
    ['Kolkata', 'kolkata', 'West Bengal'],
    ['Ahmedabad', 'ahmedabad', 'Gujarat'],
    ['Jaipur', 'jaipur', 'Rajasthan'],
    ['Lucknow', 'lucknow', 'Uttar Pradesh'],
    ['Chandigarh', 'chandigarh', 'Chandigarh'],
    ['Kochi', 'kochi', 'Kerala'],
    ['Goa', 'goa', 'Goa'],
    ['Indore', 'indore', 'Madhya Pradesh'],
    ['Nagpur', 'nagpur', 'Maharashtra'],
    ['Nashik', 'nashik', 'Maharashtra'],
    ['Rest of India', 'rest-of-india', 'India'],
  ];
  for (const [i, [name, slug, state]] of moreCities.entries()) {
    await prisma.city.upsert({
      where: { slug },
      create: { name, slug, state, sortOrder: 10 + i },
      update: {},
    });
  }

  // ── Network ──────────────────────────────────────────────────
  const vendor = await findOrCreate(
    () => prisma.vendor.findFirst({ where: { name: 'Konkan Pearl House' } }),
    () =>
      prisma.vendor.create({
        data: {
          name: 'Konkan Pearl House',
          contactName: 'Rohan Sawant',
          phone: '+919800000003',
          email: 'vendor@sahyadripearls.test',
          address: 'Ratnagiri, Maharashtra',
          cities: { create: [{ cityId: pune.id }, { cityId: mumbai.id }] },
        },
      }),
  );
  const vendor2 = await findOrCreate(
    () => prisma.vendor.findFirst({ where: { name: 'Deccan Settings' } }),
    () =>
      prisma.vendor.create({
        data: {
          name: 'Deccan Settings',
          contactName: 'Meera Kulkarni',
          phone: '+919800000013',
          cities: { create: [{ cityId: mumbai.id }] },
        },
      }),
  );
  const franchise = await findOrCreate(
    () => prisma.franchise.findFirst({ where: { name: 'Sahyadri Pearls Koregaon Park' } }),
    () =>
      prisma.franchise.create({
        data: {
          name: 'Sahyadri Pearls Koregaon Park',
          cityId: pune.id,
          area: 'Koregaon Park',
          address: 'Lane 6, Koregaon Park, Pune 411001',
          showInStoreList: true,
          openingHours: 'Mon–Sat, 11 am – 8 pm',
          contactName: 'Anita Deshmukh',
          phone: '+919800000004',
          email: 'franchise.pune@sahyadripearls.test',
        },
      }),
  );
  const franchise2 = await findOrCreate(
    () => prisma.franchise.findFirst({ where: { name: 'Sahyadri Pearls Bandra' } }),
    () =>
      prisma.franchise.create({
        data: {
          name: 'Sahyadri Pearls Bandra',
          cityId: mumbai.id,
          area: 'Bandra West',
          address: 'Hill Road, Bandra West, Mumbai 400050',
          showInStoreList: true,
          openingHours: 'Mon–Sat, 11 am – 8 pm',
          contactName: 'Farah Khan',
          phone: '+919800000014',
        },
      }),
  );
  for (const m of [
    {
      name: 'Zaveri Craftworks',
      contactName: 'Hitesh Zaveri',
      phone: '+919800000021',
      cityId: mumbai.id,
      speciality: 'Gold settings, bridal sets',
    },
    {
      name: 'Pune Silver Studio',
      contactName: 'Sameer Joshi',
      phone: '+919800000022',
      cityId: pune.id,
      speciality: 'Silver and oxidised settings',
    },
  ]) {
    await findOrCreate(
      () => prisma.manufacturer.findFirst({ where: { name: m.name } }),
      () => prisma.manufacturer.create({ data: m }),
    );
  }
  const dp = await prisma.deliveryPartner.upsert({
    where: { phone: '+919800000005' },
    create: {
      name: 'Vikram Pawar',
      phone: '+919800000005',
      vehicleInfo: 'Two-wheeler MH12',
      cities: { create: [{ cityId: pune.id }] },
    },
    update: {},
  });
  const dp2 = await prisma.deliveryPartner.upsert({
    where: { phone: '+919800000015' },
    create: {
      name: 'Suresh Naik',
      phone: '+919800000015',
      vehicleInfo: 'Two-wheeler MH02',
      cities: { create: [{ cityId: mumbai.id }] },
    },
    update: {},
  });

  // ── Vendor routing: every order goes to the vendor nearest the customer's PIN code, which then hands it to one of
  // its own delivery partners. Fill in what earlier sample data lacked, never overwriting an admin's edits.
  const citySlug = async (slug: string) => (await prisma.city.findUniqueOrThrow({ where: { slug } })).id;
  const [delhiId, bengaluruId] = [await citySlug('delhi-ncr'), await citySlug('bengaluru')];
  await prisma.vendor.updateMany({
    where: { id: vendor.id, pincode: null },
    data: { pincode: '411005', address: 'Shivajinagar, Pune 411005' },
  });
  await prisma.vendor.updateMany({
    where: { id: vendor2.id, pincode: null },
    data: { pincode: '400050', address: 'Bandra West, Mumbai 400050' },
  });
  const vendor3 = await findOrCreate(
    () => prisma.vendor.findFirst({ where: { name: 'Delhi Pearl Atelier' } }),
    () =>
      prisma.vendor.create({
        data: {
          name: 'Delhi Pearl Atelier',
          contactName: 'Kavya Malhotra',
          phone: '+919800000023',
          email: 'vendor3@sahyadripearls.test',
          address: 'Karol Bagh, New Delhi 110005',
          pincode: '110005',
          cities: { create: [{ cityId: delhiId }] },
        },
      }),
  );
  const vendor4 = await findOrCreate(
    () => prisma.vendor.findFirst({ where: { name: 'Bengaluru Pearl Co.' } }),
    () =>
      prisma.vendor.create({
        data: {
          name: 'Bengaluru Pearl Co.',
          contactName: 'Arjun Rao',
          phone: '+919800000024',
          email: 'vendor4@sahyadripearls.test',
          address: 'Jayanagar, Bengaluru 560011',
          pincode: '560011',
          cities: { create: [{ cityId: bengaluruId }] },
        },
      }),
  );
  // Two vendors in NCR so the demo shows the "nearest active vendor" rule: Gurugram and Noida.
  const vendor5 = await findOrCreate(
    () => prisma.vendor.findFirst({ where: { name: 'Gurugram Pearl Studio' } }),
    () =>
      prisma.vendor.create({
        data: {
          name: 'Gurugram Pearl Studio',
          contactName: 'Rohit Sharma',
          phone: '+919800000029',
          email: 'vendor5@sahyadripearls.test',
          address: 'Sector 29, Gurugram 122001',
          pincode: '122001',
          cities: { create: [{ cityId: delhiId }] },
        },
      }),
  );
  const vendor6 = await findOrCreate(
    () => prisma.vendor.findFirst({ where: { name: 'Noida Pearl House' } }),
    () =>
      prisma.vendor.create({
        data: {
          name: 'Noida Pearl House',
          contactName: 'Neha Gupta',
          phone: '+919800000030',
          email: 'vendor6@sahyadripearls.test',
          address: 'Sector 18, Noida 201301',
          pincode: '201301',
          cities: { create: [{ cityId: delhiId }] },
        },
      }),
  );
  await prisma.deliveryPartner.updateMany({
    where: { id: dp.id, vendorId: null },
    data: { vendorId: vendor.id },
  });
  await prisma.deliveryPartner.updateMany({
    where: { id: dp2.id, vendorId: null },
    data: { vendorId: vendor2.id },
  });
  const riders: Array<{
    name: string;
    phone: string;
    vehicleInfo: string;
    cityId: string;
    vendorId: string;
    isAvailable: boolean;
  }> = [
    {
      name: 'Amit Jadhav',
      phone: '+919800000025',
      vehicleInfo: 'Two-wheeler MH12',
      cityId: pune.id,
      vendorId: vendor.id,
      isAvailable: true,
    },
    {
      name: 'Sanjay More',
      phone: '+919800000028',
      vehicleInfo: 'Two-wheeler MH14',
      cityId: pune.id,
      vendorId: vendor.id,
      isAvailable: false,
    },
    {
      name: 'Rahul Verma',
      phone: '+919800000026',
      vehicleInfo: 'Two-wheeler DL3C',
      cityId: delhiId,
      vendorId: vendor3.id,
      isAvailable: true,
    },
    {
      name: 'Deepak Yadav',
      phone: '+919800000031',
      vehicleInfo: 'Two-wheeler HR26',
      cityId: delhiId,
      vendorId: vendor5.id,
      isAvailable: true,
    },
    {
      name: 'Imran Khan',
      phone: '+919800000032',
      vehicleInfo: 'Two-wheeler UP16',
      cityId: delhiId,
      vendorId: vendor6.id,
      isAvailable: true,
    },
    {
      name: 'Kiran Rao',
      phone: '+919800000027',
      vehicleInfo: 'Two-wheeler KA01',
      cityId: bengaluruId,
      vendorId: vendor4.id,
      isAvailable: true,
    },
  ];
  // Orders placed before routing existed go to their nearest vendor too, so every vendor panel shows its orders.
  const vendorsForRouting = (
    await prisma.vendor.findMany({
      where: { isActive: true },
      select: { id: true, pincode: true, cities: { select: { cityId: true } } },
    })
  ).map((v) => ({ ...v, cityIds: v.cities.map((c) => c.cityId) }));
  for (const o of await prisma.order.findMany({
    where: { fulfilmentVendorId: null },
    select: { id: true, cityId: true, addressSnapshot: true },
  })) {
    const pin = (o.addressSnapshot as { pincode?: string } | null)?.pincode;
    const v = pickNearestVendor(vendorsForRouting, pin, o.cityId);
    if (v) await prisma.order.update({ where: { id: o.id }, data: { fulfilmentVendorId: v.id } });
  }
  const riderRows = [];
  for (const r of riders) {
    riderRows.push(
      await prisma.deliveryPartner.upsert({
        where: { phone: r.phone },
        create: {
          name: r.name,
          phone: r.phone,
          vehicleInfo: r.vehicleInfo,
          vendorId: r.vendorId,
          isAvailable: r.isAvailable,
          cities: { create: [{ cityId: r.cityId }] },
        },
        update: {},
      }),
    );
  }

  // ── Users (one per role, plus a second of each partner for permission tests) ──
  const users: Array<Prisma.UserCreateInput & { email?: string; phone?: string }> = [
    {
      role: 'SUPER_ADMIN',
      name: 'Super Admin',
      email: 'admin@sahyadripearls.test',
      phone: '+919800000001',
      passwordHash: pw,
    },
    {
      role: 'STAFF',
      name: 'Catalogue Staff',
      email: 'staff@sahyadripearls.test',
      phone: '+919800000002',
      passwordHash: pw,
    },
    {
      role: 'CITY_MANAGER',
      name: 'Pune City Manager',
      email: 'pune.manager@sahyadripearls.test',
      phone: '+919800000006',
      passwordHash: pw,
      city: { connect: { id: pune.id } },
    },
    {
      role: 'CITY_MANAGER',
      name: 'Mumbai City Manager',
      email: 'mumbai.manager@sahyadripearls.test',
      phone: '+919800000016',
      passwordHash: pw,
      city: { connect: { id: mumbai.id } },
    },
    {
      role: 'VENDOR',
      name: 'Rohan Sawant',
      email: 'vendor@sahyadripearls.test',
      phone: '+919800000003',
      vendor: { connect: { id: vendor.id } },
    },
    {
      role: 'VENDOR',
      name: 'Meera Kulkarni',
      email: 'vendor2@sahyadripearls.test',
      phone: '+919800000013',
      vendor: { connect: { id: vendor2.id } },
    },
    {
      role: 'FRANCHISE',
      name: 'Anita Deshmukh',
      email: 'franchise.pune@sahyadripearls.test',
      phone: '+919800000004',
      franchise: { connect: { id: franchise.id } },
      city: { connect: { id: pune.id } },
    },
    {
      role: 'FRANCHISE',
      name: 'Farah Khan',
      email: 'franchise.mumbai@sahyadripearls.test',
      phone: '+919800000014',
      franchise: { connect: { id: franchise2.id } },
      city: { connect: { id: mumbai.id } },
    },
    {
      role: 'DELIVERY_PARTNER',
      name: 'Vikram Pawar',
      phone: '+919800000005',
      deliveryPartner: { connect: { id: dp.id } },
      city: { connect: { id: pune.id } },
    },
    {
      role: 'DELIVERY_PARTNER',
      name: 'Suresh Naik',
      phone: '+919800000015',
      deliveryPartner: { connect: { id: dp2.id } },
      city: { connect: { id: mumbai.id } },
    },
    {
      role: 'VENDOR',
      name: 'Kavya Malhotra',
      email: 'vendor3@sahyadripearls.test',
      phone: '+919800000023',
      vendor: { connect: { id: vendor3.id } },
    },
    {
      role: 'VENDOR',
      name: 'Arjun Rao',
      email: 'vendor4@sahyadripearls.test',
      phone: '+919800000024',
      vendor: { connect: { id: vendor4.id } },
    },
    {
      role: 'VENDOR',
      name: 'Rohit Sharma',
      email: 'vendor5@sahyadripearls.test',
      phone: '+919800000029',
      vendor: { connect: { id: vendor5.id } },
    },
    {
      role: 'VENDOR',
      name: 'Neha Gupta',
      email: 'vendor6@sahyadripearls.test',
      phone: '+919800000030',
      vendor: { connect: { id: vendor6.id } },
    },
    ...riderRows.map((r, i) => ({
      role: 'DELIVERY_PARTNER' as const,
      name: r.name,
      phone: r.phone,
      deliveryPartner: { connect: { id: r.id } },
      city: { connect: { id: riders[i]!.cityId } },
    })),
  ];
  for (const u of users) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [u.email ? { email: u.email } : {}, u.phone ? { phone: u.phone } : {}].filter(
          (x) => Object.keys(x).length,
        ),
      },
    });
    if (!existing) await prisma.user.create({ data: u });
  }
  const staff = await prisma.user.findUniqueOrThrow({ where: { email: 'staff@sahyadripearls.test' } });
  for (const [module, canCreate, canEdit, canDelete] of [
    ['PRODUCTS', true, true, false],
    ['CATEGORIES', true, true, false],
    ['COLLECTIONS', true, true, false],
    ['FARMS', true, true, false],
    ['ENQUIRIES', true, true, false],
    ['CONTENT', true, true, false],
  ] as const) {
    await prisma.staffPermission.upsert({
      where: { userId_module: { userId: staff.id, module } },
      create: { userId: staff.id, module, canView: true, canCreate, canEdit, canDelete },
      update: {},
    });
  }

  for (const c of [
    {
      name: 'Asha Patil',
      phone: '+919800000007',
      email: 'asha@example.com',
      code: 'ASHA7K2P',
      cityId: pune.id,
    },
    {
      name: 'Karan Mehta',
      phone: '+919800000017',
      email: 'karan@example.com',
      code: 'KARAN9M4',
      cityId: mumbai.id,
    },
  ]) {
    const exists = await prisma.user.findUnique({ where: { phone: c.phone } });
    if (!exists)
      await prisma.user.create({
        data: {
          role: 'CUSTOMER',
          name: c.name,
          phone: c.phone,
          email: c.email,
          customer: { create: { referralCode: c.code, cityId: c.cityId } },
        },
      });
  }

  // ── Farms ────────────────────────────────────────────────────
  const farms = {
    mulshi: await prisma.farm.upsert({
      where: { slug: 'mulshi-lake-farm' },
      create: {
        name: 'Mulshi Lake Farm',
        slug: 'mulshi-lake-farm',
        location: 'Mulshi, Pune district, Maharashtra',
        latitude: new Prisma.Decimal(18.5167),
        longitude: new Prisma.Decimal(73.5167),
        summary:
          'Freshwater pearls grown in the clean, cool waters of the Mulshi reservoir in the Sahyadri hills.',
        story:
          'Mulshi Lake Farm sits where the monsoon fills the Sahyadri valleys. Each mussel is nucleated by hand and tended for 18 to 24 months in floating nets. The farm works with local families, harvests once a year after the rains, and grades every pearl by lustre, surface and shape before it leaves the water’s edge.',
        heroImageUrl: writeMedia('samples/farm-mulshi.svg', sceneSvg('Mulshi Lake Farm', 'water')),
        galleryUrls: [writeMedia('samples/farm-mulshi-2.svg', sceneSvg('Harvest at Mulshi', 'farm'))],
        sortOrder: 1,
      },
      update: {},
    }),
    konkan: await prisma.farm.upsert({
      where: { slug: 'konkan-coast-farm' },
      create: {
        name: 'Konkan Coast Farm',
        slug: 'konkan-coast-farm',
        location: 'Ratnagiri, Maharashtra',
        latitude: new Prisma.Decimal(16.9944),
        longitude: new Prisma.Decimal(73.3),
        summary:
          'Pearls from the sheltered creeks of the Konkan coast, known for warm cream and golden tones.',
        story:
          'On the Konkan coast, tidal creeks bring rich water to the farm’s pearl beds. The warm water gives these pearls their soft cream and golden overtones. Every harvest is logged by bed and date, so each piece can be traced back to where it grew.',
        heroImageUrl: writeMedia('samples/farm-konkan.svg', sceneSvg('Konkan Coast Farm', 'farm')),
        galleryUrls: [writeMedia('samples/farm-konkan-2.svg', sceneSvg('Grading at Konkan', 'craft'))],
        sortOrder: 2,
      },
      update: {},
    }),
  };

  // ── Categories & collections ─────────────────────────────────
  const cats = await seedCategories(true);
  const cols: Record<string, { id: string }> = {};
  for (const [i, [name, slug, desc]] of (
    [
      ['Bridal', 'bridal', 'Heirloom strands and sets for the wedding season.'],
      ['Everyday', 'everyday', 'Light, modern pieces to wear every day.'],
      ['Heritage', 'heritage', 'Classic Maharashtrian designs, reimagined with farm pearls.'],
    ] as const
  ).entries()) {
    cols[slug] = await prisma.collection.upsert({
      where: { slug },
      create: {
        name,
        slug,
        description: desc,
        imageUrl: writeMedia(`samples/collection-${slug}.svg`, sceneSvg(name, i === 0 ? 'craft' : 'water')),
        isFeatured: true,
        sortOrder: i + 1,
      },
      update: {},
    });
  }

  // ── Products (~30) ───────────────────────────────────────────
  const products = SAMPLE_PRODUCTS;

  const created: Record<string, string> = {};
  for (const [i, [name, cat, col, farm, price, carat, shape, colour, x = {}]] of products.entries()) {
    const sku = `SP-${cat.slice(0, 2).toUpperCase()}-${String(i + 1).padStart(4, '0')}`;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const kind = cat === 'loose-pearls' ? 'loose' : cat;
    const isUnique = x.unique ?? false;
    const mainUrl = writeMedia(`samples/products/${slug}-1.svg`, productSvg(kind, colour, 0));
    const altUrl = writeMedia(
      `samples/products/${slug}-2.svg`,
      productSvg(kind, colour === 'White' ? 'Cream' : 'White', 1),
    );
    const pricePaise = rupees(price);
    const p = await prisma.product.upsert({
      where: { sku },
      create: {
        sku,
        name,
        slug,
        description: `${name} in ${colour.toLowerCase()} ${shape.toLowerCase()} pearls from ${farm === 'mulshi' ? 'Mulshi Lake Farm' : 'Konkan Coast Farm'}. Hand-selected for lustre and matched by our graders${x.metal ? `, set in ${x.metal}` : ''}.`,
        status: 'PUBLISHED',
        publishedAt: new Date(Date.now() - (products.length - i) * 86400000),
        categoryId: cats[cat]!.id,
        collectionId: col ? cols[col]!.id : null,
        farmId: farms[farm].id,
        vendorId: x.vendor ? vendor.id : null,
        pricePaise,
        priceOnRequest: x.por ?? false,
        metalCostPaise: x.metal ? Math.round(pricePaise * 0.25) : 0,
        labourCostPaise: Math.round(pricePaise * 0.1),
        pearlCostPaise: Math.round(pricePaise * 0.35),
        caratWeight: new Prisma.Decimal(carat),
        shape,
        colour,
        lustre: i % 3 === 0 ? 'Excellent' : 'High',
        surface: i % 4 === 0 ? 'Clean' : 'Lightly blemished',
        grade: price > 30000 ? 'AAA' : price > 10000 ? 'AA' : 'A',
        sizeMm: new Prisma.Decimal(cat === 'loose-pearls' ? 8 : 7 + (i % 4)),
        metal: x.metal ?? null,
        certification: 'Sahyadri Pearls Certificate of Authenticity',
        stockType: isUnique ? 'UNIQUE' : 'QUANTITY',
        quantity: isUnique ? (x.sold ? 0 : 1) : (x.qty ?? 5),
        soldAt: x.sold ? new Date() : null,
        isFeatured: x.featured ?? false,
        sortOrder: i,
        images: {
          create: [
            {
              kind: 'MAIN',
              url: mainUrl,
              alt: `${name}, ${colour.toLowerCase()} pearls`,
              width: 800,
              height: 800,
              sortOrder: 0,
            },
            {
              kind: 'CAROUSEL',
              url: altUrl,
              alt: `${name}, alternate view`,
              width: 800,
              height: 800,
              sortOrder: 1,
            },
          ],
        },
        cities: undefined,
      },
      update: {},
    });
    created[slug] = p.id;
    await prisma.certificate.upsert({
      where: { code: `CERT-${sku}` },
      create: {
        code: `CERT-${sku}`,
        productId: p.id,
        issuedBy: 'Sahyadri Pearls Grading Desk',
        details: {
          grade: p.grade,
          caratWeight: carat,
          shape,
          colour,
          farm: farm === 'mulshi' ? 'Mulshi Lake Farm' : 'Konkan Coast Farm',
        },
      },
      update: {},
    });
  }
  // related products: next two in the same category
  const all = await prisma.product.findMany({
    select: { id: true, categoryId: true },
    orderBy: { sortOrder: 'asc' },
  });
  for (const p of all) {
    const same = all.filter((q) => q.categoryId === p.categoryId && q.id !== p.id).slice(0, 3);
    for (const [i, r] of same.entries()) {
      await prisma.relatedProduct.upsert({
        where: { productId_relatedId: { productId: p.id, relatedId: r.id } },
        create: { productId: p.id, relatedId: r.id, sortOrder: i },
        update: {},
      });
    }
  }

  // ── WhatsApp numbers, routing, templates ─────────────────────
  const wa = async (label: string, phone: string, cityId: string | null, isDefault = false) =>
    findOrCreate(
      () => prisma.whatsAppNumber.findFirst({ where: { label } }),
      () => prisma.whatsAppNumber.create({ data: { label, phone, cityId, isDefault } }),
    );
  const waDefault = await wa('Sahyadri Pearls (main)', '+919800000000', null, true);
  const waPune = await wa('Pune team', '+919800000010', pune.id);
  const waMumbai = await wa('Mumbai team', '+919800000020', mumbai.id);
  const waWholesale = await wa('Wholesale', '+919800000030', null);
  const rules: Prisma.RoutingRuleUncheckedCreateInput[] = [
    {
      name: 'Bulk enquiries → wholesale',
      priority: 10,
      enquiryType: 'BULK',
      whatsAppNumberId: waWholesale.id,
    },
    {
      name: 'Pune → Pune team (Koregaon Park franchise)',
      priority: 50,
      cityId: pune.id,
      whatsAppNumberId: waPune.id,
      assignFranchiseId: franchise.id,
    },
    { name: 'Mumbai → Mumbai team', priority: 50, cityId: mumbai.id, whatsAppNumberId: waMumbai.id },
    { name: 'Everything else → main number', priority: 1000, whatsAppNumberId: waDefault.id },
  ];
  for (const r of rules) {
    await findOrCreate(
      () => prisma.routingRule.findFirst({ where: { name: r.name } }),
      () => prisma.routingRule.create({ data: r }),
    );
  }
  await seedTemplates();

  // ── Content ──────────────────────────────────────────────────
  // Banners: draw the art on every run (each deploy wipes the container's disk); add any banner that is missing,
  // matched by placement and title, and never change one the admin has edited.
  for (const [file, svg] of SAMPLE_BANNER_ART()) writeMedia(`samples/${file}`, svg);
  const banners = [
    {
      placement: 'HOME_HERO',
      title: 'Pearls with a birthplace',
      subtitle: 'Every pearl traced to a named farm in the Sahyadri hills and the Konkan coast.',
      imageUrl: '/media/samples/banner-hero.svg',
      linkUrl: '/jewellery',
      ctaLabel: 'Shop now',
      sortOrder: 1,
    },
    {
      placement: 'HOME_HERO',
      title: 'Golden pearls',
      subtitle: 'Rare, warm and quietly radiant.',
      imageUrl: '/media/samples/banner-golden.svg',
      linkUrl: '/jewellery?colour=Golden',
      ctaLabel: 'Shop golden pearls',
      sortOrder: 2,
    },
    {
      placement: 'HOME_HERO',
      title: 'Made for you',
      subtitle: 'Bridal sets and bespoke pieces, designed with our craftspeople.',
      imageUrl: '/media/samples/banner-custom.svg',
      linkUrl: '/customized-jewellery',
      ctaLabel: 'Start a design',
      sortOrder: 3,
    },
    {
      placement: 'HOME_SECONDARY',
      title: 'The Bridal Edit',
      subtitle: 'Heirloom strands for the big day.',
      imageUrl: '/media/samples/banner-bridal.svg',
      linkUrl: '/collections/bridal',
      ctaLabel: 'Shop bridal',
      sortOrder: 1,
    },
    {
      placement: 'HOME_SECONDARY',
      title: 'Gifts under ₹10,000',
      subtitle: 'Gift-wrapped, free.',
      imageUrl: '/media/samples/banner-gifts.svg',
      linkUrl: '/gifts',
      ctaLabel: 'Shop gifts',
      sortOrder: 2,
    },
    {
      placement: 'HOME_SECONDARY',
      title: 'Everyday pearls',
      subtitle: 'Light pieces to wear daily.',
      imageUrl: '/media/samples/banner-everyday.svg',
      linkUrl: '/collections/everyday',
      ctaLabel: 'Shop everyday',
      sortOrder: 3,
    },
  ];
  for (const b of banners) {
    await findOrCreate(
      () => prisma.banner.findFirst({ where: { placement: b.placement, title: b.title } }),
      () => prisma.banner.create({ data: b }),
    );
  }
  await useSamplePhotos();
  await partnerFarms();
  const blocks: Array<[string, Prisma.ContentBlockCreateInput['kind'], string | null, unknown]> = [
    [
      'home.story',
      'STORY',
      'From our farms',
      {
        body: 'Every Sahyadri pearl is grown on a farm we can name, by people we know. We follow each pearl from the water to your hands.',
        linkLabel: 'Visit our farms',
        linkUrl: '/our-farm',
        imageUrl: '/media/samples/farm-mulshi.svg',
      },
    ],
    [
      'home.trust',
      'TRUST_POINTS',
      'Why Sahyadri Pearls',
      {
        items: [
          { icon: 'farm', title: 'Farm-traced', text: 'Every piece names the farm its pearls came from.' },
          {
            icon: 'certificate',
            title: 'Certified',
            text: 'A certificate of authenticity with a QR code you can verify.',
          },
          { icon: 'truck', title: 'Insured delivery', text: 'Insured, tracked delivery across India.' },
          { icon: 'chat', title: 'Talk to us', text: 'Questions? Our team answers on WhatsApp.' },
        ],
      },
    ],
    ['home.featured', 'FEATURED_PRODUCTS', 'Featured pieces', { mode: 'flagged', limit: 8 }],
    ['home.collections', 'FEATURED_COLLECTIONS', 'Collections', { mode: 'flagged' }],
    [
      'home.custom_cta',
      'CTA',
      'Something only you will wear',
      {
        body: 'Tell us your idea and our designers will bring it to life with pearls from our farms.',
        linkLabel: 'Design your piece',
        linkUrl: '/customized-jewellery',
      },
    ],
    [
      'product.trust',
      'TRUST_POINTS',
      null,
      {
        items: [
          { icon: 'farm', title: 'Origin', text: 'Traced to its farm' },
          { icon: 'certificate', title: 'Certified', text: 'QR-verifiable certificate' },
          { icon: 'truck', title: 'Delivery', text: 'Insured, 3–5 working days' },
        ],
      },
    ],
    [
      'footer.about',
      'RICH_TEXT',
      'About Us',
      {
        body: 'Sahyadri Pearls brings farm-traced pearls from Maharashtra to your jewellery box.',
        address: 'Prabhat Road, Erandwane, Pune 411004, Maharashtra',
      },
    ],
    [
      'contact.info',
      'RICH_TEXT',
      'Contact',
      {
        phone: '+91 98000 00000',
        email: 'care@sahyadripearls.test',
        address: 'Prabhat Road, Erandwane, Pune 411004, Maharashtra',
        hours: 'Mon–Sat, 10 am – 7 pm',
        mapEmbedUrl: 'https://www.google.com/maps?q=Prabhat+Road+Pune&output=embed',
      },
    ],
    [
      'bulk.intro',
      'RICH_TEXT',
      'Bulk buying',
      {
        body: 'Wedding gifting, corporate orders and trade buyers: tell us what you need and our wholesale team will send a quote.',
      },
    ],
  ];
  for (const [key, kind, title, data] of blocks) {
    await prisma.contentBlock.upsert({
      where: { key },
      create: { key, kind, title, data: data as Prisma.InputJsonValue },
      update: {},
    });
  }
  const pages: Array<[string, string, boolean, string]> = [
    ['terms', 'Terms & Conditions', true, legal('Terms & Conditions')],
    ['refund-policy', 'Refund Policy', true, legal('Refund Policy')],
    ['privacy', 'Privacy Policy', true, legal('Privacy Policy')],
    [
      'return-cancellation-policy',
      'Return & Cancellation Policy',
      true,
      legal('Return & Cancellation Policy'),
    ],
    ['shipping-policy', 'Shipping / Delivery Policy', true, legal('Shipping / Delivery Policy')],
    [
      'our-story',
      'Our Story',
      false,
      '## Our Story\n\nSahyadri Pearls began on the banks of the Mulshi reservoir, with a simple idea: every pearl should have a birthplace you can name.\n\nToday we work with farms in the Sahyadri hills and on the Konkan coast. We grade every pearl by hand, set it with local craftspeople, and send it to you with a certificate that traces it back to the water it grew in.',
    ],
    [
      'about',
      'About Us',
      false,
      '## About Sahyadri Pearls\n\nWe are a Pune-based pearl jewellery house selling through our own team, partner vendors and city franchises.\n\n**Address:** Prabhat Road, Erandwane, Pune 411004, Maharashtra',
    ],
  ];
  await seedPages(pages);
  if ((await prisma.testimonial.count()) === 0)
    await prisma.testimonial.createMany({
      data: [
        {
          name: 'Priya S.',
          city: 'Pune',
          quote:
            'The strand I bought came with the farm’s name on the certificate. My mother loved that story as much as the pearls.',
          rating: 5,
          sortOrder: 1,
        },
        {
          name: 'Nikhil R.',
          city: 'Mumbai',
          quote:
            'They helped me design my wife’s anniversary ring over WhatsApp. Beautiful work and on time.',
          rating: 5,
          sortOrder: 2,
        },
        {
          name: 'Sneha K.',
          city: 'Nashik',
          quote: 'Lovely lustre, careful packaging and very honest advice.',
          rating: 4,
          sortOrder: 3,
        },
      ],
    });
  if ((await prisma.galleryItem.count()) === 0)
    await prisma.galleryItem.createMany({
      data: [
        { title: 'Morning at Mulshi', mediaUrl: '/media/samples/farm-mulshi.svg', tag: 'farm', sortOrder: 1 },
        { title: 'Harvest', mediaUrl: '/media/samples/farm-mulshi-2.svg', tag: 'farm', sortOrder: 2 },
        { title: 'Konkan creeks', mediaUrl: '/media/samples/farm-konkan.svg', tag: 'farm', sortOrder: 3 },
        { title: 'Grading', mediaUrl: '/media/samples/farm-konkan-2.svg', tag: 'craft', sortOrder: 4 },
      ],
    });
  if ((await prisma.faq.count()) === 0)
    await prisma.faq.createMany({
      data: [
        {
          group: 'Pearls',
          question: 'Are your pearls real?',
          answer:
            'Yes. Every pearl is a cultured pearl grown on a named farm, and every piece comes with a certificate of authenticity you can verify by scanning its QR code.',
          sortOrder: 1,
        },
        {
          group: 'Pearls',
          question: 'How do I care for pearls?',
          answer:
            'Put them on last and take them off first. Wipe with a soft cloth after wearing and store them separately from other jewellery.',
          sortOrder: 2,
        },
        {
          group: 'Orders',
          question: 'Can I pay cash on delivery?',
          answer:
            'Yes, for most orders. Very high-value and customized pieces need online payment or an advance.',
          sortOrder: 3,
        },
        {
          group: 'Orders',
          question: 'Why do some pieces say "Price on request"?',
          answer:
            'Rare and one-of-a-kind pieces are priced individually. Tap "Enquire on WhatsApp" and our team will share the price and details.',
          sortOrder: 4,
        },
        {
          group: 'Delivery',
          question: 'How long does delivery take?',
          answer: 'Most orders arrive in 3 to 5 working days. Every shipment is insured and tracked.',
          sortOrder: 5,
        },
        {
          group: 'Returns',
          question: 'Can I return a piece?',
          answer:
            'Yes, within 7 days of delivery, unworn and with its certificate. Customized pieces cannot be returned.',
          sortOrder: 6,
        },
      ],
    });
  for (const j of [
    {
      title: 'Jewellery Sales Associate',
      slug: 'jewellery-sales-associate-pune',
      location: 'Pune',
      description: 'Help customers choose pearls in our Koregaon Park store and on WhatsApp.',
      eligibility: 'Graduate; 1+ year retail experience; English and Marathi.',
    },
    {
      title: 'Pearl Grader (Trainee)',
      slug: 'pearl-grader-trainee-ratnagiri',
      location: 'Ratnagiri',
      description: 'Learn to grade pearls by lustre, surface and shape at our Konkan farm.',
      eligibility: 'Keen eye for detail; training provided.',
    },
  ]) {
    await prisma.jobOpening.upsert({ where: { slug: j.slug }, create: j, update: {} });
  }

  // ── Coupons ──────────────────────────────────────────────────
  for (const c of [
    {
      code: 'WELCOME10',
      description: '10% off your first order (up to ₹2,000)',
      discountType: 'PERCENT' as const,
      discountValue: 1000,
      maxDiscountPaise: rupees(2000),
      firstOrderOnly: true,
      showOnOffersPage: true,
    },
    {
      code: 'PEARL500',
      description: '₹500 off orders above ₹10,000',
      discountType: 'FLAT' as const,
      discountValue: rupees(500),
      minOrderPaise: rupees(10000),
      showOnOffersPage: true,
      perCustomerLimit: 3,
    },
    {
      code: 'EARRINGS15',
      description: '15% off earrings',
      discountType: 'PERCENT' as const,
      discountValue: 1500,
      showOnOffersPage: true,
      categories: { create: [{ categoryId: cats['earrings']!.id }] },
    },
  ]) {
    const exists = await prisma.coupon.findUnique({ where: { code: c.code } });
    if (!exists) await prisma.coupon.create({ data: c });
  }

  // ── Pricing ──────────────────────────────────────────────────
  if ((await prisma.pearlRate.count()) === 0) {
    const grades: Array<[string, number]> = [
      ['AAA', 450000],
      ['AA', 300000],
      ['A', 180000],
    ];
    const bands: Array<[number, number, number]> = [
      [2, 5.99, 0.8],
      [6, 8.99, 1],
      [9, 14, 1.4],
    ];
    for (const farm of [farms.mulshi, farms.konkan]) {
      for (const [grade, base] of grades) {
        for (const [min, max, mult] of bands) {
          await prisma.pearlRate.create({
            data: {
              grade,
              farmId: farm.id,
              sizeMinMm: new Prisma.Decimal(min),
              sizeMaxMm: new Prisma.Decimal(max),
              ratePerCaratPaise: Math.round(base * mult * (farm.slug === 'konkan-coast-farm' ? 1.1 : 1)),
            },
          });
        }
      }
    }
    await prisma.marginRule.createMany({
      data: [
        { name: 'Default margin', marginBp: 3500, priority: 1000 },
        { name: 'AAA grade', grade: 'AAA', marginBp: 4500, priority: 100 },
        {
          name: 'Loose pearls',
          categoryId: cats['loose-pearls']!.id,
          marginBp: 2000,
          minMarginPaise: rupees(300),
          priority: 50,
        },
      ],
    });
  }

  console.log(
    `Seed complete. Staff/partner password: ${process.env.SEED_PASSWORD ? '(from SEED_PASSWORD)' : PASSWORD}`,
  );
}

function legal(title: string): string {
  return `## ${title}\n\n> Sample text for development. Replace with the final ${title.toLowerCase()} approved by Sahyadri Pearls before launch.\n\n### 1. Introduction\nThese terms describe how Sahyadri Pearls handles orders placed on its website and apps.\n\n### 2. Details\nThe owner supplies the full text from the admin (Content → Pages). Every published change is kept as a new version.`;
}

/**
 * Sample data only: put real photographs where the drawn sample art is. Only rows still pointing at the drawn art
 * (/media/samples/...) change, so photos uploaded in the admin are never touched.
 */
async function useSamplePhotos() {
  const drawn = (url: string | null | undefined) => !!url && url.startsWith('/media/samples/');
  const byCategory: Record<string, string[]> = {};
  for (const [name, cat] of SAMPLE_PRODUCTS) (byCategory[cat] ??= []).push(sampleSlug(name));
  for (const [cat, slugs] of Object.entries(byCategory)) {
    const pool = SAMPLE_PHOTOS.products[cat];
    if (!pool?.length) continue;
    for (const [i, slug] of slugs.entries()) {
      const p = await prisma.product.findUnique({
        where: { slug },
        select: {
          images: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }], select: { id: true, url: true } },
        },
      });
      for (const [k, img] of (p?.images ?? []).entries()) {
        if (!drawn(img.url)) continue;
        const ph = photo.square(pool[(i + k) % pool.length]!);
        await prisma.productImage.update({
          where: { id: img.id },
          data: { url: ph.url, variants: ph.variants, width: 1200, height: 1200 },
        });
      }
    }
  }
  for (const [slug, id] of Object.entries(SAMPLE_PHOTOS.categories)) {
    const c = await prisma.category.findUnique({ where: { slug }, select: { imageUrl: true } });
    if (c && drawn(c.imageUrl))
      await prisma.category.update({ where: { slug }, data: { imageUrl: photo.tile(id) } });
  }
  for (const b of await prisma.banner.findMany({
    where: { imageUrl: { startsWith: '/media/samples/banner-' } },
  })) {
    const pick = SAMPLE_PHOTOS.banners[b.imageUrl.replace('/media/samples/', '')];
    if (pick)
      await prisma.banner.update({
        where: { id: b.id },
        data: { imageUrl: pick.wide ? photo.wide(pick.id) : photo.tile(pick.id) },
      });
  }
}

/**
 * The partner farms the pearls come from (meeting of 19 Oct): sample pieces are spread across them so the
 * storefront can be browsed by farm, and three high-value pieces are marked exclusive.
 */
async function partnerFarms() {
  const partners = [
    ['Swastik Pearl Farm', 'swastik-pearl-farm', 'Nashik, Maharashtra', '1649502066352-9cd7ade30316', 'Round and near-round freshwater pearls, 2 to 3 carat.'],
    ['Swati Pearl Farm', 'swati-pearl-farm', 'Kolhapur, Maharashtra', '1654699991494-892326ee8171', 'Cream and golden pearls with a soft, even lustre, 3 to 4 carat.'],
    ['Nilgiri Pearl Farm', 'nilgiri-pearl-farm', 'Satara, Maharashtra', '1595345705177-ffe090eb0784', 'Hill-water pearls known for bright white lustre, 4 to 5 carat.'],
    ['Jeeva Pearl Farm', 'jeeva-pearl-farm', 'Sindhudurg, Maharashtra', '1654699991520-aaaf4dd2608b', 'Larger baroque and coin pearls from coastal creeks, 5 to 6 carat.'],
  ] as const;
  const ids: string[] = [];
  for (const [i, [name, slug, location, img, summary]] of partners.entries()) {
    const f = await prisma.farm.upsert({
      where: { slug },
      create: { name, slug, location, summary, story: `${summary} Every harvest is graded and logged, so each piece can be traced back to ${name}.`, heroImageUrl: photo.tile(img), galleryUrls: [], sortOrder: 3 + i },
      update: {},
    });
    ids.push(f.id);
  }
  // The two original farms get photos too.
  for (const [slug, img] of [['mulshi-lake-farm', '1515562141207-7a88fb7ce338'], ['konkan-coast-farm', '1586115180241-b3e4f01ed837']] as const) {
    const f = await prisma.farm.findUnique({ where: { slug }, select: { heroImageUrl: true } });
    if (f?.heroImageUrl?.startsWith('/media/samples/')) await prisma.farm.update({ where: { slug }, data: { heroImageUrl: photo.tile(img) } });
  }
  // Spread the sample pieces over all six farms, once (only pieces still on the two original farms move).
  const original = await prisma.farm.findMany({ where: { slug: { in: ['mulshi-lake-farm', 'konkan-coast-farm'] } }, select: { id: true } });
  const onNew = await prisma.product.count({ where: { farmId: { in: ids } } });
  if (!onNew) {
    for (const [i, [name]] of SAMPLE_PRODUCTS.entries()) {
      if (i % 3 === 0) continue;
      const p = await prisma.product.findFirst({
        where: { slug: sampleSlug(name), farmId: { in: original.map((o) => o.id) } },
        select: { id: true, description: true },
      });
      const k = i % ids.length;
      if (p)
        await prisma.product.update({
          where: { id: p.id },
          data: {
            farmId: ids[k]!,
            description: p.description?.replace(/Mulshi Lake Farm|Konkan Coast Farm/g, partners[k]![0]) ?? null,
          },
        });
    }
  }
  if (!(await prisma.product.count({ where: { isExclusive: true } })))
    await prisma.product.updateMany({
      where: { slug: { in: ['royal-peshwai-haar', 'monsoon-rain-necklace', 'collector-golden-pearl-12mm'].map((x) => x) } },
      data: { isExclusive: true },
    });
}

async function findOrCreate<T>(find: () => Promise<T | null>, create: () => Promise<T>): Promise<T> {
  return (await find()) ?? (await create());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
