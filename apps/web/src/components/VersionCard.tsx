import { useEffect, useState } from 'react';
import { api, type AppConfig } from '../lib/api';
import { BUILD, releasedLabel, versionLabel } from '../lib/version';

/**
 * Which version of Domi Staff this is, and whether it is the one that is live.
 *
 * The version number and release time are baked in when the app is built. The server says which commit it is running; if that differs
 * from this page's, the tab was opened before the latest deploy and a reload
 * brings it up to date.
 */
export function VersionCard() {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .appConfig()
      .then((result) => !cancelled && setConfig(result))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Only comparable when both sides know their commit (Vercel says; a laptop
  // running the dev server may not).
  const stale = Boolean(config?.version && BUILD.commit && config.version !== BUILD.commit);

  return (
    <section
      aria-labelledby="help-version"
      data-testid="version-card"
      className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
    >
      <h2
        id="help-version"
        className="text-sm font-semibold uppercase tracking-wide text-slate-500"
      >
        About this version
      </h2>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-slate-700">
        <dt className="text-slate-500">Version</dt>
        <dd
          className="font-medium text-slate-900"
          data-testid="app-version"
          title={BUILD.commit ? `Build ${BUILD.commit}` : undefined}
        >
          {versionLabel().replace(/^Version /, '')}
        </dd>
        <dt className="text-slate-500">Released</dt>
        <dd data-testid="app-released">{releasedLabel()}</dd>
        {config && (
          <>
            <dt className="text-slate-500">Site</dt>
            <dd>
              {config.isTestEnvironment
                ? 'Test — for trying things out; hours here are not paid'
                : 'Live'}
            </dd>
          </>
        )}
      </dl>
      {stale ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-inset ring-amber-200">
          <span>A newer version is live.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
          >
            Reload to get it
          </button>
        </div>
      ) : (
        config?.version &&
        BUILD.commit && <p className="mt-3 text-emerald-700">✓ This is the latest version.</p>
      )}
    </section>
  );
}
