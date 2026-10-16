import { pickNearestVendor } from '@sahyadri/shared';
import type { PrismaService } from '../../prisma/prisma.service';

/** The active vendor nearest a delivery PIN code (rule in @sahyadri/shared), or null when no vendor has a PIN code. */
export async function nearestVendor(
  prisma: Pick<PrismaService, 'vendor'>,
  pincode: string | null | undefined,
  cityId: string | null,
): Promise<{ id: string; name: string } | null> {
  if (!pincode) return null;
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true, pincode: { not: null } },
    select: { id: true, name: true, pincode: true, cities: { select: { cityId: true } } },
  });
  const v = pickNearestVendor(
    vendors.map((x) => ({ ...x, cityIds: x.cities.map((c) => c.cityId) })),
    pincode,
    cityId,
  );
  return v ? { id: v.id, name: v.name } : null;
}
