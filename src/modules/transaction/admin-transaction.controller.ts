import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators';
import { Role } from '../../common/enums';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminTransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] View all transactions across all users' })
  @ApiResponse({ status: 200, description: 'All transactions retrieved' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async listAll(@Query() dto: ListTransactionsDto) {
    return this.transactionService.listAll(dto);
  }
}
