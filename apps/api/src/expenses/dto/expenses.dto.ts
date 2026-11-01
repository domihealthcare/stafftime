import { ExpenseKind, ReimbursementMethod } from '@prisma/client';
import {
  Equals,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_EXPENSE_CENTS } from '../expenses';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/// Somebody asking to be paid back. Money in cents.
export class ExpenseRequestInput {
  @IsString()
  @MaxLength(300)
  description!: string;

  @IsOptional()
  @IsEnum(ExpenseKind)
  kind?: ExpenseKind | null;

  @Matches(DATE_ONLY, { message: 'Give the day you paid.' })
  spentOn!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_EXPENSE_CENTS)
  amountCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /// They emailed the receipt to the approvers: required.
  @IsBoolean()
  receiptEmailed!: boolean;
}

/// Approved, at what was asked or another amount, once the receipt arrived.
export class ExpenseApproveInput {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_EXPENSE_CENTS)
  approvedCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @Equals(true, { message: 'Tick that the receipt arrived.' })
  receiptReceived!: boolean;
}

export class ExpenseDeclineInput {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

/// Paid outside payroll: the day, the amount and how.
export class PayoutPaidInput {
  @Matches(DATE_ONLY, { message: 'Give the day it was paid.' })
  paidOn!: string;

  @IsInt()
  @Min(0)
  @Max(20_000_000)
  paidCents!: number;

  @IsEnum(ReimbursementMethod)
  how!: ReimbursementMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export type PayoutKind = 'expense' | 'cme';
