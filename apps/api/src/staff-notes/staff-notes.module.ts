import { Module } from '@nestjs/common';
import { StaffNotesController } from './staff-notes.controller';
import { StaffNotesService } from './staff-notes.service';

@Module({
  controllers: [StaffNotesController],
  providers: [StaffNotesService],
})
export class StaffNotesModule {}
