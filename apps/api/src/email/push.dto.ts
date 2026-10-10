import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class PushKeysInput {
  @IsString()
  @MaxLength(200)
  p256dh!: string;

  @IsString()
  @MaxLength(100)
  auth!: string;
}

/// What a browser's `PushSubscription.toJSON()` gives, and a name for it.
export class PushSubscriptionInput {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushKeysInput)
  keys!: PushKeysInput;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  device?: string;
}

export class PushEndpointInput {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;
}
