import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TradingService } from './trading.service';
import { FxService } from '../fx/fx.service';
import { WalletService } from '../wallet/wallet.service';
import { Currency } from '../../common/enums';
import { TradeAction } from './dto/trade.dto';
import fxConfig from '../../config/fx.config';
import { Decimal } from 'decimal.js';

describe('TradingService', () => {
  let service: TradingService;

  const mockFxService = {
    getRate: jest.fn(),
  };

  const mockWalletService = {
    executeTrade: jest.fn(),
  };

  const spreadPercent = '1.5';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradingService,
        { provide: FxService, useValue: mockFxService },
        { provide: WalletService, useValue: mockWalletService },
        {
          provide: fxConfig.KEY,
          useValue: {
            apiUrl: 'https://example.com',
            apiKey: 'test-key',
            cacheTtlSeconds: 300,
            spreadPercent,
          },
        },
      ],
    }).compile();

    service = module.get<TradingService>(TradingService);
  });

  describe('BUY action', () => {
    it('should apply correct spread markup (user pays more NGN)', async () => {
      // BUY 100 USD: first get NGN->USD rate
      // If NGN->USD rate = 0.00065 (i.e. 1 NGN = 0.00065 USD)
      // Then ngnPerUnit = 1/0.00065 = 1538.4615...
      // With 1.5% markup: ngnPerUnit * 1.015 = 1561.5384...
      const ngnToUsdRate = '0.00065000';
      mockFxService.getRate.mockResolvedValue({
        rate: ngnToUsdRate,
        source: 'api',
      });

      const tradeResult = {
        transaction_id: 'tx-buy',
        from: {
          currency: Currency.NGN,
          amount: '156153.8461',
          new_balance: '843846.1539',
        },
        to: {
          currency: Currency.USD,
          amount: '100.0000',
          new_balance: '100.0000',
        },
      };
      mockWalletService.executeTrade.mockResolvedValue(tradeResult);

      const result = await service.trade(
        'user-1',
        TradeAction.BUY,
        Currency.USD,
        '100.0000',
        'idem-buy',
      );

      // Verify FxService was called with NGN->USD (base=NGN, target=currency)
      expect(mockFxService.getRate).toHaveBeenCalledWith(
        Currency.NGN,
        Currency.USD,
      );

      // Replicate the exact decimal.util calls the service makes:
      // decimal.divide('1', rate) -> toFixed(4)
      const expectedMarketRate = new Decimal('1')
        .dividedBy(new Decimal(ngnToUsdRate))
        .toFixed(4);
      // decimal.applySpread(ngnPerUnit, spreadPercent, 'markup') -> toFixed(8)
      const expectedAppliedRate = new Decimal(expectedMarketRate)
        .times(new Decimal('1').plus(new Decimal(spreadPercent).dividedBy(100)))
        .toFixed(8);
      // decimal.multiplyRate(amount, rateWithSpread) -> toFixed(4)
      const expectedNgnCost = new Decimal('100.0000')
        .times(new Decimal(expectedAppliedRate))
        .toFixed(4);

      // executeTrade called with source=NGN, target=USD
      expect(mockWalletService.executeTrade).toHaveBeenCalledWith(
        'user-1',
        Currency.NGN, // fromCurrency (user spends NGN)
        Currency.USD, // toCurrency (user receives USD)
        expectedNgnCost, // sourceAmount (NGN cost)
        '100.0000', // targetAmount (USD received)
        expectedMarketRate, // rawRate
        expectedAppliedRate, // spreadRate
        'idem-buy',
        expect.objectContaining({
          action: 'BUY',
          traded_currency: Currency.USD,
          spread_percent: spreadPercent,
        }),
      );

      expect(result.action).toBe('BUY');
      expect(result.market_rate).toBe(expectedMarketRate);
      expect(result.applied_rate).toBe(expectedAppliedRate);
      expect(result.spread_percentage).toBe(spreadPercent);

      // The applied rate should be HIGHER than market rate (user pays more)
      expect(
        new Decimal(result.applied_rate).greaterThan(
          new Decimal(result.market_rate),
        ),
      ).toBe(true);
    });
  });

  describe('SELL action', () => {
    it('should apply correct spread markdown (user receives less NGN)', async () => {
      // SELL 100 USD: get USD->NGN rate
      // If USD->NGN rate = 1550.0000 (1 USD = 1550 NGN)
      // With 1.5% markdown: 1550 * (1 - 0.015) = 1550 * 0.985 = 1526.7500
      const usdToNgnRate = '1550.0000';
      mockFxService.getRate.mockResolvedValue({
        rate: usdToNgnRate,
        source: 'cache',
      });

      const tradeResult = {
        transaction_id: 'tx-sell',
        from: {
          currency: Currency.USD,
          amount: '100.0000',
          new_balance: '400.0000',
        },
        to: {
          currency: Currency.NGN,
          amount: '152675.0000',
          new_balance: '152675.0000',
        },
      };
      mockWalletService.executeTrade.mockResolvedValue(tradeResult);

      const result = await service.trade(
        'user-1',
        TradeAction.SELL,
        Currency.USD,
        '100.0000',
        'idem-sell',
      );

      // Verify FxService was called with USD->NGN (base=currency, target=NGN)
      expect(mockFxService.getRate).toHaveBeenCalledWith(
        Currency.USD,
        Currency.NGN,
      );

      // SELL: ngnPerUnit = rateResult.rate directly (no inverse)
      const expectedMarketRate = usdToNgnRate;
      const expectedAppliedRate = new Decimal(usdToNgnRate)
        .times(
          new Decimal('1').minus(new Decimal(spreadPercent).dividedBy(100)),
        )
        .toFixed(8);
      const expectedNgnReceived = new Decimal('100.0000')
        .times(new Decimal(expectedAppliedRate))
        .toFixed(4);

      // executeTrade called with source=USD, target=NGN
      expect(mockWalletService.executeTrade).toHaveBeenCalledWith(
        'user-1',
        Currency.USD, // fromCurrency (user spends USD)
        Currency.NGN, // toCurrency (user receives NGN)
        '100.0000', // sourceAmount (USD spent)
        expectedNgnReceived, // targetAmount (NGN received)
        expectedMarketRate, // rawRate
        expectedAppliedRate, // spreadRate
        'idem-sell',
        expect.objectContaining({
          action: 'SELL',
          traded_currency: Currency.USD,
          spread_percent: spreadPercent,
        }),
      );

      expect(result.action).toBe('SELL');
      expect(result.market_rate).toBe(expectedMarketRate);
      expect(result.applied_rate).toBe(expectedAppliedRate);
      expect(result.spread_percentage).toBe(spreadPercent);

      // The applied rate should be LOWER than market rate (user receives less)
      expect(
        new Decimal(result.applied_rate).lessThan(
          new Decimal(result.market_rate),
        ),
      ).toBe(true);
    });
  });

  describe('validation', () => {
    it('should reject currency=NGN', async () => {
      await expect(
        service.trade(
          'user-1',
          TradeAction.BUY,
          Currency.NGN,
          '100.0000',
          'idem-ngn',
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.trade(
          'user-1',
          TradeAction.BUY,
          Currency.NGN,
          '100.0000',
          'idem-ngn',
        ),
      ).rejects.toThrow('Cannot trade NGN for NGN');
    });

    it('should reject SELL with currency=NGN', async () => {
      await expect(
        service.trade(
          'user-1',
          TradeAction.SELL,
          Currency.NGN,
          '100.0000',
          'idem-ngn-sell',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject zero amount', async () => {
      await expect(
        service.trade(
          'user-1',
          TradeAction.BUY,
          Currency.USD,
          '0',
          'idem-zero',
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.trade(
          'user-1',
          TradeAction.BUY,
          Currency.USD,
          '0',
          'idem-zero',
        ),
      ).rejects.toThrow('Amount must be positive');
    });

    it('should reject negative amount', async () => {
      await expect(
        service.trade(
          'user-1',
          TradeAction.SELL,
          Currency.EUR,
          '-50.0000',
          'idem-neg',
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.trade(
          'user-1',
          TradeAction.SELL,
          Currency.EUR,
          '-50.0000',
          'idem-neg',
        ),
      ).rejects.toThrow('Amount must be positive');
    });

    it('should not call FxService or WalletService when validation fails', async () => {
      await expect(
        service.trade(
          'user-1',
          TradeAction.BUY,
          Currency.NGN,
          '100.0000',
          'idem-val',
        ),
      ).rejects.toThrow();

      expect(mockFxService.getRate).not.toHaveBeenCalled();
      expect(mockWalletService.executeTrade).not.toHaveBeenCalled();
    });
  });
});
