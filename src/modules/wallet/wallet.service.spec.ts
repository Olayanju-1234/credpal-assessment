import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WalletService } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { FxService } from '../fx/fx.service';
import {
  Currency,
  TransactionType,
  TransactionStatus,
} from '../../common/enums';

describe('WalletService', () => {
  let service: WalletService;

  const mockWalletRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const mockFxService = {
    getRate: jest.fn(),
  };

  // QueryRunner mock helpers
  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      createQueryBuilder: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getRepositoryToken(Wallet), useValue: mockWalletRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: FxService, useValue: mockFxService },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  // Helper: mock lockOrCreateWallet via the queryBuilder chain
  function mockLockWallet(wallet: Partial<Wallet>) {
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(wallet),
    };
    mockQueryRunner.manager.createQueryBuilder.mockReturnValue(qb);
    return qb;
  }

  // Helper: mock lockOrCreateWallet returning null first (create path), then returning wallet
  function mockLockWalletCreatePath(wallet: Partial<Wallet>) {
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValueOnce(null) // first call: not found
        .mockResolvedValueOnce(wallet), // after create + re-lock
    };
    mockQueryRunner.manager.createQueryBuilder.mockReturnValue(qb);
    return qb;
  }

  describe('fundWallet', () => {
    it('should increase balance correctly', async () => {
      const existingWallet: Partial<Wallet> = {
        id: 'wallet-1',
        user_id: 'user-1',
        currency: Currency.NGN,
        balance: '500.0000',
      };
      mockLockWallet(existingWallet);

      mockQueryRunner.manager.update.mockResolvedValue(undefined);
      mockQueryRunner.manager.create.mockReturnValue({
        id: 'tx-1',
        user_id: 'user-1',
        type: TransactionType.FUNDING,
        status: TransactionStatus.COMPLETED,
        source_currency: Currency.NGN,
        source_amount: '100.0000',
        idempotency_key: 'idem-1',
      });
      mockQueryRunner.manager.save.mockResolvedValue({ id: 'tx-1' });

      const result = await service.fundWallet(
        'user-1',
        Currency.NGN,
        '100.0000',
        'idem-1',
      );

      expect(result.new_balance).toBe('600.0000');
      expect(result.wallet_id).toBe('wallet-1');
      expect(result.transaction_id).toBe('tx-1');
      expect(result.currency).toBe(Currency.NGN);
      expect(result.amount).toBe('100.0000');

      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
        Wallet,
        'wallet-1',
        { balance: '600.0000' },
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should throw BadRequestException for zero amount', async () => {
      await expect(
        service.fundWallet('user-1', Currency.NGN, '0', 'idem-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.fundWallet('user-1', Currency.NGN, '0', 'idem-1'),
      ).rejects.toThrow('Amount must be positive');
    });

    it('should throw BadRequestException for negative amount', async () => {
      await expect(
        service.fundWallet('user-1', Currency.NGN, '-50.0000', 'idem-2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should rollback transaction on error', async () => {
      const existingWallet: Partial<Wallet> = {
        id: 'wallet-1',
        user_id: 'user-1',
        currency: Currency.NGN,
        balance: '500.0000',
      };
      mockLockWallet(existingWallet);

      mockQueryRunner.manager.update.mockRejectedValue(new Error('DB error'));

      await expect(
        service.fundWallet('user-1', Currency.NGN, '100.0000', 'idem-3'),
      ).rejects.toThrow('DB error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should handle decimal precision in balance calculation', async () => {
      const existingWallet: Partial<Wallet> = {
        id: 'wallet-1',
        user_id: 'user-1',
        currency: Currency.USD,
        balance: '0.1000',
      };
      mockLockWallet(existingWallet);

      mockQueryRunner.manager.update.mockResolvedValue(undefined);
      mockQueryRunner.manager.create.mockReturnValue({ id: 'tx-2' });
      mockQueryRunner.manager.save.mockResolvedValue({ id: 'tx-2' });

      const result = await service.fundWallet(
        'user-1',
        Currency.USD,
        '0.2000',
        'idem-4',
      );

      // 0.1000 + 0.2000 = 0.3000 (not 0.30000000000000004)
      expect(result.new_balance).toBe('0.3000');
    });

    it('should create wallet when it does not exist', async () => {
      const newWallet: Partial<Wallet> = {
        id: 'wallet-new',
        user_id: 'user-1',
        currency: Currency.EUR,
        balance: '0.0000',
      };
      mockLockWalletCreatePath(newWallet);

      mockQueryRunner.manager.create.mockReturnValue(newWallet);
      mockQueryRunner.manager.save.mockResolvedValue({ id: 'tx-5' });
      mockQueryRunner.manager.update.mockResolvedValue(undefined);

      const result = await service.fundWallet(
        'user-1',
        Currency.EUR,
        '50.0000',
        'idem-5',
      );

      expect(result.new_balance).toBe('50.0000');
      expect(result.wallet_id).toBe('wallet-new');
    });
  });

  describe('convertCurrency', () => {
    it('should perform correct decimal arithmetic', async () => {
      mockFxService.getRate.mockResolvedValue({
        rate: '1.2500',
        source: 'api',
      });

      // Two calls to lockOrCreateWallet: ordered by alphabet (EUR < USD)
      const eurWallet: Partial<Wallet> = {
        id: 'wallet-eur',
        user_id: 'user-1',
        currency: Currency.EUR,
        balance: '1000.0000',
      };
      const usdWallet: Partial<Wallet> = {
        id: 'wallet-usd',
        user_id: 'user-1',
        currency: Currency.USD,
        balance: '500.0000',
      };

      // EUR < USD alphabetically, so EUR is locked first
      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest
          .fn()
          .mockResolvedValueOnce(eurWallet) // first lock: EUR
          .mockResolvedValueOnce(usdWallet), // second lock: USD
      };
      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(qb);

      mockQueryRunner.manager.update.mockResolvedValue(undefined);
      mockQueryRunner.manager.create.mockReturnValue({ id: 'tx-conv' });
      mockQueryRunner.manager.save.mockResolvedValue({ id: 'tx-conv' });

      // Convert 100 EUR to USD at rate 1.2500
      const result = await service.convertCurrency(
        'user-1',
        Currency.EUR,
        Currency.USD,
        '100.0000',
        'idem-conv',
      );

      // 100 * 1.25 = 125.0000
      expect(result.to.amount).toBe('125.0000');
      expect(result.from.new_balance).toBe('900.0000');
      expect(result.to.new_balance).toBe('625.0000');
      expect(result.exchange_rate).toBe('1.2500');
      expect(result.rate_source).toBe('api');
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should reject same currency conversion', async () => {
      await expect(
        service.convertCurrency(
          'user-1',
          Currency.USD,
          Currency.USD,
          '100.0000',
          'idem-same',
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.convertCurrency(
          'user-1',
          Currency.USD,
          Currency.USD,
          '100.0000',
          'idem-same',
        ),
      ).rejects.toThrow('Source and target currencies must differ');
    });

    it('should throw BadRequestException for insufficient balance', async () => {
      mockFxService.getRate.mockResolvedValue({
        rate: '1.2500',
        source: 'cache',
      });

      const eurWallet: Partial<Wallet> = {
        id: 'wallet-eur',
        user_id: 'user-1',
        currency: Currency.EUR,
        balance: '50.0000', // insufficient for 100 EUR
      };
      const usdWallet: Partial<Wallet> = {
        id: 'wallet-usd',
        user_id: 'user-1',
        currency: Currency.USD,
        balance: '0.0000',
      };

      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest
          .fn()
          .mockResolvedValueOnce(eurWallet)
          .mockResolvedValueOnce(usdWallet),
      };
      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.convertCurrency(
          'user-1',
          Currency.EUR,
          Currency.USD,
          '100.0000',
          'idem-insuf',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should reject non-positive amount', async () => {
      await expect(
        service.convertCurrency(
          'user-1',
          Currency.EUR,
          Currency.USD,
          '0',
          'idem-zero',
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.convertCurrency(
          'user-1',
          Currency.EUR,
          Currency.USD,
          '-10',
          'idem-neg',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should rollback transaction on unexpected error', async () => {
      mockFxService.getRate.mockResolvedValue({
        rate: '1.5000',
        source: 'api',
      });

      const eurWallet: Partial<Wallet> = {
        id: 'wallet-eur',
        user_id: 'user-1',
        currency: Currency.EUR,
        balance: '1000.0000',
      };
      const usdWallet: Partial<Wallet> = {
        id: 'wallet-usd',
        user_id: 'user-1',
        currency: Currency.USD,
        balance: '500.0000',
      };

      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest
          .fn()
          .mockResolvedValueOnce(eurWallet)
          .mockResolvedValueOnce(usdWallet),
      };
      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(qb);

      mockQueryRunner.manager.update.mockRejectedValue(
        new Error('Connection lost'),
      );

      await expect(
        service.convertCurrency(
          'user-1',
          Currency.EUR,
          Currency.USD,
          '100.0000',
          'idem-err',
        ),
      ).rejects.toThrow('Connection lost');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });
});
