import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if ((host.getType() as string) === 'graphql') {
      // Let GraphQL filters handle this
      return;
    }

    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
      message:
        exception instanceof HttpException
          ? exception.getResponse()
          : 'Internal server error',
    };

    // Log Logic
    const request = ctx.getRequest();
    const method = request.method;
    const url = request.url;
    const ip = request.ip || request.connection.remoteAddress;

    const logMessage = `${method} ${url} ${httpStatus} - ${JSON.stringify(responseBody.message)} - ${ip}`;

    if (httpStatus >= 500) {
      this.logger.error(
        logMessage,
        exception instanceof Error ? exception.stack : '',
      );
    } else {
      this.logger.warn(logMessage);
    }

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}
