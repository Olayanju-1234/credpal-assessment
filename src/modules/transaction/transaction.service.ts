import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { ListTransactionsDto } from './dto/list-transactions.dto';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async list(userId: string, dto: ListTransactionsDto) {
    const page = parseInt(dto.page || '1', 10);
    const limit = Math.min(parseInt(dto.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const qb = this.txRepo
      .createQueryBuilder('tx')
      .where('tx.user_id = :userId', { userId })
      .orderBy('tx.created_at', 'DESC');

    if (dto.type) {
      qb.andWhere('tx.type = :type', { type: dto.type });
    }

    if (dto.currency) {
      qb.andWhere(
        '(tx.source_currency = :currency OR tx.target_currency = :currency)',
        { currency: dto.currency },
      );
    }

    if (dto.from_date) {
      qb.andWhere('tx.created_at >= :fromDate', {
        fromDate: new Date(dto.from_date),
      });
    }

    if (dto.to_date) {
      qb.andWhere('tx.created_at <= :toDate', {
        toDate: new Date(dto.to_date + 'T23:59:59.999Z'),
      });
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async listAll(dto: ListTransactionsDto) {
    const page = parseInt(dto.page || '1', 10);
    const limit = Math.min(parseInt(dto.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const qb = this.txRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.user', 'user')
      .orderBy('tx.created_at', 'DESC');

    if (dto.type) {
      qb.andWhere('tx.type = :type', { type: dto.type });
    }

    if (dto.currency) {
      qb.andWhere(
        '(tx.source_currency = :currency OR tx.target_currency = :currency)',
        { currency: dto.currency },
      );
    }

    if (dto.from_date) {
      qb.andWhere('tx.created_at >= :fromDate', {
        fromDate: new Date(dto.from_date),
      });
    }

    if (dto.to_date) {
      qb.andWhere('tx.created_at <= :toDate', {
        toDate: new Date(dto.to_date + 'T23:59:59.999Z'),
      });
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }
}
