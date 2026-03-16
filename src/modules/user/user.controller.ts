import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators';
import { Role } from '../../common/enums';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] List all users with pagination' })
  @ApiQuery({ name: 'page', required: false, example: '1' })
  @ApiQuery({ name: 'limit', required: false, example: '20' })
  @ApiResponse({ status: 200, description: 'Users list retrieved' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.userService.listUsers(
      parseInt(page || '1', 10),
      Math.min(parseInt(limit || '20', 10), 100),
    );
  }
}
