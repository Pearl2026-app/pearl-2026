import { Module } from '@nestjs/common';
import { z } from 'zod';
import { email, phoneE164, slug, slugify, paise } from '@sahyadri/shared';
import { cityLinks, crudController } from '../../common/crud';
import { forbidden } from '../../common/errors';
import type { AuthUser } from '../../common/context';

const optStr = (max = 200) => z.string().trim().max(max).optional().nullable();
const cityIds = z.array(z.string().min(1)).max(100).optional();

// ── Cities ─────────────────────────────────────────────────────
const cityCreate = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: slug.optional(),
    state: z.string().trim().min(2).max(80),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    deliveryChargePaise: paise.optional().nullable(),
  })
  .transform((v) => ({ ...v, slug: v.slug ?? slugify(v.name) }));
const cityUpdate = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  slug: slug.optional(),
  state: z.string().trim().min(2).max(80).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  deliveryChargePaise: paise.optional().nullable(),
});
const cityOnly = (u: AuthUser) => (u.role === 'CITY_MANAGER' ? { id: u.cityId ?? '__none__' } : {});

export const CitiesController = crudController({
  path: 'cities',
  tag: 'network',
  model: 'city',
  entity: 'City',
  module: 'CITIES',
  create: cityCreate,
  update: cityUpdate,
  searchFields: ['name', 'state'],
  sortFields: ['name', 'sortOrder', 'createdAt'],
  defaultSort: { sortOrder: 'asc' },
  filters: { isActive: 'boolean' },
  remove: 'deactivate',
  scope: cityOnly,
});

// ── Vendors ────────────────────────────────────────────────────
const vendorBase = {
  name: z.string().trim().min(2).max(120),
  contactName: optStr(120),
  phone: phoneE164,
  email: email.optional().nullable(),
  address: optStr(300),
  gstin: z.string().trim().regex(/^[0-9A-Z]{15}$/, 'GSTIN is 15 letters and digits').optional().nullable(),
  isActive: z.boolean().optional(),
  cityIds,
};
const inCity = (u: AuthUser) => (u.role === 'CITY_MANAGER' ? { cities: { some: { cityId: u.cityId ?? '__none__' } } } : {});
const vendorData = ({ cityIds: ids, ...rest }: any, mode: 'create' | 'update') => ({ ...rest, ...cityLinks('cities', ids, mode) });

export const VendorsController = crudController({
  path: 'vendors',
  tag: 'network',
  model: 'vendor',
  entity: 'Vendor',
  module: 'VENDORS',
  create: z.object(vendorBase),
  update: z.object(vendorBase).partial(),
  searchFields: ['name', 'contactName', 'phone', 'email'],
  sortFields: ['name', 'createdAt'],
  defaultSort: { name: 'asc' },
  filters: { isActive: 'boolean' },
  include: { cities: { include: { city: { select: { id: true, name: true } } } }, _count: { select: { products: true, orders: true } } },
  remove: 'deactivate',
  scope: (u) => (u.role === 'VENDOR' ? { id: u.vendorId ?? '__none__' } : inCity(u)),
  toData: vendorData,
});

// ── Franchises ─────────────────────────────────────────────────
const franchiseBase = {
  name: z.string().trim().min(2).max(120),
  cityId: z.string().min(1),
  area: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(300),
  contactName: optStr(120),
  phone: phoneE164,
  email: email.optional().nullable(),
  isActive: z.boolean().optional(),
  showInStoreList: z.boolean().optional(),
  openingHours: optStr(200),
  mapUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal('').transform(() => null)),
  cityIds,
};
export const FranchisesController = crudController({
  path: 'franchises',
  tag: 'network',
  model: 'franchise',
  entity: 'Franchise',
  module: 'FRANCHISES',
  create: z.object(franchiseBase),
  update: z.object(franchiseBase).partial(),
  searchFields: ['name', 'area', 'contactName', 'phone'],
  sortFields: ['name', 'createdAt', 'area'],
  defaultSort: { name: 'asc' },
  filters: { isActive: 'boolean', cityId: 'string' },
  include: {
    city: { select: { id: true, name: true } },
    cities: { include: { city: { select: { id: true, name: true } } } },
    _count: { select: { orders: true, enquiries: true } },
  },
  remove: 'deactivate',
  scope: (u) =>
    u.role === 'FRANCHISE' ? { id: u.franchiseId ?? '__none__' } : u.role === 'CITY_MANAGER' ? { cityId: u.cityId ?? '__none__' } : {},
  toData: vendorData,
});

// ── Manufacturers ──────────────────────────────────────────────
const manufacturerBase = {
  name: z.string().trim().min(2).max(120),
  contactName: optStr(120),
  phone: phoneE164.optional().nullable(),
  email: email.optional().nullable(),
  cityId: z.string().optional().nullable(),
  speciality: optStr(200),
  isActive: z.boolean().optional(),
};
export const ManufacturersController = crudController({
  path: 'manufacturers',
  tag: 'network',
  model: 'manufacturer',
  entity: 'Manufacturer',
  module: 'MANUFACTURERS',
  // City managers see their own city's manufacturers (and those not tied to a city).
  scope: (u) => (u.role === 'CITY_MANAGER' ? { OR: [{ cityId: u.cityId ?? '__none__' }, { cityId: null }] } : {}),
  create: z.object(manufacturerBase),
  update: z.object(manufacturerBase).partial(),
  searchFields: ['name', 'contactName', 'speciality', 'phone'],
  sortFields: ['name', 'createdAt'],
  defaultSort: { name: 'asc' },
  filters: { isActive: 'boolean', cityId: 'string' },
  include: { city: { select: { id: true, name: true } }, _count: { select: { purchaseOrders: true } } },
  remove: 'deactivate',
});

// ── Delivery partners ──────────────────────────────────────────
const dpBase = {
  name: z.string().trim().min(2).max(120),
  phone: phoneE164,
  vehicleInfo: optStr(120),
  isActive: z.boolean().optional(),
  cityIds,
};
export const DeliveryPartnersController = crudController({
  path: 'delivery-partners',
  tag: 'network',
  model: 'deliveryPartner',
  entity: 'DeliveryPartner',
  module: 'DELIVERY_PARTNERS',
  create: z.object(dpBase),
  update: z.object(dpBase).partial(),
  searchFields: ['name', 'phone'],
  sortFields: ['name', 'createdAt'],
  defaultSort: { name: 'asc' },
  filters: { isActive: 'boolean' },
  include: {
    cities: { include: { city: { select: { id: true, name: true } } } },
    user: { select: { id: true, isActive: true } },
    _count: { select: { deliveries: true } },
  },
  remove: 'deactivate',
  scope: (u) =>
    u.role === 'CITY_MANAGER' || u.role === 'FRANCHISE'
      ? { cities: { some: { cityId: u.cityId ?? '__none__' } } }
      : u.role === 'DELIVERY_PARTNER'
        ? { id: u.deliveryPartnerId ?? '__none__' }
        : {},
  toData: vendorData,
  checkWrite: (u, data) => {
    // A city manager may edit their partners' details but not move them to other cities.
    if (u.role === 'CITY_MANAGER' && 'cities' in data && !Array.isArray(data.cities)) throw forbidden('Only head office can change partner cities.');
  },
});

@Module({
  controllers: [CitiesController, VendorsController, FranchisesController, ManufacturersController, DeliveryPartnersController],
})
export class NetworkModule {}
