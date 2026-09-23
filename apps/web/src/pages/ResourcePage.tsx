import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Card, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import type { Resource } from '../lib/types';

/// One written page, on its own address so it can be sent to somebody.
export function ResourcePage() {
  const { id = '' } = useParams();
  const [resource, setResource] = useState<
    (Resource & { jobRole: { id: string; name: string } | null }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .resource(id)
      .then((row) => !cancelled && setResource(row))
      .catch(
        (cause) =>
          !cancelled &&
          setError(cause instanceof ApiError ? cause.message : 'Could not open that page.'),
      );
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/resources" className="text-sm font-medium text-brand-700 hover:text-brand-900">
        ← Resources
      </Link>

      <div className="mt-3">
        {error ? (
          <Alert>{error}</Alert>
        ) : !resource ? (
          <Spinner label="Opening" />
        ) : (
          <Card className="p-5">
            <article>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {resource.jobRole?.name ?? 'Everyone'}
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">{resource.title}</h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Updated {formatCalendarDate(resource.updatedAt)}
              </p>
              {resource.kind === 'LINK' && resource.url ? (
                <p className="mt-4">
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-700 underline"
                  >
                    Open {resource.title} ↗
                  </a>
                </p>
              ) : null}
              {resource.body && (
                <p className="mt-4 whitespace-pre-line text-slate-800">{resource.body}</p>
              )}
            </article>
          </Card>
        )}
      </div>
    </div>
  );
}
