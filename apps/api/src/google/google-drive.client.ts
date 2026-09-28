import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuthService, GoogleProblem } from './google-auth.service';

/// Read-only, and only as the robot itself: it sees the folders shared with
/// "anyone with the link" or with the robot's own address, and nothing else
/// of anybody's.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

const API = 'https://www.googleapis.com/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
/// Long enough that a busy morning is not a call per person, short enough that
/// a file added to the folder shows up the same day without anybody asking.
const KEEP_MS = 5 * 60_000;

export interface DriveFile {
  id: string;
  name: string;
  isFolder: boolean;
  /// Where it opens, in Drive.
  url: string;
  modifiedAt: string | null;
}

/**
 * Lists what is in a Google Drive folder, for a Resources link that points at
 * one (Dominguez, September 2026). The files stay in Drive — the app keeps
 * nothing, which is what keeps it inside *Data this app does not hold*; staff
 * open each one in Drive, and the folder being "anyone with the link" is what
 * lets them, whatever Google account they use.
 */
@Injectable()
export class GoogleDriveClient {
  private readonly logger = new Logger(GoogleDriveClient.name);
  private readonly kept = new Map<string, { at: number; files: DriveFile[] }>();

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
      fields: 'files(id,name,mimeType,webViewLink,modifiedTime)',
      orderBy: 'folder,name',
      pageSize: '200',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    const response = await this.google.call(`${API}?${query}`, {
      headers: { Authorization: `Bearer ${await this.google.asRobot(DRIVE_SCOPE)}` },
    });
    const body = (await response.json().catch(() => ({}))) as {
      files?: {
        id: string;
        name: string;
        mimeType: string;
        webViewLink?: string;
        modifiedTime?: string;
      }[];
      error?: { message?: string };
    };
    if (!response.ok) {
      this.logger.warn(
        `Drive would not list folder ${folderId}: ${body.error?.message ?? response.status}`,
      );
      throw new GoogleProblem(
        body.error?.message ?? `Google answered ${response.status}`,
        response.status,
      );
    }
    const files = (body.files ?? []).map((file) => ({
      id: file.id,
      name: file.name,
      isFolder: file.mimeType === FOLDER,
      url:
        file.webViewLink && file.webViewLink.startsWith('https://')
          ? file.webViewLink
          : `https://drive.google.com/open?id=${encodeURIComponent(file.id)}`,
      modifiedAt: file.modifiedTime ?? null,
    }));
    this.kept.set(folderId, { at: Date.now(), files });
    return files;
  }
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
