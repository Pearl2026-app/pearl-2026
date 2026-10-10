import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Action, Module } from '@sahyadri/shared';
import type { Role } from '@sahyadri/shared';
import type { AuthUser } from './context';

export const IS_PUBLIC = 'isPublic';
/** No authentication needed (an optional user is still attached when a token is sent). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const REQUIRES = 'requires';
/** Route needs `action` on `module` (see packages/shared permissions). */
export const Requires = (module: Module, action: Action) => SetMetadata(REQUIRES, { module, action });

export const ROLES = 'roles';
/** Route is only for these roles (used for customer and delivery endpoints). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | null => {
  return ctx.switchToHttp().getRequest().user ?? null;
});
