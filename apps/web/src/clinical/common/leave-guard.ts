import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from '../../components/ConfirmDialog';
import { setUnsavedWork } from '../../lib/unsaved-work';

/**
 * A clinical form is saved nowhere, so leaving it loses it. While `dirty`,
 * every way out asks first: closing the tab or reloading (the browser asks,
 * in its own words), a link or the Back button (the app's own pop-up), and
 * signing out (the account menu reads `setUnsavedWork`). `what` finishes
 * "Sign out and lose …".
 */
export function useLeaveGuard(dirty: boolean, what: string) {
  const confirm = useConfirm();

  useEffect(() => {
    setUnsavedWork(dirty ? what : null);
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, what]);
  useEffect(() => () => setUnsavedWork(null), []);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let live = true;
    void confirm({
      title: 'Leave and lose what you have entered?',
      body: 'This form is not saved anywhere. If you leave, everything on it is cleared and cannot be got back.',
      confirmLabel: 'Leave and clear it',
      cancelLabel: 'Stay on the form',
      tone: 'danger',
    }).then((leave) => {
      if (!live) return;
      if (leave) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      live = false;
    };
  }, [blocker, confirm]);
}

/// Hands the file to the browser as a download. It never leaves the device:
/// the link points at the bytes in this page's memory.
export function savePdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Long enough for a slow phone to start the download; the page's memory
  // is the only place the file is held either way.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
