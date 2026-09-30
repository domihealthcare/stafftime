import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { DriveFolderListing } from '../lib/types';
import { Alert, Spinner } from './ui';

/// A Google Drive folder address, as the server reads it.
const DRIVE_FOLDER =
  /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/[A-Za-z0-9_-]{10,}\/?(?:[?#].*)?$/;

export const isDriveFolder = (url: string | null) => Boolean(url && DRIVE_FOLDER.test(url));

/**
 * What is in a shared Drive folder, under its Resources link (Dominguez,
 * September 2026). Each file opens in Drive; nothing is kept here. Fetched
 * when opened, not with the page, so Resources stays quick.
 */
export function DriveFolderFiles({ resourceId }: { resourceId: string }) {
  const [open, setOpen] = useState(false);
  const [listing, setListing] = useState<DriveFolderListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    if (listing) return;
    try {
      setListing(await api.resourceFiles(resourceId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not look in the folder.');
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : void show())}
        className="text-xs font-medium text-slate-600 hover:text-slate-900"
        aria-expanded={open}
      >
        {open ? 'Hide what’s in it' : 'Show what’s in it'}
      </button>
      {open && (
        <div className="mt-2" data-testid={`drive-files-${resourceId}`}>
          {error && <Alert>{error}</Alert>}
          {!listing && !error && <Spinner label="Looking in the folder" />}
          {listing?.status === 'ok' &&
            (listing.files.length === 0 ? (
              <p className="text-sm text-slate-500">The folder is empty.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {listing.files.map((file) => (
                  <li key={file.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span aria-hidden="true">{file.isFolder ? '📁' : '📄'}</span>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-brand-700 hover:text-brand-900"
                    >
                      {file.name}
                    </a>
                    {file.modifiedAt && (
                      <span className="shrink-0 text-xs text-slate-500">
                        {new Date(file.modifiedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ))}
          {listing?.status === 'off' && (
            <p className="text-sm text-slate-500">
              The app cannot look inside Drive folders yet. The link above opens it in Drive.
            </p>
          )}
          {listing?.status === 'unreadable' && (
            <p className="text-sm text-slate-600">
              The app cannot see into this folder. The link above still opens it in Drive.
              {listing.shareWith && (
                <>
                  {' '}
                  To list it here, set the folder to <strong>Anyone with the link</strong> in Drive,
                  or share it with <strong className="break-all">{listing.shareWith}</strong>.
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
