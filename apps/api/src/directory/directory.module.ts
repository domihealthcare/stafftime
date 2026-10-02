import { Module } from '@nestjs/common';
import { DirectoryController } from './directory.controller';
import { DirectoryService } from './directory.service';
import { ExtensionsService } from './extensions.service';

@Module({
  controllers: [DirectoryController],
  providers: [DirectoryService, ExtensionsService],
})
export class DirectoryModule {}
