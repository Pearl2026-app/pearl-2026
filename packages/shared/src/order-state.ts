// Order status state machine, shared by the API (enforcement) and interfaces (which buttons to show).
import type { OrderStatus, Role } from './enums';

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['CONFIRMED', 'CANCELLED', 'FAILED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'PACKED', 'CANCELLED'],
  PICKED_UP: ['OUT_FOR_DELIVERY', 'FAILED', 'RETURNED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED', 'RETURNED'],
  FAILED: ['ASSIGNED', 'RETURNED', 'CANCELLED'],
  DELIVERED: ['RETURNED'],
  RETURNED: ['REFUNDED'],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
};

/** Transitions each partner role may make. Admin roles may make any valid transition. */
const ROLE_TRANSITIONS: Partial<Record<Role, Array<[OrderStatus, OrderStatus]>>> = {
  // The vendor an order is sent to confirms, packs and hands it to one of its delivery partners.
  VENDOR: [
    ['PLACED', 'CONFIRMED'],
    ['CONFIRMED', 'PACKED'],
    ['PACKED', 'ASSIGNED'],
    ['FAILED', 'ASSIGNED'],
  ],
  FRANCHISE: [
    ['PLACED', 'CONFIRMED'],
    ['CONFIRMED', 'PACKED'],
    ['PACKED', 'ASSIGNED'],
    ['FAILED', 'ASSIGNED'],
  ],
  DELIVERY_PARTNER: [
    ['ASSIGNED', 'PICKED_UP'],
    ['PICKED_UP', 'OUT_FOR_DELIVERY'],
    ['PICKED_UP', 'FAILED'],
    ['PICKED_UP', 'RETURNED'],
    ['OUT_FOR_DELIVERY', 'DELIVERED'],
    ['OUT_FOR_DELIVERY', 'FAILED'],
    ['OUT_FOR_DELIVERY', 'RETURNED'],
  ],
};

const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER'];

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransition(role: Role, from: OrderStatus, to: OrderStatus): boolean {
  if (!isValidTransition(from, to)) return false;
  if (ADMIN_ROLES.includes(role)) return true;
  return ROLE_TRANSITIONS[role]?.some(([f, t]) => f === from && t === to) ?? false;
}

export function nextStatuses(role: Role, from: OrderStatus): OrderStatus[] {
  return ORDER_TRANSITIONS[from].filter((to) => canTransition(role, from, to));
}

/** Statuses that need a written reason. */
export const REASON_REQUIRED: OrderStatus[] = ['FAILED', 'RETURNED', 'CANCELLED'];

/** Orders in these statuses count as "completed" / "cancelled" / "pending" on the dashboard. */
export const COMPLETED_STATUSES: OrderStatus[] = ['DELIVERED'];
export const CANCELLED_STATUSES: OrderStatus[] = ['CANCELLED', 'FAILED', 'RETURNED', 'REFUNDED'];
export const PENDING_STATUSES: OrderStatus[] = [
  'PLACED',
  'CONFIRMED',
  'PACKED',
  'ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
];
