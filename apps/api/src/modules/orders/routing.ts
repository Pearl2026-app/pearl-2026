import { lookupPincode } from 'india-post-pincode';
import { pickNearestVendorByDistance, type LatLng } from '@sahyadri/shared';
import type { PrismaService } from '../../prisma/prisma.service';

/** Where a PIN code is on the map (India Post data, about 19,500 PIN codes), or null when unknown. */
export function pincodePoint(pincode: string | null | undefined): LatLng | null {
  if (!pincode) return null;
  const r = lookupPincode(pincode.replace(/\D/g, '').slice(0, 6));
  const lat = r?.latitude;
  const lng = r?.longitude;
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
    ? { lat, lng }
    : null;
}

/** District and state for a PIN code, for showing the customer where we think they are. */
export function pincodePlace(pincode: string): { district: string; state: string } | null {
  const r = lookupPincode(pincode.replace(/\D/g, '').slice(0, 6));
  return r ? { district: r.district, state: r.state } : null;
}

/**
 * The active vendor nearest a delivery PIN code, by distance in km (straight line between the PIN codes); vendors
 * switched off are skipped, so the order goes to the next nearest. Falls back to the PIN-prefix rule when a PIN code
 * cannot be placed. Null when no vendor has a PIN code.
 */
export async function nearestVendor(
  prisma: Pick<PrismaService, 'vendor'>,
  pincode: string | null | undefined,
  cityId: string | null,
): Promise<{ id: string; name: string; km: number | null } | null> {
  if (!pincode) return null;
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true, pincode: { not: null } },
    select: { id: true, name: true, pincode: true, cities: { select: { cityId: true } } },
  });
  const r = pickNearestVendorByDistance(
    vendors.map((x) => ({ ...x, cityIds: x.cities.map((c) => c.cityId), point: pincodePoint(x.pincode) })),
    { pincode, point: pincodePoint(pincode), cityId },
  );
  return r ? { id: r.vendor.id, name: r.vendor.name, km: r.km } : null;
}
