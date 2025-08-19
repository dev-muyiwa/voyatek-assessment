import { LogStatus, ProfileType } from '../enums/enum';

export interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;

  warn(message: string, meta?: Record<string, unknown>): void;

  error(message: string, meta?: Record<string, unknown>): void;

  debug(message: string, meta?: Record<string, unknown>): void;

  log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: Record<string, unknown>): void;
}

export interface IResponse<DataType = any, ErrorType = {
  code: number,
  message: string,
  details: Record<any, any>
}, Statistics = any> {
  success: boolean;
  message: string;
  statusCode: number;
  timestamp: string;
  requestId: string;
  validationErrors?: { field: string; message: string }[];
  meta?: Record<string, any>;
  data?: DataType;
  error?: ErrorType;
  statistics?: Statistics;
  pagination?: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalItems: number;
  };
}

export interface IError {
  code: number;
  message: string;
  details?: any;
}

export interface ILog {
  action: string;
  data?: object;
  description: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
  requestId: string;
  status: LogStatus;
  details?: Record<string, any>;
}

export interface IFileUpload {
  fieldName: string;
  originalName: string;
  buffer: Buffer;
  mimetype: string;
  sizeInBytes: number;
  extension: string;
}

export interface IAuthRecord {
  id: string;
  email: string;
  lastLogin: number;
}
