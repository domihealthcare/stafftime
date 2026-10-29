import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { timeAgo } from './time-ago';

describe('timeAgo', () => {
  const now = new Date('2026-10-29T16:00:00.000Z');
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const ago = (minutes: number) =>
    timeAgo(new Date(now.getTime() - minutes * 60_000).toISOString());

  it('says "just now" for under half a minute', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(0.4)).toBe('just now');
  });

  it('counts minutes, then hours', () => {
    expect(ago(5)).toBe('5 min ago');
    expect(ago(59)).toBe('59 min ago');
    expect(ago(60)).toBe('1 h ago');
    expect(ago(3 * 60 + 10)).toBe('3 h ago');
    expect(ago(23 * 60)).toBe('23 h ago');
  });

  it('says "yesterday" up to two days', () => {
    expect(ago(24 * 60)).toBe('yesterday');
    expect(ago(47 * 60)).toBe('yesterday');
  });

  it('gives the date after that', () => {
    const text = ago(3 * 24 * 60);
    expect(text).not.toMatch(/ago|yesterday/);
    expect(text).toMatch(/26/);
  });
});
