import { humanize } from './format';

export const STAGES = ['REQUIREMENT', 'QUOTED', 'ADVANCE_PAID', 'PO_RAISED', 'IN_MANUFACTURING', 'QUALITY_CHECK', 'READY', 'DISPATCHED', 'DELIVERED'] as const;
export const PO_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'IN_PRODUCTION', 'RECEIVED', 'CLOSED'] as const;
export const PO_NEXT: Record<string, string[]> = { DRAFT: ['SENT', 'CLOSED'], SENT: ['ACCEPTED', 'CLOSED'], ACCEPTED: ['IN_PRODUCTION', 'CLOSED'], IN_PRODUCTION: ['RECEIVED'], RECEIVED: ['CLOSED'], CLOSED: [] };
/** The manufacturer's daily work stages (client document, 26 Oct). */
export const PO_STAGES = ['Receiving PO', 'Casting', 'Filling and Finishing', 'Rhodium', 'Pearl Setting', 'Metal Hallmark', 'Ready for Pickup'] as const;
export const stageLabel = (s: string) => (s === 'PO_RAISED' ? 'PO raised' : humanize(s));
