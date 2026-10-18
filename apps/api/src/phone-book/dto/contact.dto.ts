import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/// One entry in the phone book, added or changed. A change sends it whole.
export class ContactInput {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  category!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fax?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string | null;
}
