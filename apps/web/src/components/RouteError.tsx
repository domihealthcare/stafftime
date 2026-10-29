import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import { t } from '../lib/i18n';
import { buttonClass } from './ui';

/**
 * What anybody sees when a screen crashes, instead of React Router's
 * developer page ("Unexpected Application Error!" and a stack trace, as staff
 * saw on 24 October 2026). Also what shows if a screen's code fails to load
 * after a release and the automatic reload in main.tsx has already been tried.
 *
 * Plain words, a Reload button (which fixes nearly all of it) and a way back
 * to the start: Home, or the time clock's own start on the tablet. The error
 * itself goes to the browser console for whoever looks into it, never onto
 * the screen.
 */
export function RouteError() {
  const error = useRouteError();
  useEffect(() => {
    console.error(error);
  }, [error]);

  const onTimeClock = window.location.pathname.startsWith('/kiosk');

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div
        role="alert"
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-slate-900">
          {t('Something went wrong on this screen')}
        </h1>
        <p className="mt-2 text-sm text-slate-700">
          {t(
            'Reloading the page usually fixes it. If it keeps happening, tell a manager what you were doing when it happened.',
          )}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={buttonClass('primary', 'md')}
          >
            {t('Reload')}
          </button>
          <a href={onTimeClock ? '/kiosk' : '/'} className={buttonClass('secondary', 'md')}>
            {onTimeClock ? t('Back to the time clock') : t('Go to Home')}
          </a>
        </div>
      </div>
    </main>
  );
}
