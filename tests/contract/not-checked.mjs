// Calls in apps/web/src/lib/api.ts the contract check leaves out, each with
// the reason. Keep it short: a call on this list can drift from the server
// unnoticed. The generator fails on a name that is no longer in api.ts.

/// Functions a call may hand its answer through unchanged
/// (`request<T>(...).then(timeOffChanged)`).
export const PASS_THROUGH = ['timeOffChanged'];

const REVIEW_360_KINDS =
  'a 360 question is RATING or TEXT on the web, but the server keeps it as a ' +
  'SurveyQuestionKind and Review360QuestionDto accepts CHOICE too (the web never sends it); ' +
  "a CHOICE question would be reported as kind CHOICE with a TEXT question's fields.";

/// Calls that do more than return `request(...)` but still hand back exactly
/// what it gave, so their return type is what the web reads the answer as.
export const SAME_ANSWER = {
  'api.appConfig': 'keeps the answer for a minute and hands back the same promise',
};

/// Calls checked for their shape but not for which values a string may take,
/// because the server's type allows values the web does not list. Each is a
/// known difference to settle; see the reason.
export const LOOSE_ENUMS = {
  'api.review360Starter': REVIEW_360_KINDS,
  'api.createReview360': REVIEW_360_KINDS,
  'api.review360': REVIEW_360_KINDS,
  'api.review360Report': REVIEW_360_KINDS,
};

export const NOT_CHECKED = {
  'api.downloadExport': 'a file download, fetched directly rather than through request()',
  'api.resourceFileUrl': 'builds a link for the browser to open, no request is made',
};
