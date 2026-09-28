import { DRIVE_SCOPE, GoogleDriveClient } from './google-drive.client';

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function build() {
  const google = {
    hasKey: true,
    robotEmail: 'robot@example.iam.gserviceaccount.com',
    asRobot: jest.fn().mockResolvedValue('token-1'),
    call: jest.fn().mockResolvedValue(
      reply(200, {
        files: [
          {
            id: 'd1',
            name: 'Forms',
            mimeType: 'application/vnd.google-apps.folder',
            webViewLink: 'https://drive.google.com/drive/folders/d1',
          },
          {
            id: 'f1',
            name: 'Scripts.pdf',
            mimeType: 'application/pdf',
            webViewLink: 'javascript:alert(1)',
            modifiedTime: '2026-09-01T10:00:00.000Z',
          },
        ],
      }),
    ),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { drive: new GoogleDriveClient(google as any), google };
}

describe('GoogleDriveClient', () => {
  it('reads as the robot itself, read-only, never as anybody at the practice', async () => {
    const { drive, google } = build();
    await drive.list('1AbCdEfGhIjKlMnOp');
    expect(google.asRobot).toHaveBeenCalledWith(DRIVE_SCOPE);
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.readonly');
    const url = new URL(google.call.mock.calls[0][0]);
    expect(url.searchParams.get('q')).toBe("'1AbCdEfGhIjKlMnOp' in parents and trashed = false");
  });

  it('lists folders first, and only ever links out to Drive', async () => {
    const { drive } = build();
    const files = await drive.list('1AbCdEfGhIjKlMnOp');
    expect(files[0]).toMatchObject({ name: 'Forms', isFolder: true });
    // A link that is not a web address is replaced with Drive's own.
    expect(files[1].url).toBe('https://drive.google.com/open?id=f1');
  });

  it('asks Google once for a few minutes, not once per person', async () => {
    const { drive, google } = build();
    await drive.list('1AbCdEfGhIjKlMnOp');
    await drive.list('1AbCdEfGhIjKlMnOp');
    expect(google.call).toHaveBeenCalledTimes(1);
  });

  it('says what Google said when it cannot read the folder', async () => {
    const { drive, google } = build();
    google.call.mockResolvedValue(reply(404, { error: { message: 'File not found: 1AbC.' } }));
    await expect(drive.list('1AbCdEfGhIjKlMnOp')).rejects.toThrow('File not found');
  });
});
