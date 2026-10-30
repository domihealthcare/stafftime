// Calls in apps/web/src/lib/api.ts the contract check leaves out, each with
// the reason. Keep it short: a call on this list can drift from the server
// unnoticed. The generator fails on a name that is no longer in api.ts.

/// Functions a call may hand its answer through unchanged
/// (`request<T>(...).then(timeOffChanged)`).
export const PASS_THROUGH = ['timeOffChanged'];

/// Calls that do more than return `request(...)` but still hand back exactly
/// what it gave, so their return type is what the web reads the answer as.
export const SAME_ANSWER = {
  'api.appConfig': 'keeps the answer for a minute and hands back the same promise',
};

/// Calls checked for their shape but not for which values a string may take,
/// because the server's type allows values the web does not list. Each is a
/// known difference to settle; see the reason.
export const LOOSE_ENUMS = {};

export const NOT_CHECKED = {
  'api.downloadExport': 'a file download, fetched directly rather than through request()',
  'api.resourceFileUrl': 'builds a link for the browser to open, no request is made',
};
