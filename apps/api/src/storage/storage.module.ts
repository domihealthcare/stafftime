import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DatabaseFileStorage } from './database-file.storage';
import { FILE_STORAGE, FileStorage } from './file-storage';
import { LocalDiskFileStorage } from './local-disk-file.storage';

/// Which backend holds generated files. Chosen once, here, so nothing else
/// in the app knows or cares.
@Module({
  providers: [
    {
      provide: FILE_STORAGE,
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService): FileStorage => {
        const backend = config.get<string>('FILE_STORAGE') ?? 'database';

        if (backend === 'disk') {
          const dir = config.get<string>('FILE_STORAGE_DIR') ?? './var/uploads';
          new Logger('StorageModule').log(`File storage: local disk (${dir})`);
          return new LocalDiskFileStorage(dir);
        }

        new Logger('StorageModule').log('File storage: database');
        return new DatabaseFileStorage(prisma);
      },
    },
  ],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
