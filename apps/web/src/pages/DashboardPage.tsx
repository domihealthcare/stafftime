import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import type { Dashboard, DashboardFigures, DashboardWeek } from '../lib/types';

/// Categorical slots 1 and 2 from the data-viz reference palette, validated on
/// the white card surface (CVD ΔE 24.7, normal-vision ΔE 33.6, both ≥ 3:1).
/// Fixed to the location, never to its rank, so a filter never repaints a line.
const SERIES = ['#2a78d6', '#eb6834'];

const PTO_LABEL: Record<string, string> = {
  VACATION: 'vacation',
  SICK: 'sick',
  PERSONAL: 'personal',
  BEREAVEMENT: 'bereavement',
  UNPAID: 'unpaid',
  OTHER: 'other',
};

/**
 * How the practice's weeks have actually gone: hours, overtime, lateness and
 * time off, by location and week — from what the app already holds, by the
 * same rules as the timesheet and the scheduler.
 */
export function DashboardPage() {
  const [weeks, setWeeks] = useState(8);
  const [locationId, setLocationId] = useState('');
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard(weeks));
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the dashboard.');
    }
  }, [weeks]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return error ? <Alert>{error}</Alert> : <Spinner label="Loading the dashboard" />;

  const figuresFor = (week: DashboardWeek): DashboardFigures =>
    locationId ? week.byLocation.find((row) => row.locationId === locationId)! : week.total;

  const thisWeek = data.weeks[data.weeks.length - 1];
  const lastWeek = data.weeks[data.weeks.length - 2];
  const now = figuresFor(thisWeek);
  const before = lastWeek ? figuresFor(lastWeek) : null;
  const shownLocations = data.locations.filter((place) => !locationId || place.id === locationId);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeading
        title="Dashboard"
        subtitle="How the weeks have gone — from the punches, the rota and approved time off."
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Filters: one row, above everything they change. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          aria-label="Location"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white py-1.5 pl-2 pr-8 text-sm"
        >
          <option value="">Both locations</option>
          {data.locations.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
        <div
          className="flex rounded-lg border border-slate-300 bg-white p-0.5"
          role="group"
          aria-label="How far back"
        >
          {[4, 8, 12, 26].map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={weeks === count}
              onClick={() => setWeeks(count)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                weeks === count
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {count} weeks
            </button>
          ))}
        </div>
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
        This week so far
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpis">
        <StatTile
          label="Hours worked"
          value={hours(now.workedHours)}
          detail={`of ${hours(now.scheduledHours)} scheduled`}
          previous={before && `Last week ${hours(before.workedHours)}`}
        />
        <StatTile
          label="Overtime"
          value={hours(thisWeek.total.overtimeHours)}
          detail={
            thisWeek.overtime.length === 0
              ? `Nobody past ${data.overtimeThresholdHours} hours`
              : `${thisWeek.overtime.length} ${thisWeek.overtime.length === 1 ? 'person' : 'people'} past ${data.overtimeThresholdHours} hours`
          }
          previous={lastWeek && `Last week ${hours(lastWeek.total.overtimeHours)}`}
          note={locationId ? 'Both locations — overtime is per person' : undefined}
        />
        <StatTile
          label="Late clock-ins"
          value={String(now.late)}
          detail={
            now.punches
              ? `${percent(now.late, now.punches)} of ${now.punches} punches`
              : 'No punches yet'
          }
          previous={before && `Last week ${before.late} (${percent(before.late, before.punches)})`}
        />
        <StatTile
          label="Time off"
          value={`${days(now.timeOffDays)}`}
          detail={byType(thisWeek, locationId) || 'Nobody away'}
          previous={before && `Last week ${days(before.timeOffDays)}`}
        />
      </div>

      <Card className="mb-6 p-4">
        <HoursChart data={data} locations={shownLocations} />
      </Card>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-4" testId="upcoming">
          <h2 className="text-sm font-semibold text-slate-900">Next two weeks</h2>
          {data.upcoming.clashes.length === 0 && data.upcoming.overtime.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">
              Nothing on the rota clashes with anyone&rsquo;s availability, and nobody is scheduled
              into overtime.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {data.upcoming.clashes.map((clash, index) => (
                <li key={`c-${index}`}>
                  <span className="font-medium">{clash.employeeName}</span> on{' '}
                  {shortDate(clash.date)} ·{' '}
                  {clash.reason.replace(/^Not available/, 'not available')}
                </li>
              ))}
              {data.upcoming.overtime.map((warning) => (
                <li key={`o-${warning.employeeId}-${warning.weekStart}`}>
                  <span className="font-medium">{warning.employeeName}</span> scheduled{' '}
                  {warning.scheduledHours} hours in the week of {shortDate(warning.weekStart)}
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/schedule"
            className="mt-3 inline-block text-sm font-medium text-brand-700 hover:text-brand-900"
          >
            Open the schedule →
          </Link>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-slate-900">Overtime, week by week</h2>
          {data.weeks.every((week) => week.overtime.length === 0) ? (
            <p className="mt-2 text-sm text-slate-600">
              Nobody worked past {data.overtimeThresholdHours} hours in these weeks.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {[...data.weeks]
                .reverse()
                .filter((week) => week.overtime.length > 0)
                .flatMap((week) =>
                  week.overtime.map((person) => (
                    <li key={`${week.weekStart}-${person.name}`}>
                      <span className="font-medium">{person.name}</span> — {person.hours} hours in
                      the week of {shortDate(week.weekStart)}, {person.overtimeHours} at overtime
                    </li>
                  )),
                )}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Hours worked, hourly staff, across both locations.
          </p>
        </Card>
      </div>

      <WeekTable data={data} figuresFor={figuresFor} />
    </div>
  );
}

function StatTile({
  label,
  value,
  detail,
  previous,
  note,
}: {
  label: string;
  value: string;
  detail: string;
  previous?: string | null | false;
  note?: string;
}) {
  return (
    <Card className="p-4" testId={`tile-${label}`}>
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-600">{detail}</p>
      {previous && <p className="mt-0.5 text-xs text-slate-500">{previous}</p>}
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </Card>
  );
}

/**
 * Hours worked each week, one line per location.
 *
 * One axis, hours. A legend always (two series); end labels too, unless the
 * two lines finish too close to label without colliding, when the legend and
 * the hover carry it. The current week is still going, so its point is
 * hollow and the tooltip says "so far".
 */
function HoursChart({
  data,
  locations,
}: {
  data: Dashboard;
  locations: { id: string; name: string }[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  const series = useMemo(
    () =>
      locations.map((place) => ({
        ...place,
        color: SERIES[data.locations.findIndex((l) => l.id === place.id) % SERIES.length],
        values: data.weeks.map(
          (week) => week.byLocation.find((row) => row.locationId === place.id)?.workedHours ?? 0,
        ),
      })),
    [data, locations],
  );

  const height = 220;
  const pad = { top: 12, right: 96, bottom: 28, left: 40 };
  const plotW = Math.max(width - pad.left - pad.right, 80);
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const ticks = [0, max / 2, max];
  const n = data.weeks.length;
  const x = (i: number) => pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const last = n - 1;

  // End labels only if they will not collide.
  const ends = series.map((s) => y(s.values[last]));
  const labelEnds = series.length === 1 || Math.abs(ends[0] - ends[1]) >= 16;

  const labelEvery = Math.ceil(n / Math.max(1, Math.floor(plotW / 64)));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Hours worked each week</h2>
        <ul className="flex flex-wrap gap-3 text-xs text-slate-600" aria-label="Legend">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded"
                style={{ background: s.color }}
              />
              {s.name}
            </li>
          ))}
        </ul>
      </div>
      <div ref={box} className="relative" data-testid="hours-chart">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Hours worked each week for ${series.map((s) => s.name).join(' and ')}. The table below has every number.`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const left = event.currentTarget.getBoundingClientRect().left;
            const index = Math.round(((event.clientX - left - pad.left) / plotW) * (n - 1));
            setHover(Math.min(Math.max(index, 0), last));
          }}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={pad.left + plotW}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text
                x={pad.left - 6}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                className="fill-slate-500 text-[11px]"
              >
                {Math.round(tick).toLocaleString()}
              </text>
            </g>
          ))}
          {data.weeks.map((week, i) =>
            i % labelEvery === 0 || i === last ? (
              <text
                key={week.weekStart}
                x={x(i)}
                y={height - 8}
                textAnchor="middle"
                className="fill-slate-500 text-[11px]"
              >
                {i === last ? 'This week' : shortDate(week.weekStart)}
              </text>
            ) : null,
          )}
          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.top}
              y2={pad.top + plotH}
              stroke="#94a3b8"
              strokeWidth={1}
            />
          )}
          {series.map((s) => (
            <g key={s.id}>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              />
              {s.values.map((v, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={hover === i || i === last ? 4 : 0}
                  fill={i === last ? '#ffffff' : s.color}
                  stroke={i === last ? s.color : '#ffffff'}
                  strokeWidth={2}
                />
              ))}
              {labelEnds && (
                <text
                  x={x(last) + 8}
                  y={y(s.values[last])}
                  dy="0.32em"
                  className="fill-slate-700 text-[11px]"
                >
                  {s.name}
                </text>
              )}
            </g>
          ))}
        </svg>
        {hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
            style={{
              left: Math.min(Math.max(x(hover) - 80, 0), Math.max(width - 170, 0)),
            }}
          >
            <p className="font-medium text-slate-900">
              {hover === last
                ? 'This week, so far'
                : `Week of ${shortDate(data.weeks[hover].weekStart)}`}
            </p>
            {series.map((s) => (
              <p key={s.id} className="mt-0.5 flex items-center gap-1.5 text-slate-700">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                />
                {s.name}: <span className="tabular-nums">{hours(s.values[hover])}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/// Every number on the page, week by week — the chart's table view, and the
/// place the figures the tiles leave out live.
function WeekTable({
  data,
  figuresFor,
}: {
  data: Dashboard;
  figuresFor: (week: DashboardWeek) => DashboardFigures;
}) {
  if (data.weeks.length === 0) return <EmptyState>No weeks to show.</EmptyState>;
  const cell = 'px-3 py-2 text-right tabular-nums';
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm" data-testid="week-table">
        <caption className="px-3 pt-3 text-left text-sm font-semibold text-slate-900">
          Week by week
        </caption>
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="px-3 py-2 text-left font-medium">Week of</th>
            <th className={`${cell} font-medium`}>Worked</th>
            <th className={`${cell} font-medium`}>Scheduled</th>
            <th className={`${cell} font-medium`}>Overtime</th>
            <th className={`${cell} font-medium`}>Late</th>
            <th className={`${cell} font-medium`}>Left early</th>
            <th className={`${cell} font-medium`}>Time off</th>
          </tr>
        </thead>
        <tbody>
          {[...data.weeks].reverse().map((week, index) => {
            const figures = figuresFor(week);
            return (
              <tr key={week.weekStart} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 text-slate-800">
                  {shortDate(week.weekStart)}
                  {index === 0 && <span className="ml-1 text-xs text-slate-500">(so far)</span>}
                </td>
                <td className={cell}>{hours(figures.workedHours)}</td>
                <td className={cell}>{hours(figures.scheduledHours)}</td>
                <td className={cell}>{hours(week.total.overtimeHours)}</td>
                <td className={cell}>
                  {figures.late}
                  {figures.punches > 0 && (
                    <span className="ml-1 text-xs text-slate-500">
                      {percent(figures.late, figures.punches)}
                    </span>
                  )}
                </td>
                <td className={cell}>{figures.earlyDepartures}</td>
                <td className={cell}>{days(figures.timeOffDays)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 pb-3 text-xs text-slate-500">
        Overtime is counted per person across both locations, so it does not change with the
        location filter. Time off counts weekdays; a half day is half.
      </p>
    </Card>
  );
}

function byType(week: DashboardWeek, locationId: string): string {
  if (locationId) return '';
  return Object.entries(week.timeOffByType)
    .map(([type, count]) => `${days(count ?? 0)} ${PTO_LABEL[type] ?? type.toLowerCase()}`)
    .join(', ');
}

function hours(value: number): string {
  return `${Math.round(value * 10) / 10}h`;
}

function days(value: number): string {
  return `${value} ${value === 1 ? 'day' : 'days'}`;
}

function percent(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : '—';
}

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

/// A round top for the axis: 0, half, and a clean number just above the data.
function niceMax(value: number): number {
  const step = 10 ** Math.floor(Math.log10(value));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (factor * step >= value) return factor * step;
  }
  return 10 * step;
}
