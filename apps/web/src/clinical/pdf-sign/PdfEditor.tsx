import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { useConfirm } from '../../components/ConfirmDialog';
import { Alert, Card, buttonClass } from '../../components/ui';
import { savePdf, useLeaveGuard } from '../common/leave-guard';
import {
  BASELINE,
  LINE_HEIGHT,
  keepOnPage,
  signedName,
  todayForForm,
  type PageShape,
} from './geometry';
import { drawPage, openPdf, shapesOf, UnopenablePdf } from './render';
import { TICK_PATH, UnreadablePdf, writePdf, type Placed, type PlacedText } from './write';

/**
 * Fill and sign a PDF (November 2026, Dominguez: "upload pdf's and write text
 * and put signature stamps and then download it (it would have PHI)").
 *
 * The PDF is opened from this computer into this page's memory, filled in
 * here and downloaded from here. It is never sent anywhere and never kept:
 * like the clinical forms, nothing in this folder may talk to the server or
 * store anything (the lint rules on `src/clinical/` hold it to that). Close
 * the tab and it is gone.
 *
 * The one thing that does come from the server is a provider's signature,
 * and that comes from the page around this (`stamps`), behind the PIN; this
 * only places the picture it is given.
 */

/// Big enough for any form; a phone would struggle past it.
const MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_TEXT_SIZE = 11;
const TEXT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24];
const TICK_SIZE = 14;
/// A signature's width when it is first put down, in points (about 2 inches).
const STAMP_WIDTH = 150;
const FONT = 'Helvetica, Arial, sans-serif';

export interface StampImage {
  image: string;
  /// Whose, as it reads before "signature": "your", "Dr. Lee’s".
  label: string;
  /// Width over height.
  ratio: number;
}

type Placing =
  { kind: 'text' } | { kind: 'date' } | { kind: 'tick' } | ({ kind: 'stamp' } & StampImage);

interface OpenFile {
  name: string;
  bytes: Uint8Array;
  document: PDFDocumentProxy;
  shapes: PageShape[];
}

let nextId = 0;
const newId = () => `placed-${(nextId += 1)}`;

/// A measuring canvas, for how wide typed text is.
let measurer: CanvasRenderingContext2D | null = null;
function textWidth(text: string, size: number): number {
  measurer ??= document.createElement('canvas').getContext('2d');
  if (!measurer) return text.length * size * 0.55;
  measurer.font = `${size}px ${FONT}`;
  return Math.max(...text.split('\n').map((line) => measurer!.measureText(line).width));
}

const textHeight = (item: PlacedText) => item.text.split('\n').length * LINE_HEIGHT * item.size;

