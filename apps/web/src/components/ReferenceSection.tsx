import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { useIsManager } from '../lib/session';
import type { ReferenceTableSummary } from '../lib/types';
import { ReferenceTableForm } from './ReferenceTableForm';
import { Badge, Card, buttonClass } from './ui';

/**
 * Reference tables on Resources (October 2026, Dominguez): the practice's
 * spreadsheets of facts to look up — the diagnostics guide for everyone, the
 * fee schedule for managers and admins. Managers add them by pasting from the
 * spreadsheet.
 */
export function ReferenceSection() {
  const t = useT();
  const isManager = useIsManager();
  const navigate = useNavigate();
  const [tables, setTables] = useState<ReferenceTableSummary[] | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api
      .referenceTables()
      .then(setTables)
      .catch(() => setTables([]));
  }, []);
  useEffect(load, [load]);

  if (!tables || (tables.length === 0 && !isManager)) return null;

  return (
    <section aria-label={t('Reference')} data-testid="reference-section">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          {t('Reference')}
        </h2>
        {isManager && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={buttonClass('secondary', 'sm')}
          >
            + Add a table
          </button>
        )}
      </div>
      {adding && (
        <div className="mb-3">
          <ReferenceTableForm
            requirePaste
            onCancel={() => setAdding(false)}
            onSave={async (input) => {
              const made = await api.createReferenceTable(input);
              setAdding(false);
              navigate(`/reference/${made.id}`);
            }}
          />
        </div>
      )}
      {tables.length === 0 ? (
        <p className="text-sm text-slate-500">
          No tables yet. Add the diagnostics guide or the fee schedule by pasting it from the
          spreadsheet.
        </p>
      ) : (
        <Card className="divide-y divide-slate-100">
          {tables.map((table) => (
            <div key={table.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/reference/${table.id}`}
                  className="text-sm font-semibold text-brand-800 hover:text-brand-900"
                >
                  {table.title} →
                </Link>
                {table.audience === 'MANAGERS' && <Badge>Managers and admins</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {t('{rows} rows · {columns} columns', {
                  rows: table.rowCount,
                  columns: table.columnCount,
                })}
                {table.notes ? ` · ${table.notes.split('\n')[0]}` : ''}
              </p>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
