import { Module } from '@nestjs/common';
import { OvertimeService } from './overtime.service';
import { ShiftPlanningService } from './shift-planning.service';
import { ShiftRetimeService } from './shift-retime.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  controllers: [ShiftsController],
  providers: [ShiftsService, ShiftPlanningService, ShiftRetimeService, OvertimeService],
  exports: [ShiftsService, ShiftPlanningService, OvertimeService],
})
export class ShiftsModule {}
