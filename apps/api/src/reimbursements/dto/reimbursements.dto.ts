import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/// One cell, as typed: an amount, words, or nothing to empty it.
export class ReimbursementRateInput {
  @IsUUID()
  codeId!: string;

  @IsUUID()
  payerId!: string;

  @IsString()
  @MaxLength(200)
  value!: string;
}

/// A code, made or changed; sent whole.
export class ReimbursementCodeInput {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

/// An insurance, made or changed; sent whole.
export class ReimbursementPayerInput {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class MoveInput {
  @IsIn([-1, 1])
  by!: -1 | 1;
}
