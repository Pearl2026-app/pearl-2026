'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorText } from './api';
import { useRefOptions } from '@/components/fields';
// Configuration for every simple admin resource. Business settings are data (rule 4): adding a city,
// vendor, franchise, manufacturer or delivery partner is a form, not a deployment.
import { Badge, StatusBadge } from '@sahyadri/ui';
import type { ResourceDef } from '@/components/resource';
import { date, inr } from './format';

const active = (r: { isActive?: boolean }) => <Badge tone={r.isActive ? 'success' : 'danger'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>;
const activeFilter = { name: 'isActive', label: 'Status', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] };
const cityNames = (r: { cities?: Array<{ city: { name: string } }> }) => r.cities?.map((c) => c.city.name).join(', ') || 'All cities';
const cityIdsOf = (r: { cities?: Array<{ city?: { id: string }; cityId?: string }> }) => r.cities?.map((c) => c.city?.id ?? c.cityId) ?? [];
const cityRef = { path: '/admin/cities' };
const seoFields = [
  { name: 'seoTitle', label: 'SEO title (optional)', hint: 'Leave empty to generate automatically. Up to 70 characters.' },
  { name: 'seoDescription', label: 'SEO description (optional)', type: 'textarea' as const, hint: 'Up to 170 characters.' },
];

