import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import fxConfig from '../../config/fx.config';
import { FxService } from '../fx/fx.service';
import { WalletService } from '../wallet/wallet.service';
import { Currency } from '../../common/enums';
import { TradeAction } from './dto/trade.dto';
import * as decimal from '../../common/utils/decimal.util';

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(
    private readonly fxService: FxService,
    private readonly walletService: WalletService,
    @Inject(fxConfig.KEY)
    private readonly config: {
      apiUrl: string;
      apiKey: string;
      cacheTtlSeconds: number;
      spreadPercent: string;
    },
  ) {}

  async trade(
    userId: string,
    action: TradeAction,
    currency: Currency,
    amount: string,
    idempotencyKey: string,
  ) {
    if (currency === Currency.NGN) {
      throw new BadRequestException(
        'Cannot trade NGN for NGN. Use a foreign currency.',
      );
    }

    if (!decimal.isPositive(amount)) {
      throw new BadRequestException('Amount must be positive');
    }

    const spreadPercent = this.config.spreadPercent;

    if (action === TradeAction.BUY) {
      // BUY foreign currency: user spends NGN, receives foreign currency
      const rateResult = await this.fxService.getRate(Currency.NGN, currency);
      // rateResult.rate = how much of `currency` you get for 1 NGN
      // We need the inverse: how much NGN for 1 unit of `currency`
      const ngnPerUnit = decimal.divide('1', rateResult.rate);

      // Apply spread: user pays MORE NGN (markup)
      const rateWithSpread = decimal.applySpread(
        ngnPerUnit,
        spreadPercent,
        'markup',
      );

      // NGN cost = amount of foreign currency * NGN-per-unit with spread
      const ngnCost = decimal.multiplyRate(amount, rateWithSpread);

      const result = await this.walletService.executeTrade(
        userId,
        Currency.NGN,
        currency,
        ngnCost,
        amount,
        ngnPerUnit,
        rateWithSpread,
        idempotencyKey,
        {
          action: 'BUY',
          traded_currency: currency,
          spread_percent: spreadPercent,
          rate_source: rateResult.source,
        },
      );

      return {
        ...result,
        action: 'BUY',
        market_rate: ngnPerUnit,
        applied_rate: rateWithSpread,
        spread_percentage: spreadPercent,
      };
    } else {
      // SELL foreign currency: user spends foreign currency, receives NGN
      const rateResult = await this.fxService.getRate(currency, Currency.NGN);
      const ngnPerUnit = rateResult.rate;

      // Apply spread: user receives LESS NGN (markdown)
      const rateWithSpread = decimal.applySpread(
        ngnPerUnit,
        spreadPercent,
        'markdown',
      );

      const ngnReceived = decimal.multiplyRate(amount, rateWithSpread);

      const result = await this.walletService.executeTrade(
        userId,
        currency,
        Currency.NGN,
        amount,
        ngnReceived,
        ngnPerUnit,
        rateWithSpread,
        idempotencyKey,
        {
          action: 'SELL',
          traded_currency: currency,
          spread_percent: spreadPercent,
          rate_source: rateResult.source,
        },
      );

      return {
        ...result,
        action: 'SELL',
        market_rate: ngnPerUnit,
        applied_rate: rateWithSpread,
        spread_percentage: spreadPercent,
      };
    }
  }
}
