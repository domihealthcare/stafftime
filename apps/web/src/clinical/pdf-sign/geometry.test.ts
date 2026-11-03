import { describe, expect, it } from 'vitest';
import {
  anchorAt,
  keepOnPage,
  lineStarts,
  signedName,
  todayForForm,
  toPagePoint,
  type PageShape,
  type Transform,
} from './geometry';

/// pdf.js's PageViewport transform at scale 1, as its source works it out,
/// for a page with the given box and /Rotate.
function viewport(box: [number, number, number, number], rotation: number): PageShape {
  const [x0, y0, x1, y1] = box;
  const centerX = (x0 + x1) / 2;
  const centerY = (y0 + y1) / 2;
  const [a, b, c, d] = {
    0: [1, 0, 0, -1],
    90: [0, 1, 1, 0],
    180: [-1, 0, 0, 1],
    270: [0, -1, -1, 0],
  }[rotation as 0 | 90 | 180 | 270];
  const sideways = a === 0;
  const offsetX = sideways ? Math.abs(centerY - y0) : Math.abs(centerX - x0);
  const offsetY = sideways ? Math.abs(centerX - x0) : Math.abs(centerY - y0);
  const transform: Transform = [
    a,
    b,
    c,
    d,
    offsetX - a * centerX - c * centerY,
    offsetY - b * centerX - d * centerY,
  ];
  return {
    width: sideways ? y1 - y0 : x1 - x0,
    height: sideways ? x1 - x0 : y1 - y0,
    rotation,
    transform,
  };
}

/// Where a point on the page shows on screen.
function onScreen(page: PageShape, x: number, y: number) {
  const [a, b, c, d, e, f] = page.transform;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

describe('placing on a page', () => {
  const letter: [number, number, number, number] = [0, 0, 612, 792];

  it('measures an upright page from its bottom-left, as a PDF does', () => {
    const page = viewport(letter, 0);
    expect(anchorAt(page, 100, 120)).toEqual({ x: 100, y: 672, rotate: 0 });
    expect(toPagePoint(page.transform, 0, 0)).toEqual({ x: 0, y: 792 });
  });

  it('follows a page with its box away from the origin', () => {
    const page = viewport([20, 30, 632, 822], 0);
    expect(anchorAt(page, 0, 792)).toMatchObject({ x: 20, y: 30 });
  });

  it.each([0, 90, 180, 270])(
    'comes back to the same spot on screen on a page turned %i degrees',
    (rotation) => {
      const page = viewport(letter, rotation);
      const spot = { x: 123, y: 45 };
      const point = toPagePoint(page.transform, spot.x, spot.y);
      const back = onScreen(page, point.x, point.y);
      expect(back.x).toBeCloseTo(spot.x);
      expect(back.y).toBeCloseTo(spot.y);
      expect(anchorAt(page, spot.x, spot.y).rotate).toBe(rotation);
    },
  );

  it('shows a page stored on its side the long way across', () => {
    const page = viewport(letter, 90);
    expect([page.width, page.height]).toEqual([792, 612]);
    // Writing runs left to right on screen: up the page, turned 90 degrees.
    const start = anchorAt(page, 50, 200);
    const along = toPagePoint(page.transform, 60, 200);
    expect(along.x).toBeCloseTo(start.x);
    expect(along.y).toBeGreaterThan(start.y);
  });

  it('starts each line of typed text one line further down', () => {
    expect(lineStarts(10, 20, 10, 2)).toEqual([
      { x: 10, y: 29.5 },
      { x: 10, y: 41.5 },
    ]);
  });

  it('keeps what is placed inside the page', () => {
    const page = { width: 612, height: 792 };
    expect(keepOnPage(page, -10, 790, 100, 40)).toEqual({ x: 0, y: 752 });
    expect(keepOnPage(page, 600, 10, 100, 40)).toEqual({ x: 512, y: 10 });
  });
});

describe('names and dates', () => {
  it('marks the download as signed, keeping its name', () => {
    expect(signedName('Prior auth.PDF')).toBe('Prior auth (signed).pdf');
    expect(signedName('.pdf')).toBe('Document (signed).pdf');
  });

  it("writes today's date as New Jersey's", () => {
    expect(todayForForm(new Date('2026-11-04T03:00:00Z'))).toBe('11/03/2026');
  });
});
