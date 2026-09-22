import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * A standing warning on any deployment that is not the real one.
 *
 * It sits above everything, including the sign-in and kiosk screens, because
 * those are exactly where somebody could mistake a test deployment for the one
 * their hours are recorded in.
 */
export function EnvironmentBanner() {
  const [isTest, setIsTest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .appConfig()
      .then((config) => !cancelled && setIsTest(config.isTestEnvironment))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isTest) {
    return null;
  }

  return (
    <div
      role="status"
      className="bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950"
    >
      Test environment — nothing here is real. Hours recorded will not be paid, and the data
      may be wiped at any time.
    </div>
  );
}
