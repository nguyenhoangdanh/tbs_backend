import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    console.error('🔥 EXCEPTION CAUGHT BY FILTER:');
    console.error('  URL:', request.url);
    console.error('  Method:', request.method);
    console.error('  Exception:', exception);

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message = typeof exceptionResponse === 'string' 
        ? exceptionResponse 
        : (exceptionResponse as any).message;
      
      console.error('  HTTP Status:', status);
      console.error('  Message:', message);
    } else if (exception instanceof Error) {
      console.error('  Error Name:', exception.name);
      console.error('  Error Message:', exception.message);
      console.error('  Stack:', exception.stack);
      message = exception.message;
    }

    const errorResponse = {
      statusCode: status,
      message,
      error: HttpStatus[status] || 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    console.error('  Response:', errorResponse);
    
    response.status(status).json(errorResponse);
  }
}
