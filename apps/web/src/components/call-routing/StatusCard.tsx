import { Link } from 'react-router';
import { Alert, Badge, Card } from '../ui';
import { formatCaller } from '../../lib/call-routing';
import type { CallRoutingSettings } from '../../lib/types';

export function StatusCard({ settings }: { settings: CallRoutingSettings }) {
  const { line } = settings;
  const bad = settings.providers.filter((p) => !p.dialable);
  const defaultProvider = settings.providers.find((p) => p.id === settings.defaultProviderId);
  return (
    <Card className="space-y-3 p-4" testId="routing-status">
      <h2 className="text-lg font-semibold text-slate-900">The line</h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Answering calls</dt>
          <dd>
            {line.switchedOn ? (
              <Badge tone="success">Switched on</Badge>
            ) : (
              <Badge tone="warning">Not switched on</Badge>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Number</dt>
          <dd className="font-medium text-slate-900">
            {line.number ? formatCaller(line.number) : 'Not set'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Emergency fallback cell</dt>
          <dd>
            {line.fallbackSet ? (
              <Badge tone="success">Set</Badge>
            ) : (
              <Badge tone="warning">Not set in Vercel</Badge>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Default provider</dt>
          <dd className="font-medium text-slate-900">
            {defaultProvider ? defaultProvider.name : 'Nobody chosen'}
          </dd>
        </div>
      </dl>
      {!line.switchedOn && (
        <p className="text-sm text-slate-600">
          Until it is switched on, callers are not answered by this app.
        </p>
      )}
      {bad.length > 0 && (
        <Alert tone="warning">
          <p>
            These providers cannot be rung because their phone is missing or not a US number:{' '}
            <strong>{bad.map((p) => p.name).join(', ')}</strong>.{' '}
            <Link to="/staff" className="font-medium underline">
              Fix it on the Staff screen
            </Link>
            .
          </p>
        </Alert>
      )}
    </Card>
  );
}