export const RESOURCES: Record<string, ResourceDef> = {
  cities: {
    key: 'cities',
    title: 'Cities',
    singular: 'City',
    description: 'Cities you sell and deliver in. A new city is live as soon as it is added.',
    api: '/admin/cities',
    module: 'CITIES',
    sortDefault: 'sortOrder',
    columns: [
      { key: 'name', label: 'City', sortable: true },
      { key: 'state', label: 'State' },
      { key: 'deliveryChargePaise', label: 'Delivery charge', render: (r) => (r.deliveryChargePaise == null ? 'Default' : inr(r.deliveryChargePaise)) },
      { key: 'isActive', label: 'Status', render: active },
    ],
    filters: [activeFilter],
    fields: [
      { name: 'name', label: 'City name', required: true },
      { name: 'state', label: 'State', required: true },
      { name: 'slug', label: 'URL name', hint: 'Generated from the name if left empty.' },
      { name: 'deliveryChargePaise', label: 'Delivery charge override', type: 'money', hint: 'Leave empty to use the default from Settings.' },
      { name: 'sortOrder', label: 'Sort order', type: 'number' },
    ],
    defaults: { state: 'Maharashtra' },
    remove: { label: 'Deactivate', kind: 'deactivate' },
  },
  vendors: {
    key: 'vendors',
    title: 'Vendors',
    singular: 'Vendor',
    api: '/admin/vendors',
    module: 'VENDORS',
    description:
      'Outside partner shops that sell through this website alongside your own stock. A vendor lists pieces (you approve every change), and orders are routed to the nearest active vendor by PIN-code distance. Not using partners yet? Simply leave this section empty — your own stock does not need a vendor.',
    columns: [
      { key: 'name', label: 'Vendor', sortable: true },
      { key: 'contactName', label: 'Contact' },
      { key: 'phone', label: 'Phone' },
      { key: 'cities', label: 'Cities', render: cityNames },
      { key: '_count', label: 'Products', render: (r) => r._count?.products ?? 0 },
      { key: 'isActive', label: 'Status', render: active },
    ],
    filters: [activeFilter],
    fields: [
      { name: 'name', label: 'Vendor name', required: true },
      { name: 'contactName', label: 'Contact person' },
      { name: 'phone', label: 'Phone', required: true, placeholder: '+91 98xxx xxxxx' },
      { name: 'email', label: 'Email' },
      { name: 'gstin', label: 'GSTIN' },
      { name: 'address', label: 'Address', type: 'textarea' },
      { name: 'pincode', label: 'PIN code of the shop', hint: 'Orders go automatically to the active vendor nearest the customer’s PIN code.' },
      { name: 'cityIds', label: 'Cities served', type: 'refMulti', ref: cityRef, read: cityIdsOf },
    ],
    extraActions: (r) => <MovePieces vendorId={String(r.id)} vendorName={String(r.name)} />,
    remove: { label: 'Deactivate', kind: 'deactivate' },
  },
  franchises: {
    key: 'franchises',
    title: 'Franchises',
    singular: 'Franchise',
    description: 'City franchises and stores. Enquiries and orders are assigned to them by city and area.',
    api: '/admin/franchises',
    module: 'FRANCHISES',
    columns: [
      { key: 'name', label: 'Franchise', sortable: true },
      { key: 'city', label: 'City', render: (r) => r.city?.name },
      { key: 'area', label: 'Area', sortable: true },
      { key: 'phone', label: 'Phone' },
      { key: '_count', label: 'Orders / enquiries', render: (r) => `${r._count?.orders ?? 0} / ${r._count?.enquiries ?? 0}` },
      { key: 'isActive', label: 'Status', render: active },
    ],
    filters: [activeFilter],
    fields: [
      { name: 'name', label: 'Franchise name', required: true },
      { name: 'cityId', label: 'City', type: 'ref', ref: cityRef, required: true },
      { name: 'area', label: 'Area', required: true },
      { name: 'address', label: 'Address', type: 'textarea', required: true },
      { name: 'contactName', label: 'Contact person' },
      { name: 'phone', label: 'Phone', required: true },
      { name: 'email', label: 'Email' },
      { name: 'cityIds', label: 'Other cities served', type: 'refMulti', ref: cityRef, read: cityIdsOf },
      { name: 'showInStoreList', label: 'Show on the website’s “Visit us” page', type: 'switch', hint: 'Publishes the name, area, address, phone and hours. Customers can also book store visits here.' },
      { name: 'openingHours', label: 'Opening hours', hint: 'e.g. Mon–Sat, 11 am – 8 pm' },
      { name: 'mapUrl', label: 'Google Maps link' },
    ],
    remove: { label: 'Deactivate', kind: 'deactivate' },
  },
  manufacturers: {
    key: 'manufacturers',
    title: 'Manufacturers',
    singular: 'Manufacturer',
    description: 'Workshops that receive purchase orders for customized pieces.',
    api: '/admin/manufacturers',
    module: 'MANUFACTURERS',
    columns: [
      { key: 'name', label: 'Manufacturer', sortable: true },
      { key: 'contactName', label: 'Contact' },
      { key: 'city', label: 'City', render: (r) => r.city?.name ?? '—' },
      { key: 'speciality', label: 'Speciality' },
      { key: '_count', label: 'POs', render: (r) => r._count?.purchaseOrders ?? 0 },
      { key: 'isActive', label: 'Status', render: active },
    ],
    filters: [activeFilter],
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'contactName', label: 'Contact person' },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email' },
      { name: 'cityId', label: 'City', type: 'ref', ref: cityRef },
      { name: 'speciality', label: 'Speciality' },
    ],
    remove: { label: 'Deactivate', kind: 'deactivate' },
  },
  'delivery-partners': {
    key: 'delivery-partners',
    title: 'Delivery partners',
    singular: 'Delivery partner',
    description: 'Riders can also apply on the website with their documents; approve them under Rider applications.',
    api: '/admin/delivery-partners',
    module: 'DELIVERY_PARTNERS',
    headerLinks: (
      <Link href="/rider-applications" className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm hover:border-ink">
        Rider applications
      </Link>
    ),
    columns: [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'phone', label: 'Phone' },
      { key: 'vendor', label: 'Vendor', render: (r) => r.vendor?.name ?? '—' },
      {
        key: 'approvalStatus',
        label: 'Approval',
        render: (r) =>
          r.approvalStatus === 'PENDING' ? <Badge tone="waiting">Waiting</Badge> : r.approvalStatus === 'REJECTED' ? <Badge tone="danger">Rejected</Badge> : <Badge tone="success">Approved</Badge>,
      },
      { key: 'cities', label: 'Cities', render: cityNames },
      { key: 'user', label: 'Login', render: (r) => (r.user ? <Badge tone="success">Yes</Badge> : <Badge tone="waiting">No login</Badge>) },
      { key: '_count', label: 'Deliveries', render: (r) => r._count?.deliveries ?? 0 },
      { key: 'isActive', label: 'Status', render: active },
    ],
    filters: [activeFilter],
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'phone', label: 'Mobile number', required: true, hint: 'They sign in to the delivery app with this number.' },
      { name: 'vehicleInfo', label: 'Vehicle' },
      { name: 'vendorId', label: 'Works for vendor', type: 'ref', ref: { path: '/admin/vendors' }, hint: 'The vendor sees this rider when assigning its orders.' },
      { name: 'isAvailable', label: 'Available for new deliveries', type: 'switch' },
      { name: 'cityIds', label: 'Cities', type: 'refMulti', ref: cityRef, read: cityIdsOf },
    ],
    remove: { label: 'Deactivate', kind: 'deactivate' },
  },
  categories: {
    key: 'categories',
    title: 'Categories',
    singular: 'Category',
    api: '/admin/categories',
    module: 'CATEGORIES',
    sortDefault: 'sortOrder',
    columns: [
      { key: 'name', label: 'Category', sortable: true },
      { key: 'cities', label: 'Shown in', render: cityNames },
      { key: 'gstRateBp', label: 'GST', render: (r) => `${r.gstRateBp / 100}%` },
      { key: 'hsnCode', label: 'HSN' },
      { key: '_count', label: 'Products', render: (r) => r._count?.products ?? 0 },
      { key: 'isActive', label: 'Status', render: active },
    ],
    filters: [activeFilter],
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'slug', label: 'URL name', hint: 'Generated from the name if left empty.' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'imageUrl', label: 'Image', type: 'image', folder: 'categories' },
      { name: 'cityIds', label: 'Cities it appears in', type: 'refMulti', ref: cityRef, read: cityIdsOf, hint: 'None selected = every city.' },
      { name: 'gstRateBp', label: 'GST rate', type: 'percent', hint: 'Used on invoices for products in this category.' },
      { name: 'hsnCode', label: 'HSN code' },
      { name: 'sortOrder', label: 'Sort order', type: 'number' },
      { name: 'isActive', label: 'Active', type: 'switch' },
      ...seoFields,
    ],
    defaults: { gstRateBp: 300, isActive: true, hsnCode: '7113' },
    remove: { label: 'Archive', kind: 'archive' },
  },
  collections: {
    key: 'collections',
    title: 'Collections',
    singular: 'Collection',
    api: '/admin/collections',
    module: 'COLLECTIONS',
    sortDefault: 'sortOrder',
    columns: [
      { key: 'name', label: 'Collection', sortable: true },
      { key: 'isFeatured', label: 'Featured', render: (r) => (r.isFeatured ? 'Yes' : 'No') },
      { key: '_count', label: 'Products', render: (r) => r._count?.products ?? 0 },
      { key: 'isActive', label: 'Status', render: active },
    ],
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'slug', label: 'URL name' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'imageUrl', label: 'Image', type: 'image', folder: 'collections' },
      { name: 'sortOrder', label: 'Sort order', type: 'number' },
      { name: 'isFeatured', label: 'Show on the home page', type: 'switch' },
      { name: 'isActive', label: 'Active', type: 'switch' },
      ...seoFields,
    ],
    defaults: { isActive: true },
    remove: { label: 'Archive', kind: 'archive' },
  },
  farms: {
    key: 'farms',
    title: 'Farms',
    singular: 'Farm',
    description: 'Each farm gets its own page on the website, with the pearls that came from it.',
    api: '/admin/farms',
    module: 'FARMS',
    sortDefault: 'sortOrder',
    columns: [
      { key: 'name', label: 'Farm', sortable: true },
      { key: 'location', label: 'Location' },
      { key: '_count', label: 'Products', render: (r) => r._count?.products ?? 0 },
      { key: 'isActive', label: 'Status', render: active },
    ],
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'slug', label: 'URL name' },
      { name: 'location', label: 'Location', required: true },
      { name: 'latitude', label: 'Latitude', type: 'number' },
      { name: 'longitude', label: 'Longitude', type: 'number' },
      { name: 'summary', label: 'Short summary', type: 'textarea' },
      { name: 'story', label: 'Farm story', type: 'textarea', wide: true },
      { name: 'heroImageUrl', label: 'Main photo', type: 'image', folder: 'farms' },
      { name: 'galleryUrls', label: 'Photo URLs (one per line)', type: 'list', hint: 'Upload photos under Gallery or Uploads and paste their links here.' },
      { name: 'sortOrder', label: 'Sort order', type: 'number' },
      { name: 'isActive', label: 'Active', type: 'switch' },
      ...seoFields,
    ],
    toBody: (v) => ({ ...v, latitude: v.latitude == null ? null : Number(v.latitude), longitude: v.longitude == null ? null : Number(v.longitude) }),
    defaults: { isActive: true },
    remove: { label: 'Archive', kind: 'archive' },
  },
  banners: {
    key: 'banners',
    title: 'Banners',
    singular: 'Banner',
    api: '/admin/banners',
    module: 'CONTENT',
    sortDefault: 'sortOrder',
    columns: [
      { key: 'title', label: 'Title' },
      { key: 'placement', label: 'Placement' },
      { key: 'startsAt', label: 'Runs', render: (r) => (r.startsAt || r.endsAt ? `${date(r.startsAt)} – ${date(r.endsAt)}` : 'Always') },
      { key: 'isActive', label: 'Status', render: active },
    ],
    fields: [
      { name: 'placement', label: 'Placement', type: 'select', required: true, options: [{ value: 'HOME_HERO', label: 'Home – hero' }, { value: 'HOME_SECONDARY', label: 'Home – secondary' }, { value: 'CATEGORY_TOP', label: 'Category – top' }] },
      { name: 'title', label: 'Title' },
      { name: 'subtitle', label: 'Subtitle', type: 'textarea' },
      { name: 'imageUrl', label: 'Image (desktop)', type: 'image', folder: 'banners', required: true },
      { name: 'mobileImageUrl', label: 'Image (mobile, optional)', type: 'image', folder: 'banners' },
      { name: 'linkUrl', label: 'Link', placeholder: '/jewellery' },
      { name: 'ctaLabel', label: 'Button text' },
      { name: 'startsAt', label: 'Starts', type: 'datetime' },
      { name: 'endsAt', label: 'Ends', type: 'datetime' },
      { name: 'sortOrder', label: 'Sort order', type: 'number' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    defaults: { placement: 'HOME_HERO', isActive: true },
    remove: { label: 'Delete', kind: 'delete' },
  },
  'content-blocks': {
    key: 'content-blocks',
    title: 'Home & page blocks',
    singular: 'Content block',
    description: 'Story, trust points, footer text, contact details and other editable sections.',
    api: '/admin/content-blocks',
    module: 'CONTENT',
    sortDefault: 'key',
    columns: [
      { key: 'key', label: 'Key', sortable: true },
      { key: 'title', label: 'Title' },
      { key: 'kind', label: 'Kind', render: (r) => <StatusBadge status={r.kind} /> },
      { key: 'isActive', label: 'Status', render: active },
    ],
    fields: [
      { name: 'key', label: 'Key', required: true, hint: 'Where it appears, e.g. home.story' },
      { name: 'kind', label: 'Kind', type: 'select', required: true, options: ['HERO', 'RICH_TEXT', 'TRUST_POINTS', 'FEATURED_PRODUCTS', 'FEATURED_COLLECTIONS', 'STORY', 'CTA'].map((k) => ({ value: k, label: k })) },
      { name: 'title', label: 'Title' },
      { name: 'data', label: 'Content', type: 'json', hint: 'Text, links and items for this block.' },
      { name: 'sortOrder', label: 'Sort order', type: 'number' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    defaults: { kind: 'RICH_TEXT', data: { body: '' }, isActive: true },
    remove: { label: 'Deactivate', kind: 'deactivate' },
    csv: false,
  },
  testimonials: {
    key: 'testimonials',
    title: 'Testimonials',
    singular: 'Testimonial',
    api: '/admin/testimonials',
    module: 'CONTENT',
    sortDefault: 'sortOrder',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'city', label: 'City' },
      { key: 'quote', label: 'Quote', render: (r) => (r.quote?.length > 80 ? r.quote.slice(0, 80) + '…' : r.quote) },
      { key: 'isActive', label: 'Status', render: active },
    ],
    fields: [
      { name: 'name', label: 'Customer name', required: true },
      { name: 'city', label: 'City' },
      { name: 'quote', label: 'Quote', type: 'textarea', required: true },
      { name: 'rating', label: 'Rating (1–5)', type: 'number' },
      { name: 'photoUrl', label: 'Photo', type: 'image', folder: 'content' },
      { name: 'sortOrder', label: 'Sort order', type: 'number' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    defaults: { isActive: true, rating: 5 },
    remove: { label: 'Delete', kind: 'delete' },
  },
  gallery: {
    key: 'gallery',
    title: 'Gallery',
    singular: 'Gallery item',
    api: '/admin/gallery',
    module: 'CONTENT',
    sortDefault: 'sortOrder',
    columns: [
      { key: 'title', label: 'Title' },
      { key: 'tag', label: 'Tag' },
      { key: 'mediaUrl', label: 'Image', render: (r) => (
        <img src={r.mediaUrl} alt="" className="h-10 w-16 rounded-sm object-cover" />
      ) },
      { key: 'isActive', label: 'Status', render: active },
    ],
    fields: [
      { name: 'title', label: 'Title' },
      { name: 'caption', label: 'Caption', type: 'textarea' },
      { name: 'mediaUrl', label: 'Image', type: 'image', folder: 'gallery', required: true },
      { name: 'tag', label: 'Tag', type: 'select', options: [{ value: 'farm', label: 'Farm' }, { value: 'craft', label: 'Craft' }, { value: 'customers', label: 'Customers' }] },
      { name: 'sortOrder', label: 'Sort order', type: 'number' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    defaults: { isActive: true },
    remove: { label: 'Delete', kind: 'delete' },
  },
  faq: {
    key: 'faq',
    title: 'FAQ',
    singular: 'Question',
    api: '/admin/faq',
    module: 'CONTENT',
    sortDefault: 'sortOrder',
    columns: [
      { key: 'question', label: 'Question' },
      { key: 'group', label: 'Group' },
      { key: 'isActive', label: 'Status', render: active },
    ],
    fields: [
      { name: 'question', label: 'Question', required: true, wide: true },
      { name: 'answer', label: 'Answer', type: 'textarea', required: true },
      { name: 'group', label: 'Group', placeholder: 'Orders, Pearls, Delivery…' },
      { name: 'sortOrder', label: 'Sort order', type: 'number' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    defaults: { isActive: true },
    remove: { label: 'Delete', kind: 'delete' },
  },
  jobs: {
    key: 'jobs',
    title: 'Careers',
    singular: 'Job opening',
    api: '/admin/jobs',
    module: 'CAREERS',
    columns: [
      { key: 'title', label: 'Title', sortable: true },
      { key: 'location', label: 'Location' },
      { key: '_count', label: 'Applications', render: (r) => r._count?.applications ?? 0 },
      { key: 'closesAt', label: 'Closes', render: (r) => date(r.closesAt) },
      { key: 'isActive', label: 'Status', render: active },
    ],
    fields: [
      { name: 'title', label: 'Title', required: true },
      { name: 'location', label: 'Location', required: true },
      { name: 'description', label: 'Description', type: 'textarea', required: true },
      { name: 'eligibility', label: 'Eligibility', type: 'textarea' },
      { name: 'closesAt', label: 'Closes on', type: 'date' },
      { name: 'isActive', label: 'Open', type: 'switch' },
    ],
    defaults: { isActive: true },
    remove: { label: 'Close', kind: 'deactivate' },
  },
  coupons: {
    key: 'coupons',
    title: 'Coupons & offers',
    singular: 'Coupon',
    api: '/admin/coupons',
    module: 'COUPONS',
    description: 'Codes customers enter at checkout, including printed coupons from partner brands. Leave the city empty for a code that works anywhere; pick a city for an area offer.',
    headerLinks: (
      <Link href="/coupon-batches" className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm hover:border-ink">
        Printed code batches
      </Link>
    ),
    columns: [
      { key: 'code', label: 'Code', sortable: true },
      { key: 'city', label: 'Where', render: (r) => r.city?.name ?? 'All India' },
      { key: 'discount', label: 'Discount', render: (r) => (r.discountType === 'PERCENT' ? `${r.discountValue / 100}%` : inr(r.discountValue)) },
      { key: 'minOrderPaise', label: 'Min order', render: (r) => (r.minOrderPaise ? inr(r.minOrderPaise) : '—') },
      { key: 'endsAt', label: 'Ends', sortable: true, render: (r) => (r.endsAt ? date(r.endsAt) : 'No end') },
      { key: '_count', label: 'Used', render: (r) => `${r._count?.redemptions ?? 0}${r.usageLimit ? ` / ${r.usageLimit}` : ''}` },
      { key: 'isActive', label: 'Status', render: active },
    ],
    filters: [activeFilter],
    fields: [
      { name: 'code', label: 'Code', required: true, hint: '3–20 letters and digits, e.g. DIWALI10' },
      { name: 'description', label: 'Description shown to customers', wide: true },
      { name: 'discountType', label: 'Discount type', type: 'select', required: true, options: [{ value: 'PERCENT', label: 'Percentage' }, { value: 'FLAT', label: 'Flat amount' }] },
      { name: 'percentValue', label: 'Percentage off', type: 'percent', showIf: (v) => v.discountType === 'PERCENT', read: (r) => (r.discountType === 'PERCENT' ? r.discountValue : null) },
      { name: 'flatValue', label: 'Amount off', type: 'money', showIf: (v) => v.discountType === 'FLAT', read: (r) => (r.discountType === 'FLAT' ? r.discountValue : null) },
      { name: 'maxDiscountPaise', label: 'Maximum discount (optional)', type: 'money', showIf: (v) => v.discountType === 'PERCENT' },
      { name: 'minOrderPaise', label: 'Minimum order value', type: 'money' },
      { name: 'cityId', label: 'Only for deliveries in (optional)', type: 'ref', ref: cityRef, hint: 'Area offer. Vendors and city managers must pick their city.' },
      { name: 'startsAt', label: 'Starts', type: 'datetime' },
      { name: 'endsAt', label: 'Ends', type: 'datetime' },
      { name: 'usageLimit', label: 'Total uses allowed (optional)', type: 'number' },
      { name: 'perCustomerLimit', label: 'Uses per customer (optional)', type: 'number' },
      { name: 'categoryIds', label: 'Only these categories (optional)', type: 'refMulti', ref: { path: '/admin/categories' }, read: (r) => r.categories?.map((c: any) => c.category.id) ?? [] },
      { name: 'productIds', label: 'Only these pieces (optional)', type: 'refMulti', ref: { path: '/admin/products', query: { status: 'PUBLISHED' } }, read: (r) => r.products?.map((p: any) => p.product.id) ?? [] },
      { name: 'firstOrderOnly', label: 'First order only', type: 'switch' },
      { name: 'showOnOffersPage', label: 'Show on offers page', type: 'switch' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    defaults: { discountType: 'PERCENT', isActive: true, minOrderPaise: 0 },
    toBody: ({ percentValue, flatValue, ...v }) => ({ ...v, discountValue: v.discountType === 'PERCENT' ? percentValue : flatValue }),
    remove: { label: 'Deactivate', kind: 'deactivate' },
  },
  'pearl-rates': {
    key: 'pearl-rates',
    title: 'Pearl rates',
    singular: 'Rate',
    api: '/admin/pearl-rates',
    module: 'PRICING',
    description: 'Rate per carat by grade, farm and size. These manual rates are the guaranteed source; a live feed, when switched on, only adds feed rows.',
    sortDefault: 'grade',
    columns: [
      { key: 'grade', label: 'Grade', sortable: true },
      { key: 'farm', label: 'Farm', render: (r) => r.farm?.name ?? 'Any farm' },
      { key: 'size', label: 'Size (mm)', render: (r) => `${Number(r.sizeMinMm)}–${Number(r.sizeMaxMm)}` },
      { key: 'ratePerCaratPaise', label: 'Rate / carat', sortable: true, render: (r) => inr(r.ratePerCaratPaise) },
      { key: 'source', label: 'Source', render: (r) => (r.source === 'FEED' ? 'Feed' : 'Manual') },
      { key: 'effectiveFrom', label: 'From', render: (r) => date(r.effectiveFrom) },
      { key: 'isActive', label: 'Status', render: active },
    ],
    filters: [activeFilter, { name: 'source', label: 'Source', options: [{ value: 'MANUAL', label: 'Manual' }, { value: 'FEED', label: 'Feed' }] }],
    fields: [
      { name: 'grade', label: 'Grade', required: true, placeholder: 'AAA, AA, A…' },
      { name: 'farmId', label: 'Farm (empty = any farm)', type: 'ref', ref: { path: '/admin/farms' } },
      { name: 'sizeMinMm', label: 'Size from (mm)', type: 'number', required: true, read: (r) => Number(r.sizeMinMm) },
      { name: 'sizeMaxMm', label: 'Size to (mm)', type: 'number', required: true, read: (r) => Number(r.sizeMaxMm) },
      { name: 'ratePerCaratPaise', label: 'Rate per carat', type: 'money', required: true },
      { name: 'effectiveFrom', label: 'Effective from', type: 'date' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    defaults: { isActive: true },
    remove: { label: 'Deactivate', kind: 'deactivate' },
  },
  'margin-rules': {
    key: 'margin-rules',
    title: 'Margin rules',
    singular: 'Margin rule',
    api: '/admin/margin-rules',
    module: 'PRICING',
    description: 'The calculator uses the first active rule (lowest priority number) whose category and grade match; empty means any.',
    sortDefault: 'priority',
    columns: [
      { key: 'priority', label: 'Priority', sortable: true },
      { key: 'name', label: 'Rule', sortable: true },
      { key: 'grade', label: 'Grade', render: (r) => r.grade ?? 'Any' },
      { key: 'marginBp', label: 'Margin', render: (r) => `${r.marginBp / 100}%` },
      { key: 'minMarginPaise', label: 'Minimum', render: (r) => (r.minMarginPaise ? inr(r.minMarginPaise) : '—') },
      { key: 'isActive', label: 'Status', render: active },
    ],
    filters: [activeFilter],
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'categoryId', label: 'Category (empty = any)', type: 'ref', ref: { path: '/admin/categories' } },
      { name: 'grade', label: 'Grade (empty = any)' },
      { name: 'marginBp', label: 'Margin over cost', type: 'percent', required: true },
      { name: 'minMarginPaise', label: 'Minimum margin (optional)', type: 'money' },
      { name: 'priority', label: 'Priority (lower runs first)', type: 'number' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    defaults: { isActive: true, priority: 100 },
    remove: { label: 'Deactivate', kind: 'deactivate' },
  },
  'whatsapp-numbers': {
    key: 'whatsapp-numbers',
    title: 'WhatsApp numbers',
    singular: 'WhatsApp number',
    description: 'Numbers customers are sent to. Each city can have its own team number.',
    api: '/admin/whatsapp-numbers',
    module: 'WHATSAPP_SETTINGS',
    columns: [
      { key: 'label', label: 'Label' },
      { key: 'phone', label: 'Number' },
      { key: 'city', label: 'City', render: (r) => r.city?.name ?? 'Any' },
      { key: 'isDefault', label: 'Default', render: (r) => (r.isDefault ? 'Yes' : '') },
      { key: 'isActive', label: 'Status', render: active },
    ],
    fields: [
      { name: 'label', label: 'Label', required: true, placeholder: 'Pune team' },
      { name: 'phone', label: 'WhatsApp number', required: true, placeholder: '+91 98xxx xxxxx' },
      { name: 'cityId', label: 'City', type: 'ref', ref: cityRef },
      { name: 'isDefault', label: 'Default number', type: 'switch' },
    ],
    defaults: { isActive: true },
    remove: { label: 'Deactivate', kind: 'deactivate' },
    csv: false,
  },
  'routing-rules': {
    key: 'routing-rules',
    title: 'Routing rules',
    singular: 'Routing rule',
    description: 'Which number and team an enquiry goes to. Lowest priority number wins; city + type beats city beats type.',
    api: '/admin/routing-rules',
    module: 'WHATSAPP_SETTINGS',
    sortDefault: 'priority',
    columns: [
      { key: 'name', label: 'Rule' },
      { key: 'priority', label: 'Priority', sortable: true },
      { key: 'city', label: 'City', render: (r) => r.city?.name ?? 'Any' },
      { key: 'enquiryType', label: 'Type', render: (r) => r.enquiryType ?? 'Any' },
      { key: 'whatsAppNumber', label: 'Goes to', render: (r) => `${r.whatsAppNumber.label} (${r.whatsAppNumber.phone})` },
      { key: 'isActive', label: 'Status', render: active },
    ],
    fields: [
      { name: 'name', label: 'Rule name', required: true },
      { name: 'priority', label: 'Priority', type: 'number', hint: 'Lower runs first' },
      { name: 'cityId', label: 'City (empty = any)', type: 'ref', ref: cityRef },
      { name: 'enquiryType', label: 'Enquiry type (empty = any)', type: 'select', options: ['PRODUCT', 'CUSTOMIZED', 'BULK', 'RING_FINDER', 'CONTACT'].map((v) => ({ value: v, label: v })) },
      { name: 'whatsAppNumberId', label: 'WhatsApp number', type: 'ref', ref: { path: '/admin/whatsapp-numbers', label: 'label' }, required: true },
      { name: 'assignFranchiseId', label: 'Assign to franchise', type: 'ref', ref: { path: '/admin/franchises' } },
      { name: 'assignOwnerId', label: 'Assign to person', type: 'ref', ref: { path: '/admin/enquiries/meta/owners' } },
    ],
    defaults: { priority: 100, isActive: true },
    remove: { label: 'Deactivate', kind: 'deactivate' },
    csv: false,
  },
  'message-templates': {
    key: 'message-templates',
    title: 'Message templates',
    singular: 'Template',
    description: 'Text for WhatsApp, email, SMS and push. Use {{placeholders}} such as {{reference}}, {{productName}}, {{orderNumber}}.',
    api: '/admin/message-templates',
    module: 'WHATSAPP_SETTINGS',
    columns: [
      { key: 'key', label: 'Template', sortable: true },
      { key: 'channel', label: 'Channel' },
      { key: 'body', label: 'Text', render: (r) => <span className="block max-w-lg text-xs">{r.body}</span> },
      { key: 'isActive', label: 'Status', render: active },
    ],
    fields: [
      { name: 'key', label: 'Key', required: true, hint: 'e.g. ORDER_STATUS' },
      { name: 'channel', label: 'Channel', type: 'select', required: true, options: ['WHATSAPP', 'EMAIL', 'SMS', 'PUSH'].map((v) => ({ value: v, label: v })) },
      { name: 'subject', label: 'Subject (email / push title)' },
      { name: 'body', label: 'Text', type: 'textarea', required: true },
      { name: 'providerTemplateName', label: 'Approved WhatsApp template name', hint: 'Needed once WhatsApp Business API is approved.' },
    ],
    defaults: { channel: 'WHATSAPP', isActive: true },
    remove: { label: 'Deactivate', kind: 'deactivate' },
    csv: false,
  },
};

/**
 * When an outlet closes or stops selling (meeting of 19 Oct): one click moves every piece it holds to another
 * vendor, optionally taking on that vendor's cities too.
 */
function MovePieces({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [adopt, setAdopt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const vendors = useRefOptions({ path: '/admin/vendors' });
  if (!open)
    return (
      <button type="button" className="text-sm text-accent underline" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        Move pieces…
      </button>
    );
  return (
    <span className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <span className="text-xs text-muted">Move every piece of {vendorName} to</span>
      <select aria-label="Move pieces to" className="min-h-9 rounded-sm border border-line bg-surface px-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">Choose a vendor…</option>
        <option value="__own__">Own stock (no vendor)</option>
        {(vendors.data?.items ?? []).filter((v) => String(v.id) !== vendorId).map((v) => (
          <option key={String(v.id)} value={String(v.id)}>{String(v.name)}</option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={adopt} onChange={(e) => setAdopt(e.target.checked)} /> also move to its cities
      </label>
      <button
        type="button"
        disabled={!to || busy}
        className="min-h-9 rounded-sm bg-accent px-3 text-sm text-white disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setNote(null);
          try {
            const r = await api<{ moved: number }>('/admin/products/transfer', { method: 'POST', json: { fromVendorId: vendorId, toVendorId: to === '__own__' ? null : to, adoptCities: adopt && to !== '__own__' } });
            setNote(`${r.moved} pieces moved.`);
            setOpen(false);
            void qc.invalidateQueries({ queryKey: ['/admin/products'] });
          } catch (e) {
            setNote(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Moving…' : 'Move'}
      </button>
      <button type="button" className="text-xs text-muted underline" onClick={() => setOpen(false)}>cancel</button>
      {note && <span className="text-xs">{note}</span>}
    </span>
  );
}
