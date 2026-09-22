/**
 * The seam between "tell this person something" and "an email leaves the
 * building".
 *
 * Same shape as the payroll exporter and the file storage: one narrow
 * interface, a implementation per provider, and nothing else in the app knows
 * which one is in use. Adding SendGrid or SES later is one class.
 *
 * Sending is **best effort by contract**. A provider being down must never fail
 * the thing the person was actually doing — approving time off, resetting a
 * password — so callers do not await a guarantee and implementations log rather
 * than throw. An email that did not arrive is a nuisance; a time-off approval
 * that failed because a mail server hiccuped is a bug.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<EmailResult>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  /// Plain text is the message. Every mail client can read it, and it is what
  /// gets written first.
  text: string;
  /// Optional, and generated from the text. Nothing depends on it.
  html?: string;
}

export interface EmailResult {
  delivered: boolean;
  /// Why not, when not. Logged, never shown to the person who triggered it —
  /// "your reset email bounced" tells an attacker the address exists.
  reason?: string;
}

/// Nest injection token. An interface cannot be injected directly.
export const EMAIL_SENDER = 'EMAIL_SENDER';
