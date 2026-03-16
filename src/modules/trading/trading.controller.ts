import {
  Controller,
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
import { TradingService } from './trading.service';
import { TradeDto } from './dto/trade.dto';
import {
  VerifiedOnly,
  CurrentUser,
  IdempotencyKey,
} from '../../common/decorators';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { User } from '../user/entities/user.entity';

@ApiTags('Trading')
@ApiBearerAuth()
@Controller('wallet')
export class TradingController {
  constructor(private readonly tradingService: TradingService) {}

  @Post('trade')
  @VerifiedOnly()
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Trade NGN against foreign currencies (with spread)',
    description:
      'BUY: spend NGN to acquire foreign currency. SELL: spend foreign currency to acquire NGN. A spread is applied to the market rate.',
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: true,
    description: 'Unique request identifier (UUID)',
  })
  @ApiResponse({ status: 201, description: 'Trade executed successfully' })
  async trade(
    @CurrentUser() user: User,
    @Body() dto: TradeDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.tradingService.trade(
      user.id,
      dto.action,
      dto.currency,
      dto.amount,
      idempotencyKey,
    );
  }
}
