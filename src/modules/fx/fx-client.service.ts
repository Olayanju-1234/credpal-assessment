import {
  Injectable,
  Logger,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
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

    let data: ExchangeRateApiResponse;

    try {
      const response = await firstValueFrom(
        this.httpService.get<ExchangeRateApiResponse>(url, { timeout: 5000 }),
      );
      data = response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (
        axiosError.code === 'ECONNABORTED' ||
        axiosError.code === 'ETIMEDOUT'
      ) {
        throw new ServiceUnavailableException(
          `FX API request timed out for ${base}`,
        );
      }
      throw new ServiceUnavailableException(
        `FX API is unreachable: ${axiosError.message}`,
      );
    }

    if (data.result !== 'success') {
      throw new ServiceUnavailableException(
        `FX API returned error: ${data['error-type'] || 'unknown'}`,
      );
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
      throw new ServiceUnavailableException(
        `FX rate not available for ${base}/${target}`,
      );
    }
    return rate;
  }
}
