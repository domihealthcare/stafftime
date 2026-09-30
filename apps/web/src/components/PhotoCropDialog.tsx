import { useRef, useState } from 'react';
import { buttonClass } from './ui';
import { useDialog } from './useDialog';

/// Side of the square every photo is stored at. Sharp at twice the largest
/// avatar the app draws (96 px), and small enough to stay well under the
/// server's limit.
export const PHOTO_SIDE = 256;

/// The size of the picture area on screen. The photo is shown through a
/// circle, because that is how everybody else will see it.
const VIEW = 280;
const MAX_ZOOM = 4;

/// Reads a picture file into something the browser can draw. A data: URL
/// rather than a blob: one — the deployed CSP allows images from 'self' and
/// data: only, and loosening it for this is not worth it.
export async function readPicture(file: File): Promise<{ url: string; image: HTMLImageElement }> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('unreadable'));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('unreadable'));
    img.src = url;
  });
  return { url, image };
}

/// Where the picture sits in the frame: how far it is zoomed in (1 is just
/// filling the frame) and the position of its top-left corner, in frame pixels.
interface Framing {
  zoom: number;
  x: number;
  y: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/// The picture can be moved anywhere that still covers the whole frame — never
/// off an edge, so there is no blank corner to send.
function keepCovering(framing: Framing, scale: number, width: number, height: number): Framing {
  return {
    zoom: framing.zoom,
    x: clamp(framing.x, VIEW - width * scale, 0),
    y: clamp(framing.y, VIEW - height * scale, 0),
  };
}

/**
 * Draws what is in the frame to a 256 px JPEG, in the browser. Re-encoding
 * also drops everything a phone camera attaches to a photo — where it was taken
 * included — before it leaves the device.
 */
function frameToJpeg(image: HTMLImageElement, framing: Framing): string {
  const scale = (VIEW / Math.min(image.naturalWidth, image.naturalHeight)) * framing.zoom;
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIDE;
  canvas.height = PHOTO_SIDE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('unreadable');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PHOTO_SIDE, PHOTO_SIDE);
  context.drawImage(
    image,
    -framing.x / scale,
    -framing.y / scale,
    VIEW / scale,
    VIEW / scale,
    0,
    0,
    PHOTO_SIDE,
    PHOTO_SIDE,
  );
  for (const quality of [0.85, 0.7, 0.55]) {
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length < 180_000) return data;
  }
  return canvas.toDataURL('image/jpeg', 0.4);
}

/**
 * Lets somebody move and zoom their picture so it sits well in the circle
 * before it is saved: drag it (or use the arrow keys), and slide to zoom.
 * The picture never leaves the browser until they press the button.
 */
export function PhotoCropDialog({
  url,
  image,
  busy,
  onCancel,
  onSave,
}: {
  url: string;
  image: HTMLImageElement;
  busy: boolean;
  onCancel: () => void;
  onSave: (jpeg: string) => void;
}) {
  const dialog = useDialog(onCancel);
  const base = VIEW / Math.min(image.naturalWidth, image.naturalHeight);
  const [framing, setFraming] = useState<Framing>(() => ({
    zoom: 1,
    x: (VIEW - image.naturalWidth * base) / 2,
    y: (VIEW - image.naturalHeight * base) / 2,
  }));
  const drag = useRef<{ pointer: number; x: number; y: number; from: Framing } | null>(null);

  const scale = base * framing.zoom;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;

  function move(dx: number, dy: number, from: Framing = framing) {
    setFraming(
      keepCovering(
        { ...from, x: from.x + dx, y: from.y + dy },
        scale,
        image.naturalWidth,
        image.naturalHeight,
      ),
    );
  }

  /// Zooms about the middle of the frame, so what you are looking at stays put.
  function zoomTo(zoom: number) {
    const next = base * zoom;
    const centreX = (VIEW / 2 - framing.x) / scale;
    const centreY = (VIEW / 2 - framing.y) / scale;
    setFraming(
      keepCovering(
        { zoom, x: VIEW / 2 - centreX * next, y: VIEW / 2 - centreY * next },
        next,
        image.naturalWidth,
        image.naturalHeight,
      ),
    );
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const step = event.shiftKey ? 30 : 10;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const delta = arrows[event.key];
    if (!delta) return;
    event.preventDefault();
    move(delta[0], delta[1]);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
        data-testid="photo-crop"
        {...dialog}
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl ring-1 ring-slate-200"
      >
        <h2 id="crop-title" className="text-lg font-semibold text-slate-900">
          Fit your photo
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Drag the picture to move it, and slide to zoom. What is inside the circle is what
          colleagues will see.
        </p>

        <div
          role="group"
          tabIndex={0}
          aria-label="Photo position. Use the arrow keys to move the picture."
          onKeyDown={onKeyDown}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              from: framing,
            };
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.pointer !== event.pointerId) return;
            move(event.clientX - start.x, event.clientY - start.y, start.from);
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          style={{ width: VIEW, height: VIEW, touchAction: 'none' }}
          className="relative mx-auto mt-4 cursor-grab select-none overflow-hidden rounded-lg bg-slate-200 active:cursor-grabbing"
        >
          <img
            src={url}
            alt=""
            draggable={false}
            style={{ width, height, left: framing.x, top: framing.y }}
            className="pointer-events-none absolute max-w-none"
          />
          {/* The circle: clear inside, veiled outside. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white"
            style={{ boxShadow: '0 0 0 400px rgba(15, 23, 42, 0.55)' }}
          />
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="crop-zoom">
          Zoom
        </label>
        <input
          id="crop-zoom"
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={framing.zoom}
          onChange={(event) => zoomTo(Number(event.target.value))}
          className="w-full"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className={buttonClass('secondary', 'md')}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSave(frameToJpeg(image, framing))}
            className={buttonClass('primary', 'md')}
          >
            {busy ? 'Saving…' : 'Use this photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
