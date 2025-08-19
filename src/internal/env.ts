import dotenv from 'dotenv';
import mapKeys from 'lodash/mapKeys';
import { IsIn, IsNumber, IsString, validateSync, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';

export class DataValidationError extends Error {
  messages: string[];

  constructor(validationErrors: ValidationError[]) {
    const messages = validationErrors.flatMap(error =>
      Object.values(error.constraints || {})
    );

    super(`Validation Failed: ${messages.join(', ')}`);
    this.messages = messages;
  }
}

export class IncompleteEnvError extends Error {
  constructor(error: DataValidationError) {
    super(
      `Unable to load environment:\n${JSON.stringify(error.messages, null, 2)}`
    );
  }
}

export class BasicConfig {
  @IsString()
  @IsIn(['/api/v1',], { message: 'Invalid API version' })
  api_version: string = '/api/v1';

  @IsString()
  @IsIn(['dev', 'staging'], { message: 'Invalid node environment' })
  node_env: string = 'dev';

  @IsNumber({}, { message: 'Port must be a number' })
  port: number = 4000;

  constructor(config?: Partial<BasicConfig>) {
    if (config) {
      Object.assign(this, config);
    }
  }

  validate(): void {
    const errors = validateSync(this, {
      validationError: {
        target: false,
        value: false
      }
    });

    if (errors.length > 0) {
      throw new DataValidationError(errors);
    }
  }
}

/**
 * Load process environment and validate the keys needed.
 * @param ConfigClass Configuration class to use for validation
 */
export function loadEnv<T extends BasicConfig>(ConfigClass: new (config?: Partial<T>) => T): T {
  dotenv.config();

  const processedEnv = mapKeys(process.env, (_, key) => key.toLowerCase());

  try {
    const instance = plainToInstance(ConfigClass as any, processedEnv as any) as unknown as T;
    instance.validate();
    return instance;
  } catch (err) {
    if (err instanceof DataValidationError) {
      throw new IncompleteEnvError(err);
    }
    throw err;
  }
}
