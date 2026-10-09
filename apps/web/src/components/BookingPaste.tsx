import { useState } from 'react';
import { AI_NOTE } from '../lib/ai';
import { ApiError, api } from '../lib/api';
import type { ReadBooking } from '../lib/types';
import { buttonClass } from './ui';

/**
 * "Fill this in from a message" (October 2026, Dominguez — an AI idea): a
 * rep's email or text pasted in, and the calendar's form filled from it to
 * check before saving. Only the pasted words are sent; the office and rep
 * are found in the app's own lists on the server. Nothing is saved here.
 */
export function BookingPaste({ onRead }: { onRead: (booking: ReadBooking) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function read() {
    setBusy(true);
    setProblem(null);
    try {
      const { booking } = await api.readBooking(text.trim());
      if (!booking) {
        setProblem('Could not read that one — fill the form in by hand.');
        return;
      }
      onRead(booking);
      setOpen(false);
      setText('');
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'Could not read that just now.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left text-sm font-medium text-brand-700 hover:text-brand-900 sm:col-span-2"
      >
        ✨ Fill this in from a message
      </button>
    );
  }
  return (
    <div
      className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200 sm:col-span-2"
      data-testid="booking-paste"
    >
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          Paste the email or text — a rep booking a lunch, a diagnostics day, a meeting
        </span>
        <textarea
          aria-label="The message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="Hi! Sarah from Pfizer — can I bring lunch to West New York next Tuesday at 12:30? Eliquis."
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
      {problem && <p className="text-sm text-rose-700">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || text.trim().length < 5}
          onClick={() => void read()}
          className={buttonClass('secondary', 'sm')}
        >
          {busy ? 'Reading…' : 'Fill it in'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Close
        </button>
      </div>
      <p className="text-xs text-slate-500">{AI_NOTE}</p>
    </div>
  );
}
