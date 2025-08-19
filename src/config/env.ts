import { IsNotEmpty, IsNumber, validateSync } from 'class-validator';
import { BasicConfig, loadEnv } from '../internal/env';
import { Type } from 'class-transformer';

export class ApplicationEnv extends BasicConfig {
  @IsNumber({}, { message: 'bcrypt rounds must be a number' })
  @Type(() => Number)
  readonly bcrypt_rounds: number;

  @IsNotEmpty({ message: 'database host is required' })
  database_host: string;

  @IsNumber({}, { message: 'database port must be a number' })
  @Type(() => Number)
  database_port: number;

  @IsNotEmpty({ message: 'database name is required' })
  readonly database_name: string;

  @IsNotEmpty({ message: 'database username is required' })
  readonly database_user: string;

  @IsNotEmpty({ message: 'database password is required' })
  readonly database_password: string;

  @IsNotEmpty({ message: 'redis host is required' })
  readonly redis_host: string;

  @IsNumber({}, { message: 'redis port must be a number' })
  @Type(() => Number)
  readonly redis_port: number;

  @IsNotEmpty({ message: 'redis username is required' })
  readonly redis_username: string;

  @IsNotEmpty({ message: 'redis password is required' })
  readonly redis_password: string;

  @IsNotEmpty({ message: 'jwt access secret is required' })
  readonly jwt_access_secret: string;

  @IsNotEmpty({ message: 'jwt refresh secret is required' })
  readonly jwt_refresh_secret: string;

  @IsNotEmpty({ message: 'jwt password reset secret is required' })
  readonly jwt_password_reset_secret: string;

  @IsNotEmpty({ message: 'frontend base url is required' })
  readonly frontend_base_url: string;

  @IsNotEmpty({ message: 'mail host is required' })
  readonly mail_host: string;

  @IsNumber({}, { message: 'mail port must be a number' })
  @Type(() => Number)
  readonly mail_port: number;

  @IsNotEmpty({ message: 'mail username is required' })
  readonly mail_username: string;

  @IsNotEmpty({ message: 'mail password is required' })
  readonly mail_password: string;

  @IsNotEmpty({ message: 'mail tls is required' })
  readonly mail_tls: string;


  constructor(config?: Partial<ApplicationEnv>) {
    super(config);

    if (config) {
      Object.assign(this, {
        bcrypt_rounds: config.bcrypt_rounds ?? this.bcrypt_rounds,
        // db
        database_host: config.database_host ?? this.database_host,
        database_port: config.database_port ?? this.database_port,
        database_name: config.database_name ?? this.database_name,
        database_user: config.database_user ?? this.database_user,
        database_password: config.database_password ?? this.database_password,
        // redis
        redis_host: config.redis_host ?? this.redis_host,
        redis_port: config.redis_port ?? this.redis_port,
        redis_username: config.redis_username ?? this.redis_username,
        redis_password: config.redis_password ?? this.redis_password,
        // jwt
        jwt_access_secret: config.jwt_access_secret ?? this.jwt_access_secret,
        jwt_refresh_secret: config.jwt_refresh_secret ?? this.jwt_refresh_secret,
        jwt_password_reset_secret: config.jwt_password_reset_secret ?? this.jwt_password_reset_secret,
        //   smtp
        mail_host: config.mail_host ?? this.mail_host,
        mail_port: config.mail_port ?? this.mail_port,
        mail_username: config.mail_username ?? this.mail_username,
        mail_password: config.mail_password ?? this.mail_password,
        mail_tls: config.mail_tls ?? this.mail_tls,
        // url
        frontend_base_url: config.frontend_base_url ?? this.frontend_base_url,
      });
    }
  }

  validate(): void {
    super.validate();

    const errors = validateSync(this, {
      validationError: {
        target: false,
        value: false,
      },
    });

    if (errors.length > 0) {
      const errorMessages = errors.map(
        error => Object.values(error.constraints || {}).join(', '),
      ).join('; ');

      throw new Error(`Environment Configuration Validation Failed: ${errorMessages}`);
    }
  }
}

const env: ApplicationEnv = loadEnv(ApplicationEnv);

export default env;