import { Response } from 'express';
import { Logger } from '../config/logger';
import { IError, IResponse } from '../interfaces/interfaces';
import { Exception } from './exception';
import { ValidationError } from 'class-validator';

export abstract class BaseController {
  protected constructor(
    protected readonly _logger: Logger
  ) {
  }

  protected sendSuccess<T = any>(
    res: Response,
    data: T = {} as T,
    message: string,
    statusCode: number = 200,
    timestamp: string,
    requestId: string
  ): void {

    const response: IResponse<any, IError> = {
      success: true,
      message,
      data,
      statusCode,
      timestamp,
      requestId
    };

    this._logger.debug(message, { data, requestId, timestamp });
    res.status(statusCode).json(response);
  }

  protected sendError(
    res: Response,
    requestId: string,
    error: any,
    message: string = 'oops! an error occurred. please try again later',
    statusCode: number = Exception.SERVER_ERROR
  ): void {
    const timestamp = new Date().toISOString();

    // Helper function to extract validation errors recursively
    const extractValidationErrors = (errors: ValidationError[], parentField = ''): IError[] => {
      return errors.flatMap((err) => {
        const field = parentField ? `${parentField}.${err.property}` : err.property;
        const constraints = Object.values(err.constraints || {}).join(', ');

        const nestedErrors = err.children?.length
          ? extractValidationErrors(err.children, field)
          : [];

        return constraints
          ? [{ field, message: constraints, code: Exception.BAD_REQUEST }]
          : nestedErrors;
      });
    };

    if (Array.isArray(error) && error.every((err) => err instanceof ValidationError)) {
      const validationErrors = extractValidationErrors(error);

      const response: IResponse = {
        success: false,
        message: 'validation errors',
        error: { code: Exception.BAD_REQUEST, message: 'validation errors', details: validationErrors },
        statusCode: Exception.BAD_REQUEST,
        timestamp,
        requestId
      };

      this._logger.error('validation error', { validationErrors, requestId, timestamp });
      res.status(400).json(response);
      return;
    }

    if (error instanceof Exception) {
      const response: IResponse = {
        success: false,
        message: error.message,
        error: { code: error.code, message: error.message, details: error },
        statusCode: error.code,
        timestamp,
        requestId
      };

      this._logger.error(error.message, { error, requestId, timestamp });
      res.status(error.code).json(response);
      return;
    }

    const response: IResponse = {
      success: false,
      message,
      error: { code: statusCode, message: message, details: {} },
      statusCode,
      timestamp,
      requestId
    };

    this._logger.error(message, { error, requestId, timestamp });
    res.status(statusCode).json(response);
  }

}
