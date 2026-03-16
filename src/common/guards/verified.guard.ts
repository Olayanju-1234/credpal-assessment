import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

interface RequestWithUser {
  user: { email_verified_at: Date | null };
}

@Injectable()
export class VerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user?.email_verified_at) {
      throw new ForbiddenException('Email verification required');
    }
    return true;
  }
}
