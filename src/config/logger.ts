import { injectable } from 'inversify';
import { ILogger } from '../interfaces/interfaces';

@injectable()
export class Logger implements ILogger {
  info(message: string, meta?: Record<string, any>): void {
    console.log(`[INFO] ${message}`, meta || '');
  }

  warn(message: string, meta?: Record<string, any>): void {
    console.warn(`[WARN] ${message}`, meta || '');
  }

  error(message: string, meta?: Record<string, any>): void {
    console.error(`[ERROR] ${message}`, meta || '');
  }

  debug(message: string, meta?: Record<string, any>): void {
    console.debug(`[DEBUG] ${message}`, meta || '');
  }

  log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: Record<string, unknown>): void {
    switch (level) {
      case 'info':
        this.info(message, meta);
        break;
      case 'warn':
        this.warn(message, meta);
        break;
      case 'error':
        this.error(message, meta);
        break;
      case 'debug':
        this.debug(message, meta);
        break;
      default:
        throw new Error(`Invalid log level: ${level}`);
    }
  }
}
