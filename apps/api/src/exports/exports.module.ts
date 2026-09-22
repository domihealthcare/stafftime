import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageModule } from '../storage/storage.module';
import { ExportsController } from './exports.controller';
import { AdpTotalSourceExporter } from './payroll/adp-totalsource.exporter';
import { PAYROLL_EXPORTERS, PayrollExporter } from './payroll/payroll-exporter';
import { PayrollExportsService } from './payroll/payroll-exports.service';
import { SpreadsheetExporter } from './payroll/spreadsheet.exporter';
import { ReportPresetsService } from './report-presets.service';
import { TimesheetExportService } from './timesheet-export.service';

@Module({
  // The export file itself is kept through the same storage adapter as
  // checklist documents, so an export can be downloaded again byte for byte.
  imports: [StorageModule],
  controllers: [ExportsController],
  providers: [
    TimesheetExportService,
    ReportPresetsService,
    PayrollExportsService,
    {
      // The registry of payroll targets. Adding a provider is a class and one
      // line here — nothing in the timesheet logic changes.
      provide: PAYROLL_EXPORTERS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PayrollExporter[] => [
        new SpreadsheetExporter(),
        new AdpTotalSourceExporter(config),
      ],
    },
  ],
  exports: [TimesheetExportService, ReportPresetsService, PayrollExportsService],
})
export class ExportsModule {}
