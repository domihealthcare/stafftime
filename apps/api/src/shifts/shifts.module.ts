import { Module } from '@nestjs/common';
import { CoverOptionsService } from './cover-options.service';
import { CoverRequestsController } from './cover-requests.controller';
import { CoverRequestsService } from './cover-requests.service';
import { PublishCheckService } from './publish-check.service';
import { OvertimeService } from './overtime.service';
import { ShiftPlanningService } from './shift-planning.service';
import { ShiftRetimeService } from './shift-retime.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  controllers: [ShiftsController, CoverRequestsController],
  providers: [
    ShiftsService,
    ShiftPlanningService,
    ShiftRetimeService,
    OvertimeService,
    CoverOptionsService,
    CoverRequestsService,
    PublishCheckService,
  ],
  exports: [ShiftsService, ShiftPlanningService, OvertimeService],
})
export class ShiftsModule {}
