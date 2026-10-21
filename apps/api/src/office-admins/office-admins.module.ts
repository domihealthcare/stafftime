import { Module } from '@nestjs/common';
import { OfficeAdminsController } from './office-admins.controller';
import { OfficeAdminsService } from './office-admins.service';

@Module({
  controllers: [OfficeAdminsController],
  providers: [OfficeAdminsService],
})
export class OfficeAdminsModule {}