export function PdfEditor({
  stamps,
  intro,
}: {
  /// The signature choices, given a way to put one down. Rendered in the
  /// toolbar once a PDF is open.
  stamps?: (place: (stamp: StampImage) => void) => ReactNode;
  /// Shown above the file chooser.
  intro?: ReactNode;
}) {
  const confirm = useConfirm();
  const [file, setFile] = useState<OpenFile | null>(null);
  const [items, setItems] = useState<Placed[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const chooser = useRef<HTMLInputElement>(null);

  useLeaveGuard(file !== null, 'the PDF you are filling in');

  // The document goes when the page does, or another is opened.
  useEffect(() => () => void file?.document.loadingTask.destroy(), [file]);

  const open = async (chosen: File) => {
    setError(null);
    if (chosen.size > MAX_BYTES) {
      setError('That file is too large to open here (over 50 MB).');
      return;
    }
    if (file && items.length) {
      const ok = await confirm({
        title: 'Open another PDF?',
        body: 'What you have added to this one is not saved anywhere. Download it first if you need it.',
        confirmLabel: 'Open the other one',
        cancelLabel: 'Keep this one',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusy('Opening the PDF…');
    try {
      const bytes = new Uint8Array(await chosen.arrayBuffer());
      // Writing into it needs pdf-lib to read it too: a locked PDF shows,
      // but cannot be written into, so it is turned away now, not after.
      try {
        await PDFDocument.load(bytes, { updateMetadata: false });
      } catch (cause) {
        throw new UnopenablePdf(
          cause instanceof Error && /encrypt/i.test(cause.message)
            ? 'This PDF is locked against changes, so it cannot be filled in here. Ask whoever sent it for an unlocked copy.'
            : 'This file could not be opened as a PDF.',
        );
      }
      const document = await openPdf(bytes);
      const shapes = await shapesOf(document);
      setFile({ name: chosen.name, bytes, document, shapes });
      setItems([]);
      setSelected(null);
      setPlacing(null);
    } catch (cause) {
      setError(cause instanceof UnopenablePdf ? cause.message : 'This file could not be opened.');
    } finally {
      setBusy(null);
    }
  };

  const choose = (files: FileList | null) => {
    const chosen = files?.[0];
    if (chosen) void open(chosen);
    if (chooser.current) chooser.current.value = '';
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    choose(event.dataTransfer.files);
  };

  const update = useCallback((id: string, change: Partial<Placed>) => {
    setItems((now) =>
      now.map((item) => (item.id === id ? ({ ...item, ...change } as Placed) : item)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((now) => now.filter((item) => item.id !== id));
    setSelected((now) => (now === id ? null : now));
  }, []);

  const place = (page: number, x: number, y: number) => {
    if (!file || !placing) return;
    const shape = file.shapes[page];
    let item: Placed;
    if (placing.kind === 'text' || placing.kind === 'date') {
      const text = placing.kind === 'date' ? todayForForm() : '';
      // The click is where the writing starts: the middle of its first line.
      const size = DEFAULT_TEXT_SIZE;
      const at = keepOnPage(shape, x, y - (BASELINE * size) / 2 - 2, textWidth(text, size), 0);
      item = { id: newId(), page, kind: 'text', x: at.x, y: at.y, size, text };
    } else if (placing.kind === 'tick') {
      const at = keepOnPage(shape, x - TICK_SIZE / 2, y - TICK_SIZE / 2, TICK_SIZE, TICK_SIZE);
      item = { id: newId(), page, kind: 'tick', x: at.x, y: at.y, size: TICK_SIZE };
    } else {
      const width = STAMP_WIDTH;
      const height = width / placing.ratio;
      const at = keepOnPage(shape, x - width / 2, y - height / 2, width, height);
      item = {
        id: newId(),
        page,
        kind: 'stamp',
        x: at.x,
        y: at.y,
        width,
        height,
        image: placing.image,
        label: placing.label,
      };
    }
    setItems((now) => [...now, item]);
    setSelected(item.id);
    setPlacing(null);
  };

  const putStamp = useCallback((stamp: StampImage) => setPlacing({ kind: 'stamp', ...stamp }), []);

  // Escape stops placing, then lets go of what is selected.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (placing) setPlacing(null);
      else setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);

  // Typed text left empty goes when it is let go of.
  useEffect(() => {
    setItems((now) =>
      now.filter((item) => item.kind !== 'text' || item.id === selected || item.text.trim()),
    );
  }, [selected]);

  const download = async () => {
    if (!file) return;
    setError(null);
    setBusy('Making the PDF…');
    try {
      const bytes = await writePdf(file.bytes, file.shapes, items);
      savePdf(bytes, signedName(file.name));
    } catch (cause) {
      setError(cause instanceof UnreadablePdf ? cause.message : 'The PDF could not be made.');
    } finally {
      setBusy(null);
    }
  };

  const close = async () => {
    if (items.length) {
      const ok = await confirm({
        title: 'Close this PDF?',
        body: 'What you have added is not saved anywhere. Download it first if you need it.',
        confirmLabel: 'Close it',
        cancelLabel: 'Keep it open',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setFile(null);
    setItems([]);
    setSelected(null);
    setPlacing(null);
  };

  const selectedItem = items.find((item) => item.id === selected) ?? null;
  const fileInput = (
    <input
      ref={chooser}
      type="file"
      accept="application/pdf,.pdf"
      className="sr-only"
      aria-label="Choose a PDF"
      onChange={(event) => choose(event.target.files)}
    />
  );

  if (!file) {
    return (
      <div className="space-y-4">
        {intro}
        {error && <Alert>{error}</Alert>}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-xl border-2 border-dashed p-8 text-center ${
            dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white'
          }`}
        >
          {fileInput}
          <p className="text-base font-medium text-slate-800">
            {busy ?? 'Drop a PDF here, or choose one from this computer'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            It opens in this browser only. Nothing is sent or saved.
          </p>
          <button
            type="button"
            className={`${buttonClass('primary')} mt-4`}
            onClick={() => chooser.current?.click()}
            disabled={busy !== null}
          >
            Choose a PDF
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fileInput}
      <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 min-w-0 max-w-full truncate text-sm font-medium text-slate-800">
            {file.name}
            <span className="ml-1 font-normal text-slate-500">
              · {file.shapes.length} {file.shapes.length === 1 ? 'page' : 'pages'}
            </span>
          </span>
          <ToolButton
            on={placing?.kind === 'text'}
            onClick={() => setPlacing(placing?.kind === 'text' ? null : { kind: 'text' })}
          >
            Add text
          </ToolButton>
          <ToolButton
            on={placing?.kind === 'tick'}
            onClick={() => setPlacing(placing?.kind === 'tick' ? null : { kind: 'tick' })}
          >
            ✓ Tick
          </ToolButton>
          <ToolButton
            on={placing?.kind === 'date'}
            onClick={() => setPlacing(placing?.kind === 'date' ? null : { kind: 'date' })}
          >
            Today&rsquo;s date
          </ToolButton>
          {stamps?.(putStamp)}
          <span className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass('secondary', 'sm')}
              onClick={() => void close()}
            >
              Close
            </button>
            <button
              type="button"
              className={buttonClass('primary', 'sm')}
              onClick={() => void download()}
              disabled={busy !== null}
            >
              {busy ?? 'Download PDF'}
            </button>
          </span>
        </div>
        {selectedItem?.kind === 'text' && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1 text-slate-600">
              Text size
              <select
                value={selectedItem.size}
                onChange={(event) => update(selectedItem.id, { size: Number(event.target.value) })}
                className="rounded-md border-slate-300 py-0.5 text-sm"
              >
                {TEXT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="text-sm text-red-700 underline"
              onClick={() => remove(selectedItem.id)}
            >
              Remove this text
            </button>
          </div>
        )}
        <p className="mt-1 text-xs text-slate-500" aria-live="polite">
          {placing
            ? placing.kind === 'stamp'
              ? `Click on the page where ${placing.label} signature goes. Esc to stop.`
              : 'Click on the page where it goes. Esc to stop.'
            : selectedItem
              ? 'Drag it to move it, or use the arrow keys. Delete takes it off.'
              : 'Choose what to add, then click on the page. Nothing is sent or saved: download the PDF when it is done.'}
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="space-y-4">
        {file.shapes.map((shape, index) => (
          <PageView
            key={index}
            document={file.document}
            index={index}
            shape={shape}
            items={items.filter((item) => item.page === index)}
            selected={selected}
            placing={placing}
            onPlace={(x, y) => place(index, x, y)}
            onSelect={setSelected}
            onChange={update}
            onRemove={remove}
          />
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Done? Download it, then put it where it belongs (eCW, or send it on). Closing this page
            clears it.
          </p>
          <button
            type="button"
            className={buttonClass('primary')}
            onClick={() => void download()}
            disabled={busy !== null}
          >
            {busy ?? 'Download PDF'}
          </button>
        </div>
      </Card>
    </div>
  );
}

function ToolButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`${buttonClass(on ? 'primary' : 'secondary', 'sm')}`}
    >
      {children}
    </button>
  );
}

/// One page: the PDF drawn on a canvas, and what is placed on it on top.
function PageView({
  document,
  index,
  shape,
  items,
  selected,
  placing,
  onPlace,
  onSelect,
  onChange,
  onRemove,
}: {
  document: PDFDocumentProxy;
  index: number;
  shape: PageShape;
  items: Placed[];
  selected: string | null;
  placing: Placing | null;
  onPlace: (x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  onChange: (id: string, change: Partial<Placed>) => void;
  onRemove: (id: string) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setWidth(Math.min(element.clientWidth, shape.width * 2));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [shape.width]);

  useEffect(() => {
    if (!width || !canvas.current) return;
    let task: RenderTask | null = null;
    let live = true;
    void drawPage(document, index, canvas.current, width).then((started) => {
      if (!live) started.cancel();
      task = started;
      return started.promise.catch(() => undefined);
    });
    return () => {
      live = false;
      task?.cancel();
    };
  }, [document, index, width]);

  const scale = width ? width / shape.width : 1;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (!placing) {
      onSelect(null);
      return;
    }
    // Otherwise the press moves the cursor to the page, out of the text box
    // it has just put there.
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    onPlace((event.clientX - box.left) / scale, (event.clientY - box.top) / scale);
  };

  return (
    <div ref={frame} className="w-full">
      <div
        className="relative mx-auto bg-white shadow ring-1 ring-slate-200"
        style={{ width: width || undefined, height: width ? shape.height * scale : undefined }}
      >
        <canvas ref={canvas} aria-label={`Page ${index + 1}`} role="img" />
        <div
          className={`absolute inset-0 ${placing ? 'cursor-crosshair' : ''}`}
          onPointerDown={onPointerDown}
          data-page={index + 1}
        >
          {items.map((item) => (
            <PlacedView
              key={item.id}
              item={item}
              shape={shape}
              scale={scale}
              selected={item.id === selected}
              onSelect={() => onSelect(item.id)}
              onChange={(change) => onChange(item.id, change)}
              onRemove={() => onRemove(item.id)}
            />
          ))}
        </div>
      </div>
      <p className="mt-1 text-center text-xs text-slate-500">Page {index + 1}</p>
    </div>
  );
}

/// Moves what is placed with the pointer, and with the arrow keys.
function useMove(
  item: Placed,
  shape: PageShape,
  scale: number,
  size: { width: number; height: number },
  onChange: (change: Partial<Placed>) => void,
) {
  const start = useRef<{ x: number; y: number; itemX: number; itemY: number } | null>(null);
  const moveTo = (x: number, y: number) =>
    onChange(keepOnPage(shape, x, y, size.width, size.height));
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = { x: event.clientX, y: event.clientY, itemX: item.x, itemY: item.y };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const from = start.current;
      if (!from) return;
      moveTo(
        from.itemX + (event.clientX - from.x) / scale,
        from.itemY + (event.clientY - from.y) / scale,
      );
    },
    onPointerUp: () => {
      start.current = null;
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      const step = event.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[event.key];
      if (!move) return false;
      event.preventDefault();
      moveTo(item.x + move[0], item.y + move[1]);
      return true;
    },
  };
}

function PlacedView({
  item,
  shape,
  scale,
  selected,
  onSelect,
  onChange,
  onRemove,
}: {
  item: Placed;
  shape: PageShape;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (change: Partial<Placed>) => void;
  onRemove: () => void;
}) {
  const size =
    item.kind === 'text'
      ? { width: textWidth(item.text || ' ', item.size), height: textHeight(item) }
      : item.kind === 'tick'
        ? { width: item.size, height: item.size }
        : { width: item.width, height: item.height };
  const move = useMove(item, shape, scale, size, onChange);
  const resizeFrom = useRef<{ x: number; width: number } | null>(null);

  const frame = `absolute ${selected ? 'outline outline-2 outline-brand-500' : 'hover:outline hover:outline-1 hover:outline-brand-300'}`;
  const position = {
    left: item.x * scale,
    top: item.y * scale,
  };
  const removeButton = selected && (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onRemove}
      aria-label="Remove it"
      className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow"
    >
      ×
    </button>
  );

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (move.onKeyDown(event)) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove();
    }
  };

  if (item.kind === 'text') {
    return (
      <div className={frame} style={position} onPointerDown={(event) => event.stopPropagation()}>
        {selected && (
          <button
            type="button"
            aria-label="Move this text"
            title="Drag to move"
            className="absolute -left-6 top-0 flex h-6 w-5 cursor-move touch-none items-center justify-center rounded bg-brand-600 text-xs text-white"
            onPointerDown={move.onPointerDown}
            onPointerMove={move.onPointerMove}
            onPointerUp={move.onPointerUp}
            onKeyDown={move.onKeyDown}
          >
            ⠿
          </button>
        )}
        <textarea
          aria-label="Text on the page"
          autoFocus={!item.text}
          value={item.text}
          onFocus={onSelect}
          onChange={(event) => onChange({ text: event.target.value })}
          rows={item.text.split('\n').length}
          wrap="off"
          spellCheck={false}
          className="block resize-none overflow-hidden border-0 bg-transparent p-0 text-slate-900 focus:ring-0"
          style={{
            fontFamily: FONT,
            fontSize: item.size * scale,
            lineHeight: LINE_HEIGHT,
            width: (size.width + 4) * scale,
            height: size.height * scale,
            minWidth: 24,
          }}
        />
        {removeButton}
      </div>
    );
  }

  const shared = {
    tabIndex: 0,
    className: `${frame} cursor-move touch-none`,
    onFocus: onSelect,
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      onSelect();
      move.onPointerDown(event);
    },
    onPointerMove: move.onPointerMove,
    onPointerUp: move.onPointerUp,
    onKeyDown,
  };

  if (item.kind === 'tick') {
    return (
      <div
        {...shared}
        role="img"
        aria-label="A tick"
        style={{ ...position, width: item.size * scale, height: item.size * scale }}
      >
        <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
          <path
            d={TICK_PATH}
            fill="none"
            stroke="#0d0d1a"
            strokeWidth={2.5 * (24 / item.size)}
            strokeLinecap="round"
          />
        </svg>
        {removeButton}
      </div>
    );
  }

  const ratio = item.width / item.height;
  return (
    <div
      {...shared}
      role="img"
      aria-label={`${item.label[0].toUpperCase()}${item.label.slice(1)} signature`}
      style={{ ...position, width: item.width * scale, height: item.height * scale }}
    >
      <img
        src={item.image}
        alt=""
        draggable={false}
        className="pointer-events-none h-full w-full"
      />
      {removeButton}
      {selected && (
        <span
          aria-hidden="true"
          title="Drag to resize"
          className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize touch-none rounded-sm border-2 border-white bg-brand-600 shadow"
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeFrom.current = { x: event.clientX, width: item.width };
          }}
          onPointerMove={(event) => {
            const from = resizeFrom.current;
            if (!from) return;
            const most = Math.min(shape.width - item.x, (shape.height - item.y) * ratio);
            const width = Math.min(
              most,
              Math.max(40, from.width + (event.clientX - from.x) / scale),
            );
            onChange({ width, height: width / ratio });
          }}
          onPointerUp={() => {
            resizeFrom.current = null;
          }}
        />
      )}
    </div>
  );
}
