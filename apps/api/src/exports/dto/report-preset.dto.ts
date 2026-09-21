import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { ExportTimesheetDto } from './export-timesheet.dto';

/// The saved half of an export: everything except the period, which is almost
/// always "the last pay period" rather than fixed dates.
export class PresetOptionsDto extends ExportTimesheetDto {
  /// Overridden to optional — a preset stores the shape of a report, not a
  /// specific fortnight.
  @IsOptional()
  @IsString()
  declare from: string;

  @IsOptional()
  @IsString()
  declare to: string;
}

export class SaveReportPresetDto {
  @IsString()
  @Length(1, 60)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @ValidateNested()
  @Type(() => PresetOptionsDto)
  options!: PresetOptionsDto;
}

export class UpdateReportPresetDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => PresetOptionsDto)
  options?: PresetOptionsDto;
}
