import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../../shared';
import { AuthUser, IS_PUBLIC_KEY } from '../decorators/auth.decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice(7);
    let payload: { sub: string; role: Role; fullName: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.prisma.employeeSession.findFirst({
      where: {
        id: payload.sid,
        employeeId: payload.sub,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { employee: true },
    });

    if (!session || !session.employee.isActive || session.employee.archivedAt) {
      throw new UnauthorizedException('Session revoked or employee inactive');
    }

    await this.prisma.employeeSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    request.user = {
      id: session.employee.id,
      role: session.employee.role as Role,
      fullName: session.employee.fullName,
      sessionId: session.id,
    };
    return true;
  }
}
