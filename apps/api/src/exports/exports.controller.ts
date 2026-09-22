import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { SaveReportPresetDto, UpdateReportPresetDto } from './dto/report-preset.dto';
import { ReportPresetsService } from './report-presets.service';
import { DEFAULT_COLUMN_KEYS, TIMESHEET_COLUMNS } from './columns';
import { ExportTimesheetDto } from './dto/export-timesheet.dto';
import { PayrollExportsService } from './payroll/payroll-exports.service';
import { TimesheetExportService } from './timesheet-export.service';

@Controller('exports')
@Roles(Role.MANAGER)
export class ExportsController {
  constructor(
    private readonly timesheets: TimesheetExportService,
    private readonly presets: ReportPresetsService,
    private readonly payroll: PayrollExportsService,
  ) {}

  /// Where hours can be sent, including the targets that are not ready yet and
  /// why — a provider the practice is waiting on is easier to chase when the
  /// app names it.
  @Get('targets')
  targets() {
    return this.payroll.targets();
  }

  /// The column catalogue, so the export screen's checkboxes come from the
  /// server rather than a hand-maintained copy.
  @Get('columns')
  columns() {
    return {
      columns: TIMESHEET_COLUMNS,
      defaults: DEFAULT_COLUMN_KEYS,
    };
  }

  /// What the export would contain, without producing a file.
  @Post('timesheet/preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: ExportTimesheetDto) {
    return this.timesheets.preview(dto);
  }

  /**
   * Produces the file **and records what went out**.
   *
   * The brief asks for an export record so a run can be audited or repeated,
   * and this is the only route that produces one — there is no way to send
   * hours to payroll without leaving a trace of which hours they were.
   */
  @Post('timesheet')
  async timesheet(
    @Body() dto: ExportTimesheetDto,
    @CurrentUser() user: AuthUser,
    @Res() response: Response,
  ) {
    const { record, file } = await this.payroll.run(dto, dto.target ?? 'spreadsheet', user);

    response
      .status(HttpStatus.OK)
      .setHeader('Content-Type', file.contentType)
      .setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
      .setHeader('Content-Length', String(file.bytes.byteLength))
      // So the screen can show what was just recorded without asking again.
      .setHeader('X-Payroll-Export-Id', record.id)
      .send(file.bytes);
  }

  /// Every run, newest first.
  @Get('history')
  history() {
    return this.payroll.list();
  }

  /// The file exactly as it went out. Re-deriving it from today's data is the
  /// one thing an audit must not do.
  @Get('history/:id/file')
  async historyFile(@Param('id', ParseUUIDPipe) id: string, @Res() response: Response) {
    const file = await this.payroll.download(id);

    response
      .status(HttpStatus.OK)
      .setHeader('Content-Type', file.contentType)
      .setHeader('X-Content-Type-Options', 'nosniff')
      .setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
      .setHeader('Content-Length', String(file.bytes.byteLength))
      .send(file.bytes);
  }

  /// No longer the run that counts — superseded, or sent in error. The record
  /// and its file stay.
  @Post('history/:id/void')
  @HttpCode(HttpStatus.OK)
  voidExport(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.void(id, user);
  }

  // ------------------------------------------------------------- saved reports

  /// Your saved reports, plus any a colleague shared.
  @Get('presets')
  listPresets(@CurrentUser() user: AuthUser) {
    return this.presets.list(user);
  }

  @Post('presets')
  createPreset(@Body() dto: SaveReportPresetDto, @CurrentUser() user: AuthUser) {
    return this.presets.create(dto, user);
  }

  @Patch('presets/:id')
  updatePreset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReportPresetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.presets.update(id, dto, user);
  }

  @Delete('presets/:id')
  @HttpCode(HttpStatus.OK)
  deletePreset(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.presets.remove(id, user);
  }

  /// The stored options, re-validated, so the export screen can load a saved
  /// report into its form.
  @Get('presets/:id/options')
  presetOptions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.presets.resolveOptions(id, user);
  }
}

