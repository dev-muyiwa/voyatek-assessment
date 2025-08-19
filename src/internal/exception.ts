export class Exception extends Error {
  code: number;
  err: any;

  static BAD_REQUEST: number = 400;
  static UNAUTHORIZED: number = 401;
  static FORBIDDEN: number = 403;
  static NOT_FOUND: number = 404;
  static CONFLICT: number = 409;
  static UNPROCESSABLE_ENTITY: number = 422;
  static SERVER_ERROR: number = 500;

  constructor(message: string, code: number, err: any = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.err = err;
    Error.captureStackTrace(this, this.constructor);
  }
}
