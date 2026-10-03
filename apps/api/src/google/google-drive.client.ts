import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuthService, GoogleProblem } from './google-auth.service';

/// Read-only, and only as the robot itself: it sees the folders shared with
/// the robot's own address (or with anyone with the link), and nothing else
/// of anybody's.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

const API = 'https://www.googleapis.com/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
const GOOGLE_APPS = 'application/vnd.google-apps.';
/// Long enough that a busy morning is not a call per person, short enough that
/// a file added to the folder shows up the same day without anybody asking.
const KEEP_MS = 5 * 60_000;

/// Google's own documents have no file to hand over; each comes as a PDF.
/// Forms, Sites, shortcuts and the like have no PDF and open only in Drive.
const AS_PDF = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
]);

/// What a browser is allowed to show rather than save. Anything else is handed
/// over to be saved, never shown: an HTML or SVG file shown at this site's
/// address could run as the app, signed in as whoever opened it.
const SHOWN = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'video/mp4',
  'audio/mpeg',
]);

/// The API answers within Vercel's 30 seconds, so a file is handed on whole in
/// well under that or not at all.
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const FILE_TIMEOUT_MS = 25_000;
/// Folders inside folders, at most. Deeper than anybody files things.
const MAX_DEPTH = 10;

/// The shape of a Drive file id, so nothing else reaches Google's address.
export const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

export interface DriveFile {
  id: string;
  name: string;
  isFolder: boolean;
  /// Whether the app can hand it over: false for a Google Form, a shortcut,
  /// or a file too large.
  canOpen: boolean;
  modifiedAt: string | null;
}

interface DriveMeta {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  size?: string;
  trashed?: boolean;
}

export interface DriveDownload {
  name: string;
  contentType: string;
  /// Shown in the browser, or saved.
  inline: boolean;
  body: ReadableStream<Uint8Array>;
}

/**
 * Lists what is in a Google Drive folder, for a Resources link that points at
 * one (Dominguez, September 2026), and hands its files on to whoever may see
 * the link (October 2026).
 *
 * The folder is shared with the robot alone, not "anyone with the link", and
 * staff open its files through the app — so nobody needs a Google account, and
 * joining or leaving the practice changes nothing in Drive. A file passes
 * through on its way to the browser and is never kept, which is what keeps it
 * inside *Data this app does not hold*.
 */
@Injectable()
export class GoogleDriveClient {
  private readonly logger = new Logger(GoogleDriveClient.name);
  private readonly kept = new Map<string, { at: number; files: DriveFile[] }>();
  private readonly folders = new Map<string, { at: number; meta: DriveMeta }>();

  constructor(private readonly google: GoogleAuthService) {}

  get available(): boolean {
    return this.google.hasKey;
  }

  /// The robot's address, for a manager to share a folder with.
  get robotEmail(): string | null {
    return this.google.robotEmail;
  }

