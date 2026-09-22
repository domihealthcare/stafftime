import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage, EmailResult, EmailSender } from './email-sender';

const ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 8000;

/**
 * Sends through Resend's HTTP API.
 *
 * Deliberately `fetch` rather than an SDK: it is one POST with a bearer token,
 * and a dependency that wraps one POST is a dependency to keep up to date for
 * no benefit. It also keeps the serverless bundle small.
 *
 * HTTP rather than SMTP because the app runs as a serverless function, where
 * outbound SMTP is slow at best and blocked at worst.
 *
 * Never throws. A provider outage must not fail the thing the person was
 * actually doing.
 */
@Injectable()
export class ResendEmailSender implements EmailSender {
  private readonly logger = new Logger('Email');

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    // An unbounded wait would hold a serverless function open until it timed
    // out, so the request gets its own deadline.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        signal: abort.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });

      if (!response.ok) {
        // The body often says exactly what is wrong — an unverified sending
        // domain, usually — and that is worth having in the log.
        const detail = await response.text().catch(() => '');
        const reason = `${response.status} ${detail.slice(0, 300)}`.trim();
        this.logger.error(`Could not email ${message.to}: ${reason}`);
        return { delivered: false, reason };
      }

      this.logger.log(`Emailed ${message.to}: "${message.subject}"`);
      return { delivered: true };
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? `no answer within ${TIMEOUT_MS}ms`
          : error instanceof Error
            ? error.message
            : 'unknown error';
      this.logger.error(`Could not email ${message.to}: ${reason}`);
      return { delivered: false, reason };
    } finally {
      clearTimeout(timer);
    }
  }
}
