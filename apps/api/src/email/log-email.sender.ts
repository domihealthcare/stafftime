import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage, EmailResult, EmailSender } from './email-sender';

/**
 * Writes the email to the server log instead of sending it.
 *
 * This is the default, and it is the right default: sending real mail needs an
 * account, a verified sending domain and DNS records, none of which should be a
 * prerequisite for running the app locally. A developer testing a password
 * reset copies the link out of the terminal.
 *
 * It is also what a deployment falls back to if no provider is configured -
 * loudly, with a warning on every message, so a silent non-delivery in
 * production is impossible to mistake for success. In production it logs who
 * the message was for and its subject, never the words: those carry working
 * password-reset and welcome links, and the hosting logs are not the place
 * for them (maintenance pass, October 2026).
 */
@Injectable()
export class LogEmailSender implements EmailSender {
  private readonly logger = new Logger('Email');

  /// `isProduction`: warn on every message, and leave the words out.
  constructor(private readonly isProduction = false) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    if (this.isProduction) {
      this.logger.warn(
        `No email provider is configured, so this was not sent to ${message.to}: "${message.subject}"`,
      );
      return { delivered: false, reason: 'no email provider configured' };
    }

    this.logger.log(
      [
        '',
        '──────── email (not sent) ────────',
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        '',
        message.text,
        '──────────────────────────────────',
      ].join('\n'),
    );

    return { delivered: false, reason: 'no email provider configured' };
  }
}
