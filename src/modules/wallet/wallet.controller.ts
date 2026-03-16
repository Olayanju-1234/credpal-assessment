import {
  Controller,
  Get,
  Post,
  Body,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { FundWalletDto } from './dto/fund-wallet.dto';
import { ConvertCurrencyDto } from './dto/convert-currency.dto';
import {
  VerifiedOnly,
  CurrentUser,
  IdempotencyKey,
} from '../../common/decorators';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { User } from '../user/entities/user.entity';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @VerifiedOnly()
  @ApiOperation({
    summary: 'Get all wallet balances for the authenticated user',
  })
  @ApiResponse({ status: 200, description: 'Wallet balances retrieved' })
  async getWallets(@CurrentUser() user: User) {
    return this.walletService.getWallets(user.id);
  }

  @Post('fund')
  @VerifiedOnly()
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Fund wallet in any supported currency' })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: true,
    description: 'Unique request identifier (UUID)',
  })
  @ApiResponse({ status: 201, description: 'Wallet funded successfully' })
  async fundWallet(
    @CurrentUser() user: User,
    @Body() dto: FundWalletDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.walletService.fundWallet(
      user.id,
      dto.currency,
      dto.amount,
      idempotencyKey,
    );
  }

  @Post('convert')
  @VerifiedOnly()
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Convert between any two supported currencies using real-time FX rates',
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: true,
    description: 'Unique request identifier (UUID)',
  })
  @ApiResponse({ status: 201, description: 'Conversion successful' })
  async convertCurrency(
    @CurrentUser() user: User,
    @Body() dto: ConvertCurrencyDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.walletService.convertCurrency(
      user.id,
      dto.from_currency,
      dto.to_currency,
      dto.amount,
      idempotencyKey,
    );
  }
}
