import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../common/auth/roles.decorator';
import { DEFAULT_COLUMN_KEYS, TIMESHEET_COLUMNS } from './columns';
import { ExportTimesheetDto } from './dto/export-timesheet.dto';
import { TimesheetExportService } from './timesheet-export.service';
import { buildTimesheetCsv, buildTimesheetWorkbook } from './workbook';

@Controller('exports')
@Roles(Role.MANAGER)
export class ExportsController {
  constructor(private readonly timesheets: TimesheetExportService) {}

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
