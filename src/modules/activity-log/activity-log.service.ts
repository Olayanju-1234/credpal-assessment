import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityLog } from './entities/activity-log.entity';

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityLogRepo: Repository<ActivityLog>,
  ) {}

  async log(data: {
    userId: string | null;
    method: string;
    path: string;
    statusCode: number;
    ipAddress: string | null;
    userAgent: string | null;
    responseTimeMs: number | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      const entry = this.activityLogRepo.create({
        user_id: data.userId,
        method: data.method,
        path: data.path,
        status_code: data.statusCode,
        ip_address: data.ipAddress,
        user_agent: data.userAgent,
        response_time_ms: data.responseTimeMs,
        metadata: data.metadata ?? null,
      });
      await this.activityLogRepo.save(entry);
    } catch (error) {
      // Never let audit logging break the request
      this.logger.error(
        `Failed to write activity log: ${JSON.stringify({ error: (error as Error).message, path: data.path })}`,
      );
    }
  }
}
