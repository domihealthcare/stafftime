import { useState } from 'react';
import {
  FREQUENCIES,
  HOSPITAL_CODES,
  hospitalCode,
  newOrFollowUp,
  pillCount,
  type Frequency,
} from '../lib/guide-tools';
import { formatCalendarDate } from '../lib/format';
import { practiceDate } from '../lib/practice-time';
import { inputClass } from './ui';

/**
 * The helpers a guide section can hold (`::tool:name` in its markup). Each
 * works on what is typed into it here and nothing else: no request, nothing
 * kept.
 */
export function GuideTool({ name }: { name: string }) {
  if (name === 'pill-count') return <PillCount />;
  if (name === 'new-or-follow-up') return <NewOrFollowUp />;
  if (name === 'inpatient-code') return <InpatientCode />;
  return null;
}

function ToolBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-3" data-testid="guide-tool">
      <p className="mb-2 text-sm font-semibold text-brand-900">{title}</p>
      {children}
    </div>
  );
}

function Answer({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-sm text-slate-900" role="status" data-testid="tool-answer">
      {children}
    </p>
  );
}

const number = (text: string) => (text.trim() === '' ? NaN : Number(text));

function PillCount() {
  const [perDose, setPerDose] = useState('1');
  const [frequency, setFrequency] = useState<Frequency>('QD');
  const [days, setDays] = useState('90');
  const result = pillCount(number(perDose), frequency, number(days));
  return (
    <ToolBox title="How many to dispense">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-700">
          Pills each time
          <input
            className={`${inputClass} mt-0.5`}
            inputMode="numeric"
            value={perDose}
            onChange={(event) => setPerDose(event.target.value.replace(/[^\d.]/g, ''))}
          />
        </label>
        <label className="text-xs font-medium text-slate-700">
          How often
          <select
            className={`${inputClass} mt-0.5`}
            value={frequency}
            onChange={(event) => setFrequency(event.target.value as Frequency)}
          >
            {FREQUENCIES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">
          Days supply
          <input
            className={`${inputClass} mt-0.5`}
            inputMode="numeric"
            value={days}
            onChange={(event) => setDays(event.target.value.replace(/\D/g, ''))}
          />
        </label>
      </div>
      <Answer>
        {result ? (
          <>
            Dispense <strong>{result.quantity}</strong>, days supply <strong>{days}</strong>{' '}
            <span className="text-slate-600">({result.working})</span>
          </>
        ) : (
          'Enter the pills each time and the days.'
        )}
      </Answer>
    </ToolBox>
  );
}

function NewOrFollowUp() {
  const [lastSeen, setLastSeen] = useState('');
  const today = practiceDate();
  const result = lastSeen ? newOrFollowUp(lastSeen, today) : null;
  return (
    <ToolBox title="New patient or follow up?">
      <label className="block max-w-xs text-xs font-medium text-slate-700">
        Last seen in the office
        <input
          type="date"
          className={`${inputClass} mt-0.5`}
          value={lastSeen}
          max={today}
          onChange={(event) => setLastSeen(event.target.value)}
        />
      </label>
      <Answer>
        {!lastSeen ? (
          'Enter the date of their last visit.'
        ) : !result ? (
          'That date is in the future.'
        ) : result.kind === 'NEW' ? (
          <>
            Book as a <strong>new patient</strong>: it has been 3 years or more.
          </>
        ) : (
          <>
            Book as a <strong>follow up</strong>. They become a new patient on{' '}
            {formatCalendarDate(result.newFrom)}.
          </>
        )}
      </Answer>
    </ToolBox>
  );
}

function InpatientCode() {
  const [kind, setKind] = useState<keyof typeof HOSPITAL_CODES>('subsequent');
  const [minutes, setMinutes] = useState('');
  const total = number(minutes);
  const result = Number.isFinite(total) ? hospitalCode(kind, total) : null;
  const lowest = HOSPITAL_CODES[kind][0];
  return (
    <ToolBox title="Which code for the time?">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-700">
          Visit
          <select
            className={`${inputClass} mt-0.5`}
            value={kind}
            onChange={(event) => setKind(event.target.value as keyof typeof HOSPITAL_CODES)}
          >
            <option value="initial">Initial hospital care</option>
            <option value="subsequent">Subsequent hospital care</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">
          Total time (minutes)
          <input
            className={`${inputClass} mt-0.5`}
            inputMode="numeric"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value.replace(/\D/g, ''))}
          />
        </label>
      </div>
      <Answer>
        {!Number.isFinite(total) ? (
          'Enter the total time.'
        ) : result ? (
          <>
            <strong>{result.code}</strong> ({result.minutes} minutes or more).
            {result.next && (
              <span className="text-slate-600">
                {' '}
                {result.next.code} from {result.next.minutes} minutes.
              </span>
            )}
          </>
        ) : (
          <>
            Under {lowest.minutes} minutes: below {lowest.code}.
          </>
        )}
      </Answer>
    </ToolBox>
  );
}
