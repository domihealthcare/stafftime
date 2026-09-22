import { Module } from '@nestjs/common';
import { JobRolesController } from './job-roles.controller';
import { JobRolesService } from './job-roles.service';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';

@Module({
  controllers: [JobRolesController, ResourcesController],
  providers: [JobRolesService, ResourcesService],
  exports: [JobRolesService],
})
export class JobRolesModule {}
