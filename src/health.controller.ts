import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus';
import Redis from 'ioredis';

@Controller('health')
@ApiTags('Health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check endpoint (database + Redis)' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database'),
      async () => {
        const result = await this.redis.ping();
        if (result !== 'PONG') {
          throw new ServiceUnavailableException('Redis is not responding');
        }
        return { redis: { status: 'up' } };
      },
    ]);
  }
}
