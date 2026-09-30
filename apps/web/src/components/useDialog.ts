import { useEffect, useRef, type KeyboardEvent } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What a pop-up needs to behave like one, for a keyboard or a screen reader:
 * focus moves into it when it opens, Tab stays inside it, Escape closes it, and
 * focus goes back to what opened it afterwards. `ConfirmDialog` does the same
 * for its two buttons.
 *
 * Spread the result on the element that has `role="dialog"`:
 * `const dialog = useDialog(onClose); <div role="dialog" {...dialog}>`
 */
export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  // Held in a ref so a parent that passes a fresh function each render does
  // not pull focus back to the first field on every keystroke.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    if (panel && !panel.contains(document.activeElement)) {
      const first = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
        (element) => element.getAttribute('aria-label') !== 'Close',
      );
      (first ?? panel).focus({ preventScroll: true });
    }
    return () => previous?.focus?.({ preventScroll: true });
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close.current();
      return;
    }
    if (event.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === ref.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { ref, onKeyDown, tabIndex: -1 };
}
