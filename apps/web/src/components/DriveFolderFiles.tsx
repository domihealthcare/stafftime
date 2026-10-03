import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { DriveFolderListing } from '../lib/types';
import { Alert, Spinner } from './ui';

/// A Google Drive folder address, as the server reads it.
const DRIVE_FOLDER =
  /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/[A-Za-z0-9_-]{10,}\/?(?:[?#].*)?$/;

export const isDriveFolder = (url: string | null) => Boolean(url && DRIVE_FOLDER.test(url));

/**
 * What is in a Drive folder, under its Resources link (Dominguez, September
 * 2026). Since October 2026 each file opens through the app, in a new tab —
 * the folder is shared with the app alone, so nobody needs a Google account
 * or access of their own. A folder inside opens in place, here. Fetched when
 * shown, not with the page, so Resources stays quick.
 */
export function DriveFolderFiles({
  resourceId,
  folderId,
  fallbackUrl,
}: {
  resourceId: string;
  /// A folder inside the link's folder; left out for the folder itself.
  folderId?: string;
  /// The folder in Drive, offered only when the app cannot list it — a
  /// folder still shared "Anyone with the link" opens there.
  fallbackUrl?: string;
}) {
  const [listing, setListing] = useState<DriveFolderListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    api.resourceFiles(resourceId, folderId).then(
      (found) => live && setListing(found),
      (err) =>
        live && setError(err instanceof ApiError ? err.message : 'Could not look in the folder.'),
    );
    return () => {
      live = false;
    };
  }, [resourceId, folderId]);

  const toggle = (id: string) =>
    setOpenFolders((open) => {
      const next = new Set(open);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div data-testid={`drive-files-${folderId ?? resourceId}`}>
      {error && <Alert>{error}</Alert>}
      {!listing && !error && <Spinner label="Looking in the folder" />}
      {listing?.status === 'ok' &&
        (listing.files.length === 0 ? (
          <p className="text-sm text-slate-500">The folder is empty.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {listing.files.map((file) => (
              <li key={file.id} className="px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true">
                    {file.isFolder ? (openFolders.has(file.id) ? '📂' : '📁') : '📄'}
                  </span>
                  {file.isFolder ? (
                    <button
                      type="button"
                      onClick={() => toggle(file.id)}
                      aria-expanded={openFolders.has(file.id)}
                      className="min-w-0 flex-1 truncate text-left text-brand-700 hover:text-brand-900"
                    >
                      {file.name}
                    </button>
                  ) : file.canOpen ? (
                    <a
                      href={api.resourceFileUrl(resourceId, file.id, file.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-brand-700 hover:text-brand-900"
                    >
                      {file.name}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 text-slate-600">
                      <span className="block truncate">{file.name}</span>
                      <span className="block text-xs text-slate-500">
                        Opens only in Google Drive
                      </span>
                    </span>
                  )}
                  {file.modifiedAt && (
                    <span className="shrink-0 text-xs text-slate-500">
                      {new Date(file.modifiedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </div>
                {file.isFolder && openFolders.has(file.id) && (
                  <div className="mt-2 pl-4">
                    <DriveFolderFiles resourceId={resourceId} folderId={file.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}
      {listing?.status === 'off' && (
        <p className="text-sm text-slate-500">The app cannot look inside Drive folders yet.</p>
      )}
      {fallbackUrl && (listing?.status === 'off' || listing?.status === 'unreadable') && (
        <p className="mt-1 text-sm">
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 underline hover:text-brand-900"
          >
            Try it in Google Drive <span aria-hidden>↗</span>
          </a>
        </p>
      )}
      {listing?.status === 'unreadable' && (
        <p className="text-sm text-slate-600">
          The app cannot see into this folder.
          {listing.shareWith ? (
            <>
              {' '}
              In Drive, share the folder with{' '}
              <strong className="break-all">{listing.shareWith}</strong> as a Viewer. Staff do not
              need access themselves — they open the files here.
            </>
          ) : (
            ' A manager can fix that.'
          )}
        </p>
      )}
    </div>
  );
}
