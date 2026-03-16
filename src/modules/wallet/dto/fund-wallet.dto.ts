import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches } from 'class-validator';
import { Currency } from '../../../common/enums';

export class FundWalletDto {
  @ApiProperty({ enum: Currency, example: Currency.NGN })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({
    example: '50000.0000',
    description: 'Amount as string (max 4 decimal places)',
  })
  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d+(\.\d{1,4})?$/, {
    message:
      'Amount must be a positive number greater than zero with up to 4 decimal places',
  })
  amount: string;
}
