/// The password rule, as the server applies it (see PasswordService): at least
/// 8 characters, including a number. Chosen by Dominguez, September 2026.
///
/// The screens use this only to say "not yet" before a request is sent. The
/// server still decides — it also refuses the obvious guesses ("password1",
/// your own name, the practice's name), which no hint here tries to mirror.
export const PASSWORD_RULE = 'At least 8 characters, including a number.';

export function meetsPasswordRule(password: string): boolean {
  return password.length >= 8 && /[0-9]/.test(password);
}
