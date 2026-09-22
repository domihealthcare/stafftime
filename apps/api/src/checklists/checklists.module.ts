import { Module } from '@nestjs/common';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';

@Module({
  controllers: [ChecklistsController],
  providers: [ChecklistsService, ChecklistTemplatesService],
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
