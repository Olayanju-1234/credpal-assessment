import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsString,
  Matches,
  IsNumberString,
} from 'class-validator';
import { Currency, TransactionType } from '../../../common/enums';

export class ListTransactionsDto {
  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ enum: Currency })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'ISO date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from_date must be in YYYY-MM-DD format',
  })
  from_date?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'ISO date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to_date must be in YYYY-MM-DD format',
  })
  to_date?: string;

  @ApiPropertyOptional({ default: '1' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: '20' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
