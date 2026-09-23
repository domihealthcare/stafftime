import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

export class UpdateAdpSettingsDto {
  /// ADP's company code — the "ccc" in PRcccEPI. Empty clears it.
  @IsOptional()
  @IsString()
  @Matches(/^\s*([A-Za-z0-9]{2,6})?\s*$/, {
    message: 'The company code is letters and numbers only, 2 to 6 of them.',
  })
  companyCode?: string;

  /// The whole worksheet exported from ADP, pasted as text. Only its header and
  /// footer rows are kept.
  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  worksheet?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  regularColumn?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  overtimeColumn?: string | null;
}
