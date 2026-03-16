import {
  Injectable,
  Logger,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import fxConfig from '../../config/fx.config';
import { FxClientService } from './fx-client.service';
import { FxRateSnapshot } from './entities/fx-rate-snapshot.entity';
import { Currency } from '../../common/enums';

export interface RateResult {
  rate: string;
  source: 'cache' | 'api' | 'fallback_db';
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number | null;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: null,
    state: 'CLOSED',
  };

  constructor(
    private readonly fxClient: FxClientService,
    @InjectRepository(FxRateSnapshot)
    private readonly snapshotRepo: Repository<FxRateSnapshot>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    @Inject(fxConfig.KEY)
    private readonly config: {
      apiUrl: string;
      apiKey: string;
      cacheTtlSeconds: number;
      spreadPercent: string;
    },
  ) {}

  async getRate(base: Currency, target: Currency): Promise<RateResult> {
    // 1. Check Redis cache
    const cacheKey = `fx:${base}:${target}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return { rate: cached, source: 'cache' };
    }

    // 2. Check circuit breaker
    if (this.isCircuitOpen()) {
      this.logger.warn(
        `Circuit breaker OPEN — skipping API call for ${base}/${target}`,
      );
      return this.fallbackToDb(base, target);
    }

    // 3. Call external API
    try {
      const rate = await this.fxClient.fetchRate(base, target);
      this.resetCircuit();

      // Cache in Redis
      await this.redis.set(cacheKey, rate, 'EX', this.config.cacheTtlSeconds);

      // Persist snapshot for audit + fallback
      await this.snapshotRepo.save({
        base_currency: base,
        target_currency: target,
        rate,
        provider: this.fxClient.providerName,
      });

      return { rate, source: 'api' };
    } catch (error) {
      this.recordFailure();
      this.logger.error(
        `FX API failed: ${JSON.stringify({ base, target, error: (error as Error).message })}`,
      );
      return this.fallbackToDb(base, target);
    }
  }

  async getRates(
    base: Currency,
    targets: Currency[],
  ): Promise<Record<string, RateResult>> {
    const results: Record<string, RateResult> = {};
    await Promise.all(
      targets.map(async (target) => {
        if (target === base) return;
        results[target] = await this.getRate(base, target);
      }),
    );
    return results;
  }

  private async fallbackToDb(
    base: Currency,
    target: Currency,
  ): Promise<RateResult> {
    const snapshot = await this.snapshotRepo.findOne({
      where: { base_currency: base, target_currency: target },
      order: { created_at: 'DESC' },
    });

    if (!snapshot) {
      throw new ServiceUnavailableException(
        `FX rates unavailable for ${base}/${target}`,
      );
    }

    this.logger.warn(
      `Using DB fallback rate for ${base}/${target}: ${snapshot.rate}`,
    );
    return { rate: snapshot.rate, source: 'fallback_db' };
  }

  private isCircuitOpen(): boolean {
    if (this.circuitBreaker.state === 'CLOSED') return false;

    if (this.circuitBreaker.state === 'OPEN') {
      const elapsed = Date.now() - (this.circuitBreaker.lastFailure || 0);
      if (elapsed > 30_000) {
        this.circuitBreaker.state = 'HALF_OPEN';
        this.logger.log('Circuit breaker moved to HALF_OPEN');
        return false;
      }
      return true;
    }

    // HALF_OPEN: allow one attempt
    return false;
  }

  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();
    if (this.circuitBreaker.failures >= 3) {
      this.circuitBreaker.state = 'OPEN';
      this.logger.warn('Circuit breaker OPENED after 3 consecutive failures');
    }
  }

  private resetCircuit(): void {
    if (this.circuitBreaker.state !== 'CLOSED') {
      this.logger.log('Circuit breaker CLOSED — API recovered');
    }
    this.circuitBreaker = { failures: 0, lastFailure: null, state: 'CLOSED' };
  }
}
