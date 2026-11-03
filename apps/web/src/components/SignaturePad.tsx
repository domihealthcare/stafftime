import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { buttonClass } from './ui';

/**
 * Draw a signature with a finger, a pen or the mouse (November 2026), for a
 * provider's saved signature. Gives back a PNG of the ink alone: cropped to
 * what was drawn, on a clear background, so it sits on a form like ink.
 */

/// The drawing area, in CSS pixels; the canvas is drawn sharper.
const WIDTH = 600;
const HEIGHT = 200;
/// The largest a saved signature is, in pixels. The server takes up to 1200.
const MOST_WIDTH = 900;
const INK = '#0d0d1a';

/// The canvas's ink cropped to what was drawn, with a little room round it,
/// as a PNG data: URL, or null when nothing was.
export function inkOnly(canvas: HTMLCanvasElement): string | null {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > 16) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  const room = 8;
  left = Math.max(0, left - room);
  top = Math.max(0, top - room);
  right = Math.min(width - 1, right + room);
  bottom = Math.min(height - 1, bottom + room);
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  const shrink = Math.min(1, MOST_WIDTH / cropWidth, 600 / cropHeight);
  const out = document.createElement('canvas');
  // At least what the server asks for, however small the scribble.
  out.width = Math.max(40, Math.round(cropWidth * shrink));
  out.height = Math.max(16, Math.round(cropHeight * shrink));
  out
    .getContext('2d')
    ?.drawImage(canvas, left, top, cropWidth, cropHeight, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

export function SignaturePad({
  onSave,
  onCancel,
  saving,
}: {
  onSave: (image: string) => void;
  onCancel?: () => void;
  saving?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = WIDTH * ratio;
    element.height = HEIGHT * ratio;
    const context = element.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = INK;
    context.lineWidth = 2.6;
  }, []);

  const pointAt = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * WIDTH,
      y: ((event.clientY - box.top) / box.height) * HEIGHT,
    };
  };

  const stroke = (to: { x: number; y: number }) => {
    const context = canvas.current?.getContext('2d');
    const from = last.current;
    if (!context || !from) return;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    last.current = to;
  };

  const clear = () => {
    const element = canvas.current;
    element?.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT);
    setDrawn(false);
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-slate-300 bg-white">
        <canvas
          ref={canvas}
          aria-label="Draw your signature here"
          className="block w-full touch-none"
          style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            last.current = pointAt(event);
            // A dot for a tap.
            stroke({ x: last.current.x + 0.1, y: last.current.y + 0.1 });
            setDrawn(true);
          }}
          onPointerMove={(event) => {
            if (last.current) stroke(pointAt(event));
          }}
          onPointerUp={() => {
            last.current = null;
          }}
          onPointerCancel={() => {
            last.current = null;
          }}
        />
        <div className="pointer-events-none absolute inset-x-8 bottom-10 border-b border-dashed border-slate-300" />
        {!drawn && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Sign here with your finger, a pen or the mouse
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass('primary', 'sm')}
          disabled={!drawn || saving}
          onClick={() => {
            const image = canvas.current ? inkOnly(canvas.current) : null;
            if (image) onSave(image);
          }}
        >
          {saving ? 'Saving…' : 'Save this signature'}
        </button>
        <button type="button" className={buttonClass('secondary', 'sm')} onClick={clear}>
          Clear
        </button>
        {onCancel && (
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
