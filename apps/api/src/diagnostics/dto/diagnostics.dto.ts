import { DiagnosticAnswer, DiagnosticSection } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/// One cell of the board. No answer clears it ("not known yet — ask").
export class DiagnosticAnswerInput {
  @IsUUID()
  testId!: string;

  @IsUUID()
  planId!: string;

  @ValidateIf((_, value) => value !== null)
  @IsEnum(DiagnosticAnswer)
  answer!: DiagnosticAnswer | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

/// A test, made or changed; sent whole.
export class DiagnosticTestInput {
  @IsEnum(DiagnosticSection)
  section!: DiagnosticSection;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  detail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  duration?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  prep?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  selfPay?: string;
}

/// An insurance plan, made or changed; sent whole.
export class DiagnosticPlanInput {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ecwName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  payerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  insuranceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class MoveInput {
  @IsIn([-1, 1])
  by!: -1 | 1;
}

/// The reminders above one half of the board, all of them, in order.
export class DiagnosticRemindersInput {
  @IsEnum(DiagnosticSection)
  section!: DiagnosticSection;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  lines!: string[];
}
