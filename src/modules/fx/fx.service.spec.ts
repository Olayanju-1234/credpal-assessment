import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FxService } from './fx.service';
import { FxClientService } from './fx-client.service';
import { FxRateSnapshot } from './entities/fx-rate-snapshot.entity';
import { Currency } from '../../common/enums';
import fxConfig from '../../config/fx.config';

describe('FxService', () => {
  let service: FxService;

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockFxClient = {
    fetchRate: jest.fn(),
    providerName: 'exchangerate-api',
  };

  const mockSnapshotRepo = {
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const configValues = {
    apiUrl: 'https://example.com',
    apiKey: 'test-key',
    cacheTtlSeconds: 300,
    spreadPercent: '1.5',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FxService,
        { provide: FxClientService, useValue: mockFxClient },
        {
          provide: getRepositoryToken(FxRateSnapshot),
          useValue: mockSnapshotRepo,
        },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
        { provide: fxConfig.KEY, useValue: configValues },
      ],
    }).compile();

    service = module.get<FxService>(FxService);
  });

  describe('cache hit', () => {
    it('should return cached rate with source=cache', async () => {
      mockRedis.get.mockResolvedValue('1550.5000');

      const result = await service.getRate(Currency.USD, Currency.NGN);

      expect(result).toEqual({ rate: '1550.5000', source: 'cache' });
      expect(mockRedis.get).toHaveBeenCalledWith('fx:USD:NGN');
      expect(mockFxClient.fetchRate).not.toHaveBeenCalled();
      expect(mockSnapshotRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('cache miss', () => {
    it('should call API, cache result, and persist snapshot', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockFxClient.fetchRate.mockResolvedValue('1550.0000');
      mockRedis.set.mockResolvedValue('OK');
      mockSnapshotRepo.save.mockResolvedValue({});

      const result = await service.getRate(Currency.USD, Currency.NGN);

      expect(result).toEqual({ rate: '1550.0000', source: 'api' });

      // Should cache in Redis with TTL
      expect(mockRedis.set).toHaveBeenCalledWith(
        'fx:USD:NGN',
        '1550.0000',
        'EX',
        300,
      );

      // Should persist snapshot
      expect(mockSnapshotRepo.save).toHaveBeenCalledWith({
        base_currency: Currency.USD,
        target_currency: Currency.NGN,
        rate: '1550.0000',
        provider: 'exchangerate-api',
      });
    });
  });

  describe('API failure with DB fallback', () => {
    it('should fall back to DB when API fails', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockFxClient.fetchRate.mockRejectedValue(new Error('API timeout'));
      mockSnapshotRepo.findOne.mockResolvedValue({
        id: 'snap-1',
        base_currency: Currency.USD,
        target_currency: Currency.NGN,
        rate: '1540.0000',
        provider: 'exchangerate-api',
        created_at: new Date(),
      });

      const result = await service.getRate(Currency.USD, Currency.NGN);

      expect(result).toEqual({ rate: '1540.0000', source: 'fallback_db' });
      expect(mockSnapshotRepo.findOne).toHaveBeenCalledWith({
        where: {
          base_currency: Currency.USD,
          target_currency: Currency.NGN,
        },
        order: { created_at: 'DESC' },
      });
    });
  });

  describe('circuit breaker', () => {
    it('should open circuit after 3 consecutive failures', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockFxClient.fetchRate.mockRejectedValue(new Error('API down'));
      mockSnapshotRepo.findOne.mockResolvedValue({
        id: 'snap-1',
        base_currency: Currency.USD,
        target_currency: Currency.NGN,
        rate: '1530.0000',
        provider: 'exchangerate-api',
        created_at: new Date(),
      });

      // Fail 3 times to open the circuit
      await service.getRate(Currency.USD, Currency.NGN);
      await service.getRate(Currency.USD, Currency.NGN);
      await service.getRate(Currency.USD, Currency.NGN);

      expect(mockFxClient.fetchRate).toHaveBeenCalledTimes(3);

      // 4th call: circuit is OPEN, should NOT call API
      mockFxClient.fetchRate.mockClear();
      await service.getRate(Currency.USD, Currency.NGN);

      expect(mockFxClient.fetchRate).not.toHaveBeenCalled();
      expect(mockSnapshotRepo.findOne).toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after 30s and allow one attempt', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockFxClient.fetchRate.mockRejectedValue(new Error('API down'));
      mockSnapshotRepo.findOne.mockResolvedValue({
        id: 'snap-1',
        base_currency: Currency.EUR,
        target_currency: Currency.NGN,
        rate: '1700.0000',
        provider: 'exchangerate-api',
        created_at: new Date(),
      });

      // Fail 3 times to open the circuit
      await service.getRate(Currency.EUR, Currency.NGN);
      await service.getRate(Currency.EUR, Currency.NGN);
      await service.getRate(Currency.EUR, Currency.NGN);

      // Fast-forward time by 31 seconds
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);

      // API recovers
      mockFxClient.fetchRate.mockResolvedValue('1710.0000');
      mockRedis.set.mockResolvedValue('OK');
      mockSnapshotRepo.save.mockResolvedValue({});

      const result = await service.getRate(Currency.EUR, Currency.NGN);

      // Should have called the API (HALF_OPEN allows one attempt)
      expect(mockFxClient.fetchRate).toHaveBeenCalledTimes(4); // 3 failures + 1 half-open
      expect(result).toEqual({ rate: '1710.0000', source: 'api' });

      jest.restoreAllMocks();
    });

    it('should reset circuit on successful API call', async () => {
      mockRedis.get.mockResolvedValue(null);

      // First call: API fails
      mockFxClient.fetchRate.mockRejectedValueOnce(new Error('fail'));
      mockSnapshotRepo.findOne.mockResolvedValue({
        id: 'snap-1',
        base_currency: Currency.USD,
        target_currency: Currency.NGN,
        rate: '1500.0000',
        provider: 'exchangerate-api',
        created_at: new Date(),
      });
      await service.getRate(Currency.USD, Currency.NGN);

      // Second call: API succeeds -> should reset failure count
      mockFxClient.fetchRate.mockResolvedValueOnce('1555.0000');
      mockRedis.set.mockResolvedValue('OK');
      mockSnapshotRepo.save.mockResolvedValue({});
      const result = await service.getRate(Currency.USD, Currency.NGN);

      expect(result.source).toBe('api');

      // Third call: API fails again -> count should be 1 (not 2)
      mockFxClient.fetchRate.mockRejectedValueOnce(new Error('fail again'));
      await service.getRate(Currency.USD, Currency.NGN);

      // Fourth call: API fails -> count should be 2 (not 3, circuit should still be CLOSED)
      mockFxClient.fetchRate.mockRejectedValueOnce(new Error('fail again 2'));
      await service.getRate(Currency.USD, Currency.NGN);

      // 5th call: API should still be attempted (circuit not yet open at 2 failures)
      mockFxClient.fetchRate.mockResolvedValueOnce('1560.0000');
      const result5 = await service.getRate(Currency.USD, Currency.NGN);
      expect(result5.source).toBe('api');
    });
  });

  describe('DB fallback', () => {
    it('should return latest snapshot with source=fallback_db', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockFxClient.fetchRate.mockRejectedValue(new Error('API unavailable'));

      const latestSnapshot = {
        id: 'snap-latest',
        base_currency: Currency.GBP,
        target_currency: Currency.NGN,
        rate: '2000.0000',
        provider: 'exchangerate-api',
        created_at: new Date('2026-03-16T10:00:00Z'),
      };
      mockSnapshotRepo.findOne.mockResolvedValue(latestSnapshot);

      const result = await service.getRate(Currency.GBP, Currency.NGN);

      expect(result).toEqual({ rate: '2000.0000', source: 'fallback_db' });
      expect(mockSnapshotRepo.findOne).toHaveBeenCalledWith({
        where: {
          base_currency: Currency.GBP,
          target_currency: Currency.NGN,
        },
        order: { created_at: 'DESC' },
      });
    });
  });

  describe('both API and DB fail', () => {
    it('should throw ServiceUnavailableException', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockFxClient.fetchRate.mockRejectedValue(new Error('API down'));
      mockSnapshotRepo.findOne.mockResolvedValue(null); // no snapshot in DB

      await expect(service.getRate(Currency.GBP, Currency.NGN)).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.getRate(Currency.GBP, Currency.NGN)).rejects.toThrow(
        'FX rates unavailable for GBP/NGN',
      );
    });

    it('should throw ServiceUnavailableException when circuit is open and DB has no data', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockFxClient.fetchRate.mockRejectedValue(new Error('API down'));
      mockSnapshotRepo.findOne.mockResolvedValue(null);

      // Open the circuit
      await expect(service.getRate(Currency.EUR, Currency.USD)).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.getRate(Currency.EUR, Currency.USD)).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.getRate(Currency.EUR, Currency.USD)).rejects.toThrow(
        ServiceUnavailableException,
      );

      // Circuit is now open, 4th call should skip API and go straight to DB fallback
      mockFxClient.fetchRate.mockClear();

      await expect(service.getRate(Currency.EUR, Currency.USD)).rejects.toThrow(
        ServiceUnavailableException,
      );
      // API should NOT have been called since circuit is open
      expect(mockFxClient.fetchRate).not.toHaveBeenCalled();
    });
  });
});
