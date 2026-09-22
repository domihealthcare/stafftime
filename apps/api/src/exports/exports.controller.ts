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
import { TimesheetExportService } from './timesheet-export.service';
import { buildTimesheetCsv, buildTimesheetWorkbook } from './workbook';

@Controller('exports')
@Roles(Role.MANAGER)
export class ExportsController {
  constructor(
    private readonly timesheets: TimesheetExportService,
    private readonly presets: ReportPresetsService,
  ) {}

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

  @Post('timesheet')
  async timesheet(@Body() dto: ExportTimesheetDto, @Res() response: Response) {
    const data = await this.timesheets.build(dto);
    const filename = buildFilename(dto, data.meta.locationName);

    if (dto.format === 'csv') {
      response
        .status(HttpStatus.OK)
        .setHeader('Content-Type', 'text/csv; charset=utf-8')
        .setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`)
        // Excel needs the BOM to read UTF-8 in a CSV correctly.
        .send(`﻿${buildTimesheetCsv(data)}`);
      return;
    }

    const workbook = await buildTimesheetWorkbook(data);
    response
      .status(HttpStatus.OK)
      .setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
      .setHeader('Content-Length', String(workbook.byteLength))
      .send(workbook);
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

/// A filename someone can find again in six months.
function buildFilename(dto: ExportTimesheetDto, locationName: string | null): string {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  const parts = ['domi-timesheet', dto.from.slice(0, 10), 'to', dto.to.slice(0, 10)];
  if (locationName) {
    parts.push(slug(locationName));
  }
  return parts.join('_');
}
