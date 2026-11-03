import { Module } from '@nestjs/common';
import { JobRolesModule } from '../job-roles/job-roles.module';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';

@Module({
  imports: [JobRolesModule],
  controllers: [SignaturesController],
  providers: [SignaturesService],
})
export class SignaturesModule {}
