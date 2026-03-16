import { Request } from 'express';
import { User } from '../../modules/user/entities/user.entity';

export interface AuthenticatedRequest extends Request {
  user: User;
  idempotencyKey: string;
}
