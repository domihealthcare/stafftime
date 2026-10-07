import { RepFood, RepStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/// Adding or changing a rep. A change sends the whole rep again, so what is
/// saved is what the form showed.
export class RepInput {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  company?: string;

  /// What they represent: "Ozempic", "Eliquis, Farxiga".
  @IsOptional()
  @IsString()
  @MaxLength(200)
  medication?: string;

  /// Digits and the usual punctuation only: "(201) 555-0142".
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[0-9 ()+.\-x]*$/, {
    message: 'Write the cell phone with digits only, like (201) 555-0142.',
  })
  cellPhone?: string;

  @IsOptional()
  @IsEnum(RepFood)
  food?: RepFood | null;

  @IsEnum(RepStatus)
  status!: RepStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
