import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FxService } from './fx.service';
import { GetRatesDto } from './dto/get-rates.dto';
import { Currency } from '../../common/enums';

@ApiTags('FX Rates')
@Controller('fx')
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @Get('rates')
  @ApiOperation({
    summary: 'Get current FX rates for supported currency pairs',
  })
  @ApiResponse({ status: 200, description: 'FX rates retrieved' })
  async getRates(@Query() dto: GetRatesDto) {
    const targets = dto.currencies
      ? (dto.currencies.split(',') as Currency[]).filter(
          (c) => Object.values(Currency).includes(c) && c !== dto.base,
        )
      : Object.values(Currency).filter((c) => c !== dto.base);

    const rates = await this.fxService.getRates(dto.base, targets);

    const rateMap: Record<string, string> = {};
    const sources: Record<string, string> = {};
    for (const [currency, result] of Object.entries(rates)) {
      rateMap[currency] = result.rate;
      sources[currency] = result.source;
    }

    return {
      base: dto.base,
      rates: rateMap,
      sources,
      timestamp: new Date().toISOString(),
    };
  }
}
