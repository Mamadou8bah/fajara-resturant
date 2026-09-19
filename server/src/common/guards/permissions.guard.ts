import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, Role } from '../../shared';
import {
  AuthUser,
  PERMISSIONS_KEY,
  ROLES_KEY,
} from '../decorators/auth.decorators';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (
      (!permissions || permissions.length === 0) &&
      (!roles || roles.length === 0)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    if (permissions?.length) {
      const granted = await this.settings.permissionsForRole(user.role);
      const ok = permissions.some((p) => granted.includes(p));
      if (!ok) throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
