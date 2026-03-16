import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { DataSource } from 'typeorm';
import { Transaction } from '../../modules/transaction/entities/transaction.entity';

interface IdempotencyRequest {
  headers: Record<string, string | undefined>;
  idempotencyKey?: string;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly dataSource: DataSource) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<IdempotencyRequest>();
    const key = request.headers['x-idempotency-key'];

    if (!key) {
      throw new BadRequestException('X-Idempotency-Key header is required');
    }

    const existing = await this.dataSource.getRepository(Transaction).findOne({
      where: { idempotency_key: key },
    });

    if (existing) {
      throw new ConflictException({
        message: 'Request already processed',
        transaction_id: existing.id,
      });
    }

    request.idempotencyKey = key;
    return next.handle();
  }
}
