/**
 * What a value becomes on its way from the API to the browser, as types.
 *
 * Nest sends a controller's answer through `JSON.stringify` (no serializer
 * or interceptor changes it; see apps/api/src/configure-app.ts), so:
 * - anything with a `toJSON` arrives as what that returns: a `Date` as an ISO
 *   string, a Prisma `Decimal` as a string;
 * - a property whose value is `undefined` is left out, which the web reads
 *   as an optional property (the same thing under `strict`);
 * - arrays and plain objects are walked into.
 */
export type Json<T> = T extends { toJSON(): infer R }
  ? R
  : T extends readonly (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: K extends keyof WrittenOnlyAs ? Only<Json<T[K]>, K> : Json<T[K]> }
      : T;

/**
 * Columns kept as a plain `String` in the database that the server only ever
 * writes with these values (its input is checked), so the web may read them
 * as the narrower type. By property name, so keep it to names that mean one
 * thing everywhere.
 */
interface WrittenOnlyAs {
  /// Employee.language: `@IsIn(['en', 'es'])` on Your profile, "en" by default.
  language: 'en' | 'es';
}

/// `T` with its `string` part read as the values in `WrittenOnlyAs`.
type Only<T, K extends keyof WrittenOnlyAs> = [Extract<T, string>] extends [never]
  ? T
  : Exclude<T, string> | WrittenOnlyAs[K];

/// The type the web reads a call's answer as.
export type Reads<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;

/// What the controller method serving it really sends. A method typed `any`
/// would pass every check without anyone noticing, so it becomes a message
/// that fails instead.
export type Answer<F extends (...args: never[]) => unknown> = 0 extends 1 & Awaited<ReturnType<F>>
  ? 'The controller method returns any, so the contract cannot check it: give it a type.'
  : Json<Awaited<ReturnType<F>>>;

/**
 * Fails to compile unless what the server sends (`Sent`) is something the web
 * can take as its type (`WebReads`). Extra properties the server sends are
 * fine; a property the web expects and the server does not send, a `null` the
 * web does not allow, a string where the web wants a number, an enum value the
 * web does not list: each is an error. A web call typed `void` reads nothing,
 * so anything matches it.
 */
export type Matches<WebReads, Sent extends ([WebReads] extends [void] ? unknown : WebReads)> = Sent;

/**
 * For a call listed in LOOSE_ENUMS (tests/contract/not-checked.mjs): every
 * string read as `string`, so the shape is still checked (every property
 * there, `null` where it may be, numbers as numbers) but not which values a
 * string may take.
 */
export type Loose<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Loose<U>[]
    : T extends object
      ? { [K in keyof T]: Loose<T[K]> }
      : T;
