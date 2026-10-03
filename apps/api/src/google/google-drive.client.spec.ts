import { GoogleProblem } from './google-auth.service';
import { DRIVE_SCOPE, GoogleDriveClient, MAX_FILE_BYTES } from './google-drive.client';

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function stream(text: string) {
  return new Response(text).body!;
}

/// A small Drive: Shared (the link's folder) › Forms › Intake.pdf, and a
/// folder somewhere else the robot can also see.
const FILES: Record<string, Record<string, unknown>> = {
  rootFolder1: { mimeType: 'application/vnd.google-apps.folder', name: 'Shared', parents: ['top'] },
  formsFolder: {
    mimeType: 'application/vnd.google-apps.folder',
    name: 'Forms',
    parents: ['rootFolder1'],
  },
  intakePdf1: {
    mimeType: 'application/pdf',
    name: 'Intake.pdf',
    size: '2048',
    parents: ['formsFolder'],
  },
  scriptsDoc: {
    mimeType: 'application/vnd.google-apps.document',
    name: 'Phone scripts',
    parents: ['rootFolder1'],
  },
  pageHtml01: { mimeType: 'text/html', name: 'page.html', size: '10', parents: ['rootFolder1'] },
  surveyForm: {
    mimeType: 'application/vnd.google-apps.form',
    name: 'Survey',
    parents: ['rootFolder1'],
  },
  trashedPdf: {
    mimeType: 'application/pdf',
    name: 'Old.pdf',
    trashed: true,
    parents: ['rootFolder1'],
  },
  otherPdf01: { mimeType: 'application/pdf', name: 'Pay.pdf', parents: ['otherFolder'] },
  otherFolder: {
    mimeType: 'application/vnd.google-apps.folder',
    name: 'Providers',
    parents: ['top'],
  },
};

