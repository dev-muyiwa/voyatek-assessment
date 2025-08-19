import { Logger } from '../config/logger';
import { ILog } from '../interfaces/interfaces';
import { LogStatus } from '../enums/enum';

export abstract class BaseService {
  private _action: string;
  private _ipAddress: string;

  set action(value: string) {
    this._action = value;
  }

  set ipAddress(value: string) {
    this._ipAddress = value;
  }

  set userAgent(value: string) {
    this._userAgent = value;
  }

  set requestId(value: string) {
    this._requestId = value;
  }

  set timestamp(value: string) {
    this._timestamp = value;
  }

  private _userAgent: string;
  private _requestId: string;
  private _timestamp: string;

  protected constructor(
    protected readonly _loggerInstance: Logger,
  ) {
  }

  protected logDebug(
    message: string,
    data: any,
    details: Record<any, any> = {}
  ): void {
    const payload: ILog = {
      action: this._action,
      data: data,
      description: message,
      ipAddress: this._ipAddress,
      userAgent: this._userAgent,
      requestId: this._requestId,
      timestamp: this._timestamp,
      status: LogStatus.SUCCESS,
      details: details,
    };
    this._loggerInstance.debug(payload.description, payload);
  }

  protected logError(
    message: string,
    data: any,
    details: Record<any, any> = {}
  ): void {
    const payload: ILog = {
      action: this._action,
      data: data,
      description: message,
      ipAddress: this._ipAddress,
      userAgent: this._userAgent,
      requestId: this._requestId,
      timestamp: this._timestamp,
      status: LogStatus.FAILED,
      details: details,
    };
    this._loggerInstance.error(payload.description, payload);
  }
}