import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PageShape, Transform } from './geometry';

/**
 * Shows a PDF's pages with pdf.js (November 2026), here in the browser. The
 * PDF is handed to pdf.js as bytes already in this page's memory, never as a
 * web address, so nothing is fetched or sent: its worker is the app's own
 * file, from this site.
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export class UnopenablePdf extends Error {}

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  // pdf.js hands the bytes it is given to its worker, emptying them here, so
  // it gets a copy and the original stays for writing the PDF out.
  const task = pdfjs.getDocument({ data: bytes.slice(), enableXfa: false });
  try {
    return await task.promise;
  } catch (error) {
    if (error instanceof pdfjs.PasswordException) {
      throw new UnopenablePdf(
        'This PDF needs a password to open. Ask whoever sent it for a copy without one.',
      );
    }
    throw new UnopenablePdf('This file could not be opened as a PDF.');
  }
}

/// Each page's size as shown, and how it relates to the page's own
/// coordinates, at 100%.
export async function shapesOf(document: PDFDocumentProxy): Promise<PageShape[]> {
  const shapes: PageShape[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    shapes.push({
      width: viewport.width,
      height: viewport.height,
      rotation: viewport.rotation,
      transform: [...viewport.transform] as Transform,
    });
  }
  return shapes;
}

/// Draws one page onto a canvas `width` CSS pixels wide, sharp on the
/// screen it is on. Cancel the task to stop it part-way.
export async function drawPage(
  document: PDFDocumentProxy,
  index: number,
  canvas: HTMLCanvasElement,
  width: number,
): Promise<RenderTask> {
  const page: PDFPageProxy = await document.getPage(index + 1);
  const shown = page.getViewport({ scale: 1 });
  const ratio = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale: (width / shown.width) * ratio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${(width / shown.width) * shown.height}px`;
  return page.render({ canvas, viewport });
}
