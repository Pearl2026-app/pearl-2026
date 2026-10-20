import { lookupPincode } from 'india-post-pincode';
import { distanceKm, pickNearestVendorByDistance, type LatLng } from '@sahyadri/shared';
import type { PrismaService } from '../../prisma/prisma.service';

const raw = (pin: string): LatLng | null => {
  const r = lookupPincode(pin);
  const lat = r?.latitude;
  const lng = r?.longitude;
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/** The middle of a sorting district (the PIN codes sharing the first three digits), cached. */
const districtCentres = new Map<string, LatLng | null>();
function districtCentre(prefix: string): LatLng | null {
  if (districtCentres.has(prefix)) return districtCentres.get(prefix)!;
  const pts: LatLng[] = [];
  for (let i = 0; i < 1000; i++) {
    const p = raw(prefix + String(i).padStart(3, '0'));
    if (p) pts.push(p);
  }
  const c = pts.length ? { lat: median(pts.map((p) => p.lat)), lng: median(pts.map((p) => p.lng)) } : null;
  districtCentres.set(prefix, c);
  return c;
}

/**
 * Where a PIN code is on the map (India Post data, about 19,500 PIN codes), or null when unknown. Some India Post
 * coordinates are far off (a Delhi PIN placed 90 km south), so a point more than 40 km from the middle of its
 * sorting district is replaced by that middle.
 */
export function pincodePoint(pincode: string | null | undefined): LatLng | null {
  if (!pincode) return null;
  const pin = pincode.replace(/\D/g, '').slice(0, 6);
  if (pin.length !== 6) return null;
  const p = raw(pin);
  const centre = districtCentre(pin.slice(0, 3));
  if (!p) return centre;
  return centre && distanceKm(p, centre) > 40 ? centre : p;
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
