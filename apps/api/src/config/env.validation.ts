import { Type, plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsString, Max, Min, validateSync } from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/// "dev" trusts a request header for identity so endpoints are usable before real
/// login exists. Replaced by JWT auth in the auth pass.
export enum AuthMode {
  Dev = 'dev',
  Jwt = 'jwt',
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

  @IsEnum(AuthMode)
  AUTH_MODE: AuthMode = AuthMode.Dev;

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

  // Fail loudly rather than silently shipping header-trust auth to production.
  if (config.NODE_ENV === NodeEnv.Production && config.AUTH_MODE === AuthMode.Dev) {
    throw new Error(
      'AUTH_MODE=dev cannot be used when NODE_ENV=production. Real authentication is required.',
    );
  }

  return config;
}
