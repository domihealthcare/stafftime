import { Type, plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsString, Max, Min, validateSync } from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsString()
  DATABASE_URL!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  /// Absolute lifetime of a signed-in session.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  SESSION_TTL_HOURS = 12;

  /// A session also dies after this long without use, so a shared front-desk
  /// browser left open overnight is not still signed in come morning.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  SESSION_IDLE_TIMEOUT_HOURS = 8;

  @Type(() => Number)
  @IsInt()
  @Min(3)
  MAX_LOGIN_ATTEMPTS = 8;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  LOCKOUT_MINUTES = 15;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  PUNCH_GRACE_MINUTES = 5;
}

export function validateEnv(raw: Record<string, unknown>) {
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(config, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return config;
}
