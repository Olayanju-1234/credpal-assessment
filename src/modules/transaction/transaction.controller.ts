import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { VerifiedOnly, CurrentUser } from '../../common/decorators';
import { User } from '../user/entities/user.entity';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  @VerifiedOnly()
  @ApiOperation({
    summary: 'View transaction history with filtering and pagination',
  })
  @ApiResponse({ status: 200, description: 'Transaction history retrieved' })
  async list(@CurrentUser() user: User, @Query() dto: ListTransactionsDto) {
    return this.transactionService.list(user.id, dto);
  }
}
