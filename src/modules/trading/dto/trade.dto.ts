import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches } from 'class-validator';
import { Currency } from '../../../common/enums';

export enum TradeAction {
  BUY = 'BUY',
  SELL = 'SELL',
}

export class TradeDto {
  @ApiProperty({
    enum: TradeAction,
    example: TradeAction.BUY,
    description:
      'BUY = spend NGN to get foreign currency. SELL = spend foreign currency to get NGN.',
  })
  @IsEnum(TradeAction)
  action: TradeAction;

  @ApiProperty({
    enum: Currency,
    example: Currency.USD,
    description: 'The foreign currency to trade (must not be NGN)',
  })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({
    example: '100.0000',
    description: 'Amount of the foreign currency to buy or sell',
  })
  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d+(\.\d{1,4})?$/, {
    message:
      'Amount must be a positive number greater than zero with up to 4 decimal places',
  })
  amount: string;
}
