import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ChecklistDocumentsService } from './checklist-documents.service';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';

@Module({
  imports: [StorageModule],
  controllers: [ChecklistsController],
  providers: [ChecklistsService, ChecklistTemplatesService, ChecklistDocumentsService],
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
