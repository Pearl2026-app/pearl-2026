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
