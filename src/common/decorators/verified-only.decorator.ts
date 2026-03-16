import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { VerifiedGuard } from '../guards/verified.guard';

export const VerifiedOnly = () =>
  applyDecorators(UseGuards(JwtAuthGuard, VerifiedGuard));
