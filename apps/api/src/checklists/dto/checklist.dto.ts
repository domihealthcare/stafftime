import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ChecklistKind, ChecklistTaskStatus, TaskOwner } from '@prisma/client';

/// A task as it appears in a template. Order is the position in the array, so a
/// template is reordered by sending it back in the order you want.
export class TemplateTaskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskOwner)
  owner?: TaskOwner;

  @IsOptional()
  @IsBoolean()
  requiresDocument?: boolean;

  /// Days relative to the hire date (onboarding) or last day (offboarding).
  /// Negative is before it — an I-9 is due on day one, equipment goes back on
  /// the last day, and a background check might be -7.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-365)
  @Max(365)
  dueOffsetDays?: number;
}

export class CreateTemplateDto {
  @IsEnum(ChecklistKind)
  kind!: ChecklistKind;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TemplateTaskDto)
  tasks!: TemplateTaskDto[];
}

/// Everything about a template is replaceable, including the whole task list,
/// which is sent whole rather than patched task by task — a checklist is read
/// as a list, so it is edited as a list.
export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TemplateTaskDto)
  tasks?: TemplateTaskDto[];
}

export class StartChecklistDto {
  @IsUUID()
  employeeId!: string;

  @IsEnum(ChecklistKind)
  kind!: ChecklistKind;

  /// Which template to copy. Omitted means the default for that kind.
  @IsOptional()
  @IsUUID()
  templateId?: string;

  /// Defaults to the employee's hire date for onboarding, or their termination
  /// date for offboarding. Given explicitly when neither is right — a start
  /// date that has not been entered yet, say.
  @IsOptional()
  @IsISO8601()
  anchorDate?: string;
}

export class UpdateTaskDto {
  @IsEnum(ChecklistTaskStatus)
  status!: ChecklistTaskStatus;

  /// Required when marking something not applicable: a skipped compliance task
  /// with no explanation is worse than an unfinished one.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class QueryChecklistsDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsEnum(ChecklistKind)
  kind?: ChecklistKind;

  /// "open" hides finished checklists, which is what a manager wants by default.
  @IsOptional()
  @IsEnum(['open', 'completed', 'all'] as const)
  state?: 'open' | 'completed' | 'all';
}
