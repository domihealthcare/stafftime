import { Module } from '@nestjs/common';
import { ShiftPlanningService } from './shift-planning.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  controllers: [ShiftsController],
  providers: [ShiftsService, ShiftPlanningService],
  exports: [ShiftsService, ShiftPlanningService],
})
export class ShiftsModule {}
