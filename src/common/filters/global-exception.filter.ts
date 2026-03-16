import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Response } from 'express';

interface DatabaseError {
  code?: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
}

const PG_ERROR_MAP: Record<string, { status: number; message: string }> = {
  '23505': {
    status: HttpStatus.CONFLICT,
    message: 'Duplicate entry — this record already exists',
  },
  '23503': {
    status: HttpStatus.BAD_REQUEST,
    message: 'Referenced record does not exist',
  },
  '23502': {
    status: HttpStatus.BAD_REQUEST,
    message: 'A required field is missing',
  },
  '23514': {
    status: HttpStatus.BAD_REQUEST,
    message: 'Value violates a data constraint',
  },
  '23001': {
    status: HttpStatus.CONFLICT,
    message: 'Cannot delete — related records still exist',
  },
  '22P02': {
    status: HttpStatus.BAD_REQUEST,
    message: 'Invalid input syntax for the given data type',
  },
  '22003': {
    status: HttpStatus.BAD_REQUEST,
    message: 'Numeric value out of range',
  },
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : ((res as Record<string, unknown>).message as string | string[]);
    } else if (exception instanceof QueryFailedError) {
      const dbError = exception as unknown as DatabaseError;
      const mapped = dbError.code ? PG_ERROR_MAP[dbError.code] : undefined;

      if (mapped) {
        status = mapped.status;
        message = mapped.message;

        if (dbError.detail) {
          this.logger.warn(
            `DB constraint violation: ${JSON.stringify({ code: dbError.code, detail: dbError.detail, table: dbError.table, constraint: dbError.constraint })}`,
          );
        }
      } else {
        this.logger.error(
          `Unhandled DB error: ${JSON.stringify({ code: dbError.code, message: exception.message })}`,
        );
      }
    } else if (exception instanceof Error) {
      message = exception.message || 'An unexpected error occurred';
    }

    if (status >= 500) {
      this.logger.error(
        JSON.stringify({
          status,
          message,
          stack: (exception as Error)?.stack,
        }),
      );
    }

    response.status(status).json({
      success: false,
      error: {
        status_code: status,
        message: Array.isArray(message) ? message : [message],
      },
    });
  }
}
