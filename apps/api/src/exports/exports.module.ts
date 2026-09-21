import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { TimesheetExportService } from './timesheet-export.service';

@Module({
  controllers: [ExportsController],
  providers: [TimesheetExportService],
  exports: [TimesheetExportService],
})
export class ExportsModule {}
