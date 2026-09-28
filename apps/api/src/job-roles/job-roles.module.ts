import { Module } from '@nestjs/common';
import { GoogleDriveClient } from '../google/google-drive.client';
import { GoogleModule } from '../google/google.module';
import { JobRolesController } from './job-roles.controller';
import { JobRolesService } from './job-roles.service';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';

@Module({
  imports: [GoogleModule],
  controllers: [JobRolesController, ResourcesController],
  providers: [JobRolesService, ResourcesService, GoogleDriveClient],
  exports: [JobRolesService],
})
export class JobRolesModule {}
