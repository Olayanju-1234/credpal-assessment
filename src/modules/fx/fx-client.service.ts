import { Injectable, Logger, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import fxConfig from '../../config/fx.config';
import { Currency } from '../../common/enums';

interface ExchangeRateApiResponse {
  result: string;
  'error-type'?: string;
  conversion_rates: Record<string, number>;
}

@Injectable()
export class FxClientService {
  private readonly logger = new Logger(FxClientService.name);
  readonly providerName = 'exchangerate-api';

  constructor(
    private readonly httpService: HttpService,
    @Inject(fxConfig.KEY)
    private readonly config: {
      apiUrl: string;
      apiKey: string;
      cacheTtlSeconds: number;
      spreadPercent: string;
    },
  ) {}

  async fetchRates(base: Currency): Promise<Record<string, string>> {
    const url = `${this.config.apiUrl}/${this.config.apiKey}/latest/${base}`;

    this.logger.log(`Fetching FX rates from API: ${base}`);

    const { data } = await firstValueFrom(
      this.httpService.get<ExchangeRateApiResponse>(url, { timeout: 5000 }),
    );

    if (data.result !== 'success') {
      throw new Error(`FX API error: ${data['error-type'] || 'unknown'}`);
    }

    const rates: Record<string, string> = {};
    for (const [currency, rate] of Object.entries(data.conversion_rates)) {
      rates[currency] = String(rate);
    }

    return rates;
  }

  async fetchRate(base: Currency, target: Currency): Promise<string> {
    const rates = await this.fetchRates(base);
    const rate = rates[target];
    if (!rate) {
      throw new Error(`Rate not available for ${base}/${target}`);
    }
    return rate;
  }
}
