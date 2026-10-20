/**
 * How close two Indian PIN codes are. PIN codes are laid out by geography: the first digit is the zone, the first
 * two the postal circle (roughly the state), the first three the sorting district. So a longer shared prefix means
 * nearer; within the same prefix, the smaller numeric gap is taken as nearer.
 */
export function pincodeCloseness(a: string, b: string): [prefix: number, gap: number] {
  const x = a.replace(/\D/g, '').slice(0, 6);
  const y = b.replace(/\D/g, '').slice(0, 6);
  let prefix = 0;
  while (prefix < Math.min(x.length, y.length) && x[prefix] === y[prefix]) prefix++;
  return [prefix, Math.abs(Number(x || 0) - Number(y || 0))];
}

/**
 * The vendor nearest a delivery PIN code: longest shared PIN prefix first, then a vendor serving the order's city,
 * then the smaller numeric gap. Vendors without a PIN code are skipped; null when none is left.
 */
export function pickNearestVendor<V extends { pincode: string | null; cityIds?: string[] }>(
  vendors: V[],
  pincode: string | null | undefined,
  cityId?: string | null,
): V | null {
  if (!pincode) return null;
  let best: { v: V; key: [number, number, number] } | null = null;
  for (const v of vendors) {
    if (!v.pincode) continue;
    const [prefix, gap] = pincodeCloseness(pincode, v.pincode);
    const key: [number, number, number] = [prefix, cityId && v.cityIds?.includes(cityId) ? 1 : 0, -gap];
    const better =
      !best ||
      key[0] > best.key[0] ||
      (key[0] === best.key[0] && (key[1] > best.key[1] || (key[1] === best.key[1] && key[2] > best.key[2])));
    if (better) best = { v, key };
  }
  return best?.v ?? null;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Straight-line distance between two points on the earth, in km (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The vendor nearest a delivery address by distance in km, when the address and the vendors can be placed on the
 * map (from their PIN codes). Vendors that cannot be placed are left out; when nothing can be placed it falls back to
 * the PIN-code rule above. The caller passes only active vendors, so a vendor switched off is skipped and the order
 * goes to the next nearest.
 */
export function pickNearestVendorByDistance<V extends { pincode: string | null; cityIds?: string[]; point?: LatLng | null }>(
  vendors: V[],
  to: { pincode: string | null | undefined; point?: LatLng | null; cityId?: string | null },
): { vendor: V; km: number | null } | null {
  const placed = to.point ? vendors.filter((v) => v.point) : [];
  if (to.point && placed.length) {
    let best: { vendor: V; km: number } | null = null;
    for (const v of placed) {
      const km = distanceKm(to.point, v.point!);
      // Within 1 km counts as a tie; then a vendor that serves the order's city wins.
      const serves = !!to.cityId && !!v.cityIds?.includes(to.cityId);
      if (
        !best ||
        km < best.km - 1 ||
        (Math.abs(km - best.km) <= 1 && serves && !(to.cityId && best.vendor.cityIds?.includes(to.cityId)))
      )
        best = { vendor: v, km };
    }
    return best ? { vendor: best.vendor, km: Math.round(best.km * 10) / 10 } : null;
  }
  const v = pickNearestVendor(vendors, to.pincode, to.cityId);
  return v ? { vendor: v, km: null } : null;
}
