import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ActivityLogService } from '../../modules/activity-log/activity-log.service';

interface RequestWithUser {
  method: string;
  url: string;
  ip: string;
  headers: Record<string, string | undefined>;
  user?: { sub: string };
}

interface ResponseWithStatusCode {
  statusCode: number;
}

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(private readonly activityLogService: ActivityLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context
            .switchToHttp()
            .getResponse<ResponseWithStatusCode>();
          void this.activityLogService.log({
            userId: request.user?.sub ?? null,
            method: request.method,
            path: request.url,
            statusCode: response.statusCode,
            ipAddress: request.ip ?? null,
            userAgent: request.headers['user-agent'] ?? null,
            responseTimeMs: Date.now() - start,
          });
        },
        error: (error: { status?: number; getStatus?: () => number }) => {
          const statusCode =
            typeof error.getStatus === 'function' ? error.getStatus() : 500;
          void this.activityLogService.log({
            userId: request.user?.sub ?? null,
            method: request.method,
            path: request.url,
            statusCode,
            ipAddress: request.ip ?? null,
            userAgent: request.headers['user-agent'] ?? null,
            responseTimeMs: Date.now() - start,
            metadata: { error: true },
          });
        },
      }),
    );
  }
}
