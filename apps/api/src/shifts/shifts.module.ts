import { Module } from '@nestjs/common';
import { CoverOptionsService } from './cover-options.service';
import { PublishCheckService } from './publish-check.service';
import { OvertimeService } from './overtime.service';
import { ShiftPlanningService } from './shift-planning.service';
import { ShiftRetimeService } from './shift-retime.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  controllers: [ShiftsController],
  providers: [
    ShiftsService,
    ShiftPlanningService,
    ShiftRetimeService,
    OvertimeService,
    CoverOptionsService,
    PublishCheckService,
  ],
  exports: [ShiftsService, ShiftPlanningService, OvertimeService],
})
export class ShiftsModule {}
