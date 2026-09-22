import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ReportPresetsService } from './report-presets.service';
import { TimesheetExportService } from './timesheet-export.service';

@Module({
  controllers: [ExportsController],
  providers: [TimesheetExportService, ReportPresetsService],
  exports: [TimesheetExportService, ReportPresetsService],
})
export class ExportsModule {}
