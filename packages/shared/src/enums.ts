// Mirrors of the database enums, so web, admin and the apps can use them without Prisma.
// Keep in sync with packages/db/prisma/schema.prisma (a test checks this).

const e = <T extends string>(...values: T[]) => Object.freeze(Object.fromEntries(values.map((v) => [v, v])) as { [K in T]: K });

export const Role = e('SUPER_ADMIN', 'STAFF', 'CITY_MANAGER', 'VENDOR', 'FRANCHISE', 'DELIVERY_PARTNER', 'CUSTOMER', 'MANUFACTURER', 'FARMER');
export type Role = keyof typeof Role;

export const ProductStatus = e('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');
export type ProductStatus = keyof typeof ProductStatus;

export const StockType = e('UNIQUE', 'QUANTITY');
export type StockType = keyof typeof StockType;

export const OrderSource = e('CHECKOUT', 'ENQUIRY', 'MANUAL');
export type OrderSource = keyof typeof OrderSource;

export const OrderType = e('STANDARD', 'CUSTOMIZED');
export type OrderType = keyof typeof OrderType;

export const OrderStatus = e(
  'PLACED',
  'CONFIRMED',
  'PACKED',
  'ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
  'RETURNED',
  'REFUNDED',
);
export type OrderStatus = keyof typeof OrderStatus;

export const PaymentStatus = e('PENDING', 'PAID', 'COD_PENDING', 'COD_COLLECTED', 'FAILED', 'REFUNDED');
export type PaymentStatus = keyof typeof PaymentStatus;

export const PaymentMethod = e('ONLINE', 'COD', 'BANK_TRANSFER', 'OTHER');
export type PaymentMethod = keyof typeof PaymentMethod;

export const DeliveryStatus = e('ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED');
export type DeliveryStatus = keyof typeof DeliveryStatus;

export const ProductionStage = e(
  'REQUIREMENT',
  'QUOTED',
  'ADVANCE_PAID',
  'PO_RAISED',
  'IN_MANUFACTURING',
  'QUALITY_CHECK',
  'READY',
  'DISPATCHED',
  'DELIVERED',
);
export type ProductionStage = keyof typeof ProductionStage;

export const PurchaseOrderStatus = e('DRAFT', 'SENT', 'ACCEPTED', 'IN_PRODUCTION', 'RECEIVED', 'CLOSED');
export type PurchaseOrderStatus = keyof typeof PurchaseOrderStatus;

export const EnquiryType = e('PRODUCT', 'CUSTOMIZED', 'BULK', 'RING_FINDER', 'CONTACT', 'CONSULTATION');
export type EnquiryType = keyof typeof EnquiryType;

export const EnquiryStage = e('NEW', 'IN_PROGRESS', 'QUOTED', 'CONVERTED', 'CLOSED');
export type EnquiryStage = keyof typeof EnquiryStage;

export const ReturnType = e('RETURN', 'CANCELLATION');
export type ReturnType = keyof typeof ReturnType;

export const ReturnStatus = e(
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'PICKUP_SCHEDULED',
  'PICKED_UP',
  'RECEIVED',
  'REFUNDED',
  'CLOSED',
);
export type ReturnStatus = keyof typeof ReturnStatus;

export const ReviewStatus = e('PENDING', 'APPROVED', 'REJECTED');
export type ReviewStatus = keyof typeof ReviewStatus;

export const DiscountType = e('PERCENT', 'FLAT');
export type DiscountType = keyof typeof DiscountType;

export const NotificationChannel = e('PUSH', 'WHATSAPP', 'EMAIL', 'SMS');
export type NotificationChannel = keyof typeof NotificationChannel;

export const FeatureFlagKey = e(
  'vendor_commissions',
  'live_gps',
  'multi_currency',
  'loyalty_points',
  'pearl_rate_feed',
  'ai_ring_finder',
);
export type FeatureFlagKey = keyof typeof FeatureFlagKey;

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: 'Placed',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  ASSIGNED: 'Assigned',
  PICKED_UP: 'Picked Up',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
  RETURNED: 'Returned',
  REFUNDED: 'Refunded',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  COD_PENDING: 'COD Pending',
  COD_COLLECTED: 'COD Collected',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
};

export const PRODUCTION_STAGE_LABEL: Record<ProductionStage, string> = {
  REQUIREMENT: 'Requirement',
  QUOTED: 'Quoted',
  ADVANCE_PAID: 'Advance Paid',
  PO_RAISED: 'PO Raised',
  IN_MANUFACTURING: 'In Manufacturing',
  QUALITY_CHECK: 'Quality Check',
  READY: 'Ready',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
};

export const ENQUIRY_TYPE_LABEL: Record<EnquiryType, string> = {
  PRODUCT: 'Product',
  CUSTOMIZED: 'Customized',
  BULK: 'Bulk / B2B',
  RING_FINDER: 'Ring Finder',
  CONTACT: 'Contact',
  CONSULTATION: 'Consultation',
};

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  STAFF: 'Admin / Staff',
  CITY_MANAGER: 'City Manager',
  VENDOR: 'Vendor',
  FRANCHISE: 'Franchise',
  DELIVERY_PARTNER: 'Delivery Partner',
  CUSTOMER: 'Customer',
  MANUFACTURER: 'Manufacturer',
  FARMER: 'Farm partner',
};
