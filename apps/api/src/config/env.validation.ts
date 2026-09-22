import { Type, plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/// What this deployment is for. Drives a visible banner, and gates anything
/// that must never touch real data.
export enum AppEnvironment {
  Production = 'production',
  Test = 'test',
}

/// Where uploaded documents live. See src/storage.
export enum FileStorageBackend {
  Database = 'database',
  Disk = 'disk',
}

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  /// Defaults to production, so a deployment is only ever a test environment on
  /// purpose — never by forgetting to set something.
  @IsEnum(AppEnvironment)
  APP_ENVIRONMENT: AppEnvironment = AppEnvironment.Production;

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

  /// Kiosk PIN lockout, tracked separately from password lockout. Tighter,
  /// because a PIN has far less entropy than a password.
  @Type(() => Number)
  @IsInt()
  @Min(3)
  MAX_PIN_ATTEMPTS = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PIN_LOCKOUT_MINUTES = 10;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  PUNCH_GRACE_MINUTES = 5;

  /// Where uploaded checklist documents are kept: "database" (the default, and
  /// the only one that works on Vercel) or "disk" for local work.
  @IsEnum(FileStorageBackend)
  FILE_STORAGE: FileStorageBackend = FileStorageBackend.Database;

  /// Only read when FILE_STORAGE is "disk".
  @IsString()
  FILE_STORAGE_DIR = './var/uploads';

  /// Largest document that may be uploaded, in megabytes. A signed PDF is well
  /// under this; the cap is here so one person cannot fill the database.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  MAX_UPLOAD_MB = 10;

  /// Enables the one-time, browser-based creation of the first administrator.
  /// Unset it once that account exists — the route then disappears.
  @IsOptional()
  @IsString()
  @MinLength(8)
  SETUP_TOKEN?: string;
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
