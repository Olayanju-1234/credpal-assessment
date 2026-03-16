import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches } from 'class-validator';
import { Currency } from '../../../common/enums';

export class ConvertCurrencyDto {
  @ApiProperty({ enum: Currency, example: Currency.NGN })
  @IsEnum(Currency)
  from_currency: Currency;

  @ApiProperty({ enum: Currency, example: Currency.USD })
  @IsEnum(Currency)
  to_currency: Currency;

  @ApiProperty({
    example: '100000.0000',
    description: 'Amount to convert from source currency',
  })
  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d+(\.\d{1,4})?$/, {
    message:
      'Amount must be a positive number greater than zero with up to 4 decimal places',
  })
  amount: string;
}
