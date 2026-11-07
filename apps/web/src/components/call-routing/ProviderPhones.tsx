import { Badge, Card } from '../ui';
import { formatCaller } from '../../lib/call-routing';
import type { CallRoutingSettings } from '../../lib/types';

export function ProviderPhones({ settings }: { settings: CallRoutingSettings }) {
  return (
    <section aria-labelledby="provider-phones" className="space-y-2">
      <h2 id="provider-phones" className="text-lg font-semibold text-slate-900">
        Providers’ phones
      </h2>
      <p className="text-sm text-slate-600">
        Each provider sets their on-call number in Your profile; an admin can set it under Staff
        &rarr; Edit. With none set, the Directory phone is rung.
      </p>
      <Card className="divide-y divide-slate-100" testId="provider-phones">
        {settings.providers.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span className="font-medium text-slate-900">{p.name}</span>
            <span className="text-slate-700">
              {p.rings
                ? `${formatCaller(p.rings)} ${p.ringsFrom === 'ON_CALL_NUMBER' ? '(their on-call number)' : '(Directory phone)'}`
                : 'No phone'}
            </span>
            {p.dialable ? (
              <Badge tone="success">Can be dialled</Badge>
            ) : (
              <Badge tone="warning">Missing or not a US number</Badge>
            )}
          </div>
        ))}
      </Card>
    </section>
  );
}
