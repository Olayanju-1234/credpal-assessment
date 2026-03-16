import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import {
  Currency,
  TransactionType,
  TransactionStatus,
} from '../../common/enums';
import { FxService } from '../fx/fx.service';
import * as decimal from '../../common/utils/decimal.util';
import { orderedCurrencyPair } from '../../common/utils/lock-order.util';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    private readonly dataSource: DataSource,
    private readonly fxService: FxService,
  ) {}

  async createWallet(userId: string, currency: Currency): Promise<Wallet> {
    const wallet = this.walletRepo.create({
      user_id: userId,
      currency,
      balance: '0.0000',
    });
    return this.walletRepo.save(wallet);
  }

  async getWallets(userId: string): Promise<Wallet[]> {
    return this.walletRepo.find({
      where: { user_id: userId },
      order: { currency: 'ASC' },
    });
  }

  async fundWallet(
    userId: string,
    currency: Currency,
    amount: string,
    idempotencyKey: string,
  ) {
    if (!decimal.isPositive(amount)) {
      throw new BadRequestException('Amount must be positive');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock wallet row (auto-create if needed)
      const wallet = await this.lockOrCreateWallet(
        queryRunner,
        userId,
        currency,
      );

      const newBalance = decimal.add(wallet.balance, amount);

      await queryRunner.manager.update(Wallet, wallet.id, {
        balance: newBalance,
      });

      const transaction = queryRunner.manager.create(Transaction, {
        user_id: userId,
        type: TransactionType.FUNDING,
        status: TransactionStatus.COMPLETED,
        source_currency: currency,
        source_amount: amount,
        idempotency_key: idempotencyKey,
        metadata: { action: 'fund' },
      });
      const savedTx = await queryRunner.manager.save(Transaction, transaction);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Wallet funded: ${JSON.stringify({ userId, currency, amount, newBalance })}`,
      );

      return {
        transaction_id: savedTx.id,
        wallet_id: wallet.id,
        currency,
        amount,
        new_balance: newBalance,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async convertCurrency(
    userId: string,
    fromCurrency: Currency,
    toCurrency: Currency,
    amount: string,
    idempotencyKey: string,
  ) {
    if (fromCurrency === toCurrency) {
      throw new BadRequestException('Source and target currencies must differ');
    }
    if (!decimal.isPositive(amount)) {
      throw new BadRequestException('Amount must be positive');
    }

    // Fetch rate BEFORE starting the transaction (don't hold locks while calling external APIs)
    const rateResult = await this.fxService.getRate(fromCurrency, toCurrency);
    const convertedAmount = decimal.multiplyRate(amount, rateResult.rate);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock wallets in alphabetical order to prevent deadlocks
      const [first, second] = orderedCurrencyPair(fromCurrency, toCurrency);

      const firstWallet = await this.lockOrCreateWallet(
        queryRunner,
        userId,
        first,
      );
      const secondWallet = await this.lockOrCreateWallet(
        queryRunner,
        userId,
        second,
      );

      // Identify source and target from the locked wallets
      const sourceWallet =
        firstWallet.currency === String(fromCurrency)
          ? firstWallet
          : secondWallet;
      const targetWallet =
        firstWallet.currency === String(toCurrency)
          ? firstWallet
          : secondWallet;

      // Check sufficient balance
      if (!decimal.isGreaterThanOrEqual(sourceWallet.balance, amount)) {
        throw new BadRequestException(
          `Insufficient ${fromCurrency} balance. Available: ${sourceWallet.balance}`,
        );
      }

      const newSourceBalance = decimal.subtract(sourceWallet.balance, amount);
      const newTargetBalance = decimal.add(
        targetWallet.balance,
        convertedAmount,
      );

      await queryRunner.manager.update(Wallet, sourceWallet.id, {
        balance: newSourceBalance,
      });
      await queryRunner.manager.update(Wallet, targetWallet.id, {
        balance: newTargetBalance,
      });

      const transaction = queryRunner.manager.create(Transaction, {
        user_id: userId,
        type: TransactionType.CONVERSION,
        status: TransactionStatus.COMPLETED,
        source_currency: fromCurrency,
        source_amount: amount,
        target_currency: toCurrency,
        target_amount: convertedAmount,
        exchange_rate: rateResult.rate,
        idempotency_key: idempotencyKey,
        metadata: { rate_source: rateResult.source },
      });
      const savedTx = await queryRunner.manager.save(Transaction, transaction);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Currency converted: ${JSON.stringify({ userId, fromCurrency, toCurrency, amount, convertedAmount })}`,
      );

      return {
        transaction_id: savedTx.id,
        from: {
          currency: fromCurrency,
          amount,
          new_balance: newSourceBalance,
        },
        to: {
          currency: toCurrency,
          amount: convertedAmount,
          new_balance: newTargetBalance,
        },
        exchange_rate: rateResult.rate,
        rate_source: rateResult.source,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Executes a trade (used by TradingService). Same as conversion but records
   * both the raw rate and the spread-adjusted rate.
   */
  async executeTrade(
    userId: string,
    fromCurrency: Currency,
    toCurrency: Currency,
    sourceAmount: string,
    targetAmount: string,
    rawRate: string,
    spreadRate: string,
    idempotencyKey: string,
    metadata: Record<string, unknown>,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const [first, second] = orderedCurrencyPair(fromCurrency, toCurrency);

      const firstWallet = await this.lockOrCreateWallet(
        queryRunner,
        userId,
        first,
      );
      const secondWallet = await this.lockOrCreateWallet(
        queryRunner,
        userId,
        second,
      );

      const sourceWallet =
        firstWallet.currency === String(fromCurrency)
          ? firstWallet
          : secondWallet;
      const targetWallet =
        firstWallet.currency === String(toCurrency)
          ? firstWallet
          : secondWallet;

      if (!decimal.isGreaterThanOrEqual(sourceWallet.balance, sourceAmount)) {
        throw new BadRequestException(
          `Insufficient ${fromCurrency} balance. Available: ${sourceWallet.balance}`,
        );
      }

      const newSourceBalance = decimal.subtract(
        sourceWallet.balance,
        sourceAmount,
      );
      const newTargetBalance = decimal.add(targetWallet.balance, targetAmount);

      await queryRunner.manager.update(Wallet, sourceWallet.id, {
        balance: newSourceBalance,
      });
      await queryRunner.manager.update(Wallet, targetWallet.id, {
        balance: newTargetBalance,
      });

      const transaction = queryRunner.manager.create(Transaction, {
        user_id: userId,
        type: TransactionType.TRADE,
        status: TransactionStatus.COMPLETED,
        source_currency: fromCurrency,
        source_amount: sourceAmount,
        target_currency: toCurrency,
        target_amount: targetAmount,
        exchange_rate: rawRate,
        rate_with_spread: spreadRate,
        idempotency_key: idempotencyKey,
        metadata,
      });
      const savedTx = await queryRunner.manager.save(Transaction, transaction);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Trade executed: ${JSON.stringify({ userId, fromCurrency, toCurrency, sourceAmount, targetAmount })}`,
      );

      return {
        transaction_id: savedTx.id,
        from: {
          currency: fromCurrency,
          amount: sourceAmount,
          new_balance: newSourceBalance,
        },
        to: {
          currency: toCurrency,
          amount: targetAmount,
          new_balance: newTargetBalance,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async lockWallet(
    queryRunner: QueryRunner,
    userId: string,
    currency: Currency,
  ): Promise<Wallet | null> {
    return queryRunner.manager
      .createQueryBuilder(Wallet, 'w')
      .setLock('pessimistic_write')
      .where('w.user_id = :userId AND w.currency = :currency', {
        userId,
        currency,
      })
      .getOne();
  }

  private async lockOrCreateWallet(
    queryRunner: QueryRunner,
    userId: string,
    currency: Currency,
  ): Promise<Wallet> {
    let wallet = await this.lockWallet(queryRunner, userId, currency);
    if (!wallet) {
      const newWallet = queryRunner.manager.create(Wallet, {
        user_id: userId,
        currency,
        balance: '0.0000',
      });
      await queryRunner.manager.save(Wallet, newWallet);
      // Re-lock after creation
      wallet = await this.lockWallet(queryRunner, userId, currency);
      if (!wallet) {
        throw new NotFoundException(`Failed to create wallet for ${currency}`);
      }
    }
    return wallet;
  }
}
