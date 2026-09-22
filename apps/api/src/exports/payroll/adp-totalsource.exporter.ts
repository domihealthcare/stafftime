import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayrollExporter, PayrollFile } from './payroll-exporter';

/**
 * ADP TotalSource.
 *
 * **Not finished, and deliberately not guessed at.** TotalSource is a PEO
 * product with no self-serve API for pushing timesheets, so the realistic path
 * is a CSV built to ADP's own column layout and pay codes. Three things are
 * needed before that layout can be written, and none of them can be inferred:
 *
 *  1. The Domi Healthcare client/company code.
 *  2. The earning codes ADP expects, so regular, overtime and paid leave land
 *     against the right ones.
 *  3. Confirmation of which file spec applies — TotalSource sometimes differs
 *     from standalone Run or Workforce Now.
 *
 * A guessed layout is worse than none: ADP rejects the file, or worse, accepts
 * it and pays the wrong codes. So this class exists, is registered, and says
 * what it is waiting for — a provider the practice is chasing is easier to
 * chase when the app names it on the screen where it would be used.
 *
 * When the details arrive, the work is this file and nothing else: the hours
 * arrive already aggregated.
 */
@Injectable()
export class AdpTotalSourceExporter implements PayrollExporter {
  readonly key = 'adp-totalsource';
  readonly label = 'ADP TotalSource';
  readonly description =
    'A CSV in ADP’s Time Sheet Import layout, ready to upload to TotalSource.';

  private readonly clientCode?: string;

  constructor(config: ConfigService) {
    this.clientCode = config.get<string>('ADP_CLIENT_CODE');
  }

  /// Becomes true the day somebody sets ADP_CLIENT_CODE *and* the layout below
  /// is written. The configuration check is here so the switch is one variable
  /// once the code exists.
  get available(): boolean {
    return false;
  }

  get unavailableReason(): string {
    return this.clientCode
      ? 'The ADP client code is configured, but the column layout and pay codes still have to be confirmed with ADP before this can be trusted.'
      : 'Waiting on ADP: the Domi Healthcare client code, the earning codes for regular, overtime and paid leave, and confirmation of which import layout TotalSource uses. Until then, use the spreadsheet.';
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async export(): Promise<PayrollFile> {
    // Refusing is the correct behaviour. A plausible-looking file that ADP
    // rejects wastes an afternoon; one it accepts against the wrong pay codes
    // pays people wrong.
    throw new ServiceUnavailableException(this.unavailableReason);
  }
}
