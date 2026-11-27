import { Module } from '@nestjs/common';
import { SecretSantaController } from './secret-santa.controller';
import { SecretSantaService } from './secret-santa.service';

@Module({
  controllers: [SecretSantaController],
  providers: [SecretSantaService],
})
export class SecretSantaModule {}
