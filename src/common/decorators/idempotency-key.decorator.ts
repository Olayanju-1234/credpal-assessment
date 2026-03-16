import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface RequestWithIdempotencyKey {
  idempotencyKey: string;
}

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithIdempotencyKey>();
    return request.idempotencyKey;
  },
);
