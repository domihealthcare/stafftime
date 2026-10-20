import { ArrayMaxSize, IsArray, IsBoolean, IsUUID } from 'class-validator';

export class ToolAccessInput {
  @IsBoolean()
  everyone!: boolean;

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  jobRoleIds!: string[];
}
