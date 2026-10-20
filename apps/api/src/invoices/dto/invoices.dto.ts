import { InvoiceBillTo, InvoiceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class InvoiceLineInput {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  /// In cents; up to $100,000 a line.
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  amountCents!: number;
}

/// An invoice, made or changed; sent whole. For a patient, the name and
/// address are never sent (the service refuses them): they go on the PDF in
/// the browser only.
export class InvoiceInput {
  @Matches(DATE_ONLY)
  issuedOn!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(DATE_ONLY)
  dueOn?: string | null;

  @IsEnum(InvoiceBillTo)
  billTo!: InvoiceBillTo;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  billToName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  billToAddress?: string;

  @IsEnum(InvoiceStatus)
  status!: InvoiceStatus;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(DATE_ONLY)
  paidOn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInput)
  lines!: InvoiceLineInput[];
}
