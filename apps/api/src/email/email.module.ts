import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttentionController } from './attention.controller';
import { AttentionService } from './attention.service';
import { DigestService } from './digest.service';
import { EMAIL_SENDER, EmailSender } from './email-sender';
import { LogEmailSender } from './log-email.sender';
import { NotificationsService } from './notifications.service';
import { ResendEmailSender } from './resend-email.sender';

/// Which provider sends the mail. Chosen once, here.
///
/// Global because several features notify people — time off, password resets,
/// checklists — and none of them should have to import a module to say so.
@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmailSender => {
        const logger = new Logger('Email');
        const apiKey = config.get<string>('RESEND_API_KEY');
        const from = config.get<string>('EMAIL_FROM');

        if (apiKey && from) {
          logger.log(`Email: Resend, sending as ${from}`);
          return new ResendEmailSender(apiKey, from);
        }

        // Not an error locally, and impossible to miss in production: every
        // message logs a warning saying it was not sent.
        const isProduction = config.get<string>('NODE_ENV') === 'production';
        if (isProduction) {
          logger.warn(
            'No email provider configured (RESEND_API_KEY and EMAIL_FROM). Password resets and notifications will be written to this log instead of being sent.',
          );
        } else {
          logger.log('Email: written to this log (no provider configured)');
        }
        return new LogEmailSender(isProduction);
      },
    },
    NotificationsService,
    AttentionService,
    DigestService,
  ],
  controllers: [AttentionController],
  exports: [EMAIL_SENDER, NotificationsService, AttentionService, DigestService],
})
export class EmailModule {}