  async list(folderId: string): Promise<DriveFile[]> {
    const kept = this.kept.get(folderId);
    if (kept && kept.at > Date.now() - KEEP_MS) return kept.files;

    const query = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,size,modifiedTime)',
      orderBy: 'folder,name',
      pageSize: '200',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    const body = await this.json<{
      files?: {
        id: string;
        name: string;
        mimeType: string;
        size?: string;
        modifiedTime?: string;
      }[];
    }>(`${API}?${query}`, `list folder ${folderId}`);
    const files = (body.files ?? []).map((file) => ({
      id: file.id,
      name: file.name,
      isFolder: file.mimeType === FOLDER,
      canOpen: file.mimeType !== FOLDER && canOpen(file),
      modifiedAt: file.modifiedTime ?? null,
    }));
    this.kept.set(folderId, { at: Date.now(), files });
    return files;
  }

  /**
   * The file, if it is somewhere inside the folder — found by walking up from
   * the file, never trusting the browser to say where it is. The robot may
   * well see other folders, shared for other job roles; this is what keeps a
   * link's files to the people who may see the link.
   */
  async inside(
    folderId: string,
    fileId: string,
  ): Promise<(DriveFile & { size: number | null }) | null> {
    if (!DRIVE_ID.test(fileId) || fileId === folderId) return null;
    try {
      const file = await this.meta(fileId);
      if (file.trashed) return null;
      let parents = file.parents ?? [];
      for (let depth = 0; depth < MAX_DEPTH && parents.length > 0; depth++) {
        if (parents.includes(folderId)) {
          return {
            id: file.id,
            name: file.name,
            isFolder: file.mimeType === FOLDER,
            canOpen: file.mimeType !== FOLDER && canOpen(file),
            modifiedAt: null,
            size: file.size ? Number(file.size) : null,
          };
        }
        // Since 2020 a Drive item has one parent.
        parents = (await this.meta(parents[0], true)).parents ?? [];
      }
      return null;
    } catch (error) {
      // Above the shared folder the robot sees nothing: Google says "not
      // found", and that is the answer.
      if (error instanceof GoogleProblem && (error.status === 404 || error.status === 403)) {
        return null;
      }
      throw error;
    }
  }

  /// The file's contents, for the browser — Google's own documents as a PDF.
  /// Only for a file `inside` has found.
  async open(fileId: string): Promise<DriveDownload> {
    const file = await this.meta(fileId);
    const asPdf = AS_PDF.has(file.mimeType);
    const url = asPdf
      ? `${API}/${encodeURIComponent(file.id)}/export?mimeType=application%2Fpdf`
      : `${API}/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
    const response = await this.google.call(
      url,
      { headers: { Authorization: `Bearer ${await this.google.asRobot(DRIVE_SCOPE)}` } },
      FILE_TIMEOUT_MS,
    );
    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      this.logger.warn(
        `Drive would not hand over file ${fileId}: ${body.error?.message ?? response.status}`,
      );
      throw new GoogleProblem(
        body.error?.message ?? `Google answered ${response.status}`,
        response.status,
      );
    }

    const contentType = asPdf ? 'application/pdf' : file.mimeType;
    const inline = SHOWN.has(contentType);
    return {
      name: asPdf && !/\.pdf$/i.test(file.name) ? `${file.name}.pdf` : file.name,
      contentType: inline ? contentType : 'application/octet-stream',
      inline,
      body: response.body,
    };
  }

  /// A file's name, kind and parent. Folders are kept for a few minutes, so
  /// opening a few files in a row walks up once.
  private async meta(id: string, isFolder = false): Promise<DriveMeta> {
    const kept = this.folders.get(id);
    if (kept && kept.at > Date.now() - KEEP_MS) return kept.meta;
    const query = new URLSearchParams({
      fields: 'id,name,mimeType,parents,size,trashed',
      supportsAllDrives: 'true',
    });
    const meta = await this.json<DriveMeta>(
      `${API}/${encodeURIComponent(id)}?${query}`,
      `read file ${id}`,
    );
    if (isFolder || meta.mimeType === FOLDER) this.folders.set(id, { at: Date.now(), meta });
    return meta;
  }

  private async json<T>(url: string, what: string): Promise<T> {
    const response = await this.google.call(url, {
      headers: { Authorization: `Bearer ${await this.google.asRobot(DRIVE_SCOPE)}` },
    });
    const body = (await response.json().catch(() => ({}))) as T & {
      error?: { message?: string };
    };
    if (!response.ok) {
      this.logger.warn(`Drive would not ${what}: ${body.error?.message ?? response.status}`);
      throw new GoogleProblem(
        body.error?.message ?? `Google answered ${response.status}`,
        response.status,
      );
    }
    return body;
  }
}

/// Whether the app can hand a file over: Google's documents as PDFs, any
/// ordinary file up to the size limit, and nothing Google keeps only for Drive.
function canOpen(file: { mimeType: string; size?: string }): boolean {
  if (file.mimeType.startsWith(GOOGLE_APPS)) return AS_PDF.has(file.mimeType);
  return !file.size || Number(file.size) <= MAX_FILE_BYTES;
}

/**
 * The folder id in a Drive folder address, or null for anything else:
 * https://drive.google.com/drive/folders/1AbC…, with or without /u/0/ and
 * anything after it.
 */
export function driveFolderIdOf(address: string | null | undefined): string | null {
  if (!address) return null;
  try {
    const url = new URL(address);
    if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') return null;
    const match = url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,})\/?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