function build() {
  const google = {
    hasKey: true,
    robotEmail: 'robot@example.iam.gserviceaccount.com',
    asRobot: jest.fn().mockResolvedValue('token-1'),
    call: jest.fn<Promise<Response>, [string, RequestInit?, number?]>(async (address) => {
      const url = new URL(address);
      if (url.pathname === '/drive/v3/files') {
        return reply(200, {
          files: [
            { id: 'formsFolder', name: 'Forms', mimeType: 'application/vnd.google-apps.folder' },
            {
              id: 'intakePdf1',
              name: 'Scripts.pdf',
              mimeType: 'application/pdf',
              size: '2048',
              modifiedTime: '2026-09-01T10:00:00.000Z',
            },
            { id: 'surveyForm', name: 'Survey', mimeType: 'application/vnd.google-apps.form' },
            {
              id: 'bigVideo01',
              name: 'Training.mp4',
              mimeType: 'video/mp4',
              size: String(MAX_FILE_BYTES + 1),
            },
          ],
        });
      }
      const [, id, action] =
        url.pathname.match(/^\/drive\/v3\/files\/([^/]+)(?:\/(export))?$/) ?? [];
      // Above the shared folder the robot sees nothing.
      if (!id || id === 'top' || !FILES[id]) {
        return reply(404, { error: { message: `File not found: ${id}.` } });
      }
      if (action === 'export' || url.searchParams.get('alt') === 'media') {
        return new Response(stream(`contents of ${id}`), { status: 200 });
      }
      return reply(200, { id, ...FILES[id] });
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { drive: new GoogleDriveClient(google as any), google };
}

describe('GoogleDriveClient', () => {
  it('reads as the robot itself, read-only, never as anybody at the practice', async () => {
    const { drive, google } = build();
    await drive.list('rootFolder1');
    expect(google.asRobot).toHaveBeenCalledWith(DRIVE_SCOPE);
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.readonly');
    const url = new URL(google.call.mock.calls[0][0]);
    expect(url.searchParams.get('q')).toBe("'rootFolder1' in parents and trashed = false");
  });

  it('lists folders first, and says which files the app can hand over', async () => {
    const { drive } = build();
    const files = await drive.list('rootFolder1');
    expect(files[0]).toMatchObject({ name: 'Forms', isFolder: true, canOpen: false });
    expect(files[1]).toMatchObject({ name: 'Scripts.pdf', canOpen: true });
    // A Google Form has no file to hand over, and a huge video would not
    // arrive within the API's 30 seconds.
    expect(files[2]).toMatchObject({ name: 'Survey', canOpen: false });
    expect(files[3]).toMatchObject({ name: 'Training.mp4', canOpen: false });
    // No Drive address to send anybody to: they would need access of their own.
    expect(files[0]).not.toHaveProperty('url');
  });

  it('asks Google once for a few minutes, not once per person', async () => {
    const { drive, google } = build();
    await drive.list('rootFolder1');
    await drive.list('rootFolder1');
    expect(google.call).toHaveBeenCalledTimes(1);
  });

  it('says what Google said when it cannot read the folder', async () => {
    const { drive, google } = build();
    google.call.mockResolvedValue(reply(404, { error: { message: 'File not found: 1AbC.' } }));
    await expect(drive.list('rootFolder1')).rejects.toThrow('File not found');
  });

  describe('inside', () => {
    it('finds a file in the folder, or in a folder inside it', async () => {
      const { drive } = build();
      await expect(drive.inside('rootFolder1', 'scriptsDoc')).resolves.toMatchObject({
        name: 'Phone scripts',
        canOpen: true,
      });
      await expect(drive.inside('rootFolder1', 'intakePdf1')).resolves.toMatchObject({
        name: 'Intake.pdf',
        size: 2048,
      });
      await expect(drive.inside('rootFolder1', 'formsFolder')).resolves.toMatchObject({
        isFolder: true,
      });
    });

    it('will not reach another folder the robot happens to see', async () => {
      // Shared for the Provider resources, say; a Front Desk link must not
      // open it by naming its file.
      const { drive } = build();
      await expect(drive.inside('rootFolder1', 'otherPdf01')).resolves.toBeNull();
      await expect(drive.inside('rootFolder1', 'otherFolder')).resolves.toBeNull();
      await expect(drive.inside('rootFolder1', 'missingFile')).resolves.toBeNull();
    });

    it('nor the folder itself, a binned file, or anything not shaped like a Drive id', async () => {
      const { drive, google } = build();
      await expect(drive.inside('rootFolder1', 'rootFolder1')).resolves.toBeNull();
      await expect(drive.inside('rootFolder1', 'trashedPdf')).resolves.toBeNull();
      google.call.mockClear();
      await expect(drive.inside('rootFolder1', '../../about')).resolves.toBeNull();
      expect(google.call).not.toHaveBeenCalled();
    });

    it('passes on anything but "not found", rather than calling it outside', async () => {
      const { drive, google } = build();
      google.call.mockResolvedValue(reply(500, { error: { message: 'Backend error' } }));
      await expect(drive.inside('rootFolder1', 'intakePdf1')).rejects.toBeInstanceOf(GoogleProblem);
    });
  });

  describe('open', () => {
    const read = (body: ReadableStream<Uint8Array>) => new Response(body).text();

    it('hands an ordinary file on as it is, shown in the browser', async () => {
      const { drive, google } = build();
      const file = await drive.open('intakePdf1');
      expect(file).toMatchObject({
        name: 'Intake.pdf',
        contentType: 'application/pdf',
        inline: true,
      });
      expect(await read(file.body)).toBe('contents of intakePdf1');
      const url = new URL(google.call.mock.calls.at(-1)![0]);
      expect(url.searchParams.get('alt')).toBe('media');
      // Longer than a listing gets: the timeout covers reading the file.
      expect(google.call.mock.calls.at(-1)![2]).toBeGreaterThan(10_000);
    });

    it('turns a Google document into a PDF', async () => {
      const { drive, google } = build();
      const file = await drive.open('scriptsDoc');
      expect(file).toMatchObject({
        name: 'Phone scripts.pdf',
        contentType: 'application/pdf',
        inline: true,
      });
      const url = new URL(google.call.mock.calls.at(-1)![0]);
      expect(url.pathname).toBe('/drive/v3/files/scriptsDoc/export');
      expect(url.searchParams.get('mimeType')).toBe('application/pdf');
    });

    it('never shows a page or a script at the app’s address — it is saved instead', async () => {
      const { drive } = build();
      await expect(drive.open('pageHtml01')).resolves.toMatchObject({
        contentType: 'application/octet-stream',
        inline: false,
      });
    });

    it('says what Google said when it will not hand the file over', async () => {
      const { drive, google } = build();
      google.call.mockImplementation(async (address: string) =>
        new URL(address).pathname.endsWith('/export')
          ? reply(403, { error: { message: 'This file is too large to be exported.' } })
          : reply(200, { id: 'scriptsDoc', ...FILES.scriptsDoc }),
      );
      await expect(drive.open('scriptsDoc')).rejects.toThrow('too large to be exported');
    });
  });
});
