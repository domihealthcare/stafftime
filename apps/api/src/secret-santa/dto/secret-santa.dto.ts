import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_BUDGET, MAX_WISHES } from '../secret-santa';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/// Who to add: everybody, or any mix of offices, job roles and people,
/// worked out into names when it is saved.
export class SecretSantaPeopleInput {
  @IsOptional()
  @IsBoolean()
  everyone?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  employeeIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  jobRoleIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  locationIds?: string[];
}

/// Setting one up, or changing it. The whole form is sent each time.
export class SecretSantaInput {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @Matches(DAY, { message: 'Choose the day of the exchange.' })
  exchangeOn!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_BUDGET)
  budgetDollars!: number;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  place?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @IsBoolean()
  selfSignUp!: boolean;

  @IsOptional()
  @IsString()
  @Matches(DAY, { message: 'That sign-up day is not a date.' })
  signUpUntil?: string | null;
}

/// Setting one up: the details, and whoever is in it from the start.
export class NewSecretSantaInput extends SecretSantaInput {
  @IsOptional()
  @ValidateNested()
  @Type(() => SecretSantaPeopleInput)
  people?: SecretSantaPeopleInput;
}

export class SecretSantaWishesInput {
  @IsString()
  @MaxLength(MAX_WISHES)
  wishes!: string;
}
