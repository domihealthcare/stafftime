import { Module } from '@nestjs/common';
import { CredentialTypesController, CredentialsController } from './credentials.controller';
import { CredentialTypesService } from './credential-types.service';
import { CredentialsService } from './credentials.service';

@Module({
  controllers: [CredentialsController, CredentialTypesController],
  providers: [CredentialsService, CredentialTypesService],
  exports: [CredentialsService, CredentialTypesService],
})
export class CredentialsModule {}
