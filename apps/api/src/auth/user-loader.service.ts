import { Injectable } from '@nestjs/common';
import type { Module as PermModule } from '@sahyadri/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/context';

@Injectable()
export class UserLoader {
  constructor(private readonly prisma: PrismaService) {}

  /** Load the user for a session. Returns null when the user or session is no longer valid. */
  async load(userId: string, sessionId: string | null): Promise<AuthUser | null> {
    const [user, session] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { permissions: true, customer: { select: { id: true, isBlocked: true, archivedAt: true } } },
      }),
      sessionId ? this.prisma.authSession.findUnique({ where: { id: sessionId }, select: { revokedAt: true, expiresAt: true } }) : null,
    ]);
    if (!user || !user.isActive) return null;
    if (sessionId && (!session || session.revokedAt || session.expiresAt < new Date())) return null;
    if (user.customer && (user.customer.isBlocked || user.customer.archivedAt)) return null;
    return toAuthUser(user, sessionId);
  }
}

export function toAuthUser(
  user: {
    id: string;
    role: AuthUser['role'];
    name: string;
    email: string | null;
    phone: string | null;
    state?: string | null;
    cityId: string | null;
    vendorId: string | null;
    franchiseId: string | null;
    deliveryPartnerId: string | null;
    manufacturerId?: string | null;
    farmId?: string | null;
    permissions?: Array<{ module: string; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>;
    customer?: { id: string } | null;
  },
  sessionId: string | null,
): AuthUser {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.phone,
    state: user.state ?? null,
    cityId: user.cityId,
    vendorId: user.vendorId,
    franchiseId: user.franchiseId,
    deliveryPartnerId: user.deliveryPartnerId,
    manufacturerId: user.manufacturerId ?? null,
    farmId: user.farmId ?? null,
    customerId: user.customer?.id ?? null,
    sessionId,
    grants: (user.permissions ?? []).map((p) => ({
      module: p.module as PermModule,
      canView: p.canView,
      canCreate: p.canCreate,
      canEdit: p.canEdit,
      canDelete: p.canDelete,
    })),
  };
}
