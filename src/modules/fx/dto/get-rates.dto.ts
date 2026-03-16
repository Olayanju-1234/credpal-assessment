import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { Currency } from '../../../common/enums';

export class GetRatesDto {
  @ApiProperty({ enum: Currency, example: 'NGN' })
  @IsEnum(Currency)
  base: Currency;

  @ApiPropertyOptional({
    description: 'Comma-separated target currencies (defaults to all)',
    example: 'USD,EUR,GBP',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}(,[A-Z]{3})*$/, {
    message: 'currencies must be comma-separated 3-letter currency codes',
  })
  currencies?: string;
}
