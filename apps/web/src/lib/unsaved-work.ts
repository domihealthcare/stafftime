/**
 * A screen with work that exists nowhere else — the clinical form, which is
 * never saved — says so here, so that signing out can ask first. Leaving by a
 * link, the Back button or closing the tab is caught on the screen itself;
 * signing out is not a navigation, so it needs telling.
 */
let unsaved: string | null = null;

/// What would be lost ("the cognitive assessment you are filling in"), or null.
export function setUnsavedWork(what: string | null) {
  unsaved = what;
}

export function unsavedWork(): string | null {
  return unsaved;
}
