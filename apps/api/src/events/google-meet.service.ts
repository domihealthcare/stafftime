import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GoogleAuthService, GoogleProblem } from '../google/google-auth.service';

/// The one thing the app may do as the host account for Meet: create
/// meetings. Nothing in its calendar, mail or files.
export const MEET_SCOPE = 'https://www.googleapis.com/auth/meetings.space.created';

const SPACES_URL = 'https://meet.googleapis.com/v2/spaces';

/**
 * Creates Google Meet links for events (September 2026, Dominguez), hosted
 * by the practice's shared account (office@domihealthcare.com).
 *
 * A Google Cloud service account, allowed by the Workspace admin to act as
 * that one account for creating meetings (domain-wide delegation, one scope).
 * See docs/google-meet-setup.md and GoogleAuthService.
 *
 * Each meeting is "Open": anybody with the link joins without knocking.
 * Dominguez first asked for "Trusted" (practice accounts walk in, others
 * knock), then chose Open once it was clear most staff are on personal
 * Google accounts and would all have been left knocking.
 *
 * Off until both settings are present; the form only offers the tick box
 * when it is on, and a pasted link always works.
 */
@Injectable()
export class GoogleMeetService {
  private readonly logger = new Logger(GoogleMeetService.name);

  constructor(private readonly google: GoogleAuthService) {}

  get available(): boolean {
    return this.google.available;
  }

  /// A new Meet link, e.g. "https://meet.google.com/abc-defg-hij".
  async createLink(): Promise<string> {
    if (!this.google.available) {
      throw new BadRequestException(
        'Google Meet is not set up yet, so the app cannot make a link. Paste one instead.',
      );
    }
    try {
      const response = await this.google.call(SPACES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.google.asHost(MEET_SCOPE)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config: { accessType: 'OPEN' } }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        meetingUri?: string;
        error?: { message?: string };
      };
      if (!response.ok || !body.meetingUri?.startsWith('https://')) {
        this.logger.error(
          `Meet refused to create a meeting (${response.status}): ${body.error?.message ?? 'no reason given'}`,
        );
        throw new GoogleProblem(body.error?.message ?? 'no link came back');
      }
      this.logger.log(`Meet link created, hosted by ${this.google.host}`);
      return body.meetingUri;
    } catch (error) {
      if (!(error instanceof GoogleProblem)) throw error;
      const reason =
        error.reason === 'the Workspace admin has not allowed it yet'
          ? 'the Workspace admin has not allowed the app to create meetings yet'
          : error.reason;
      throw new BadGatewayException(
        `Google did not make a Meet link (${reason}). Nothing was saved — try again, or paste a link instead.`,
      );
    }
  }
}
