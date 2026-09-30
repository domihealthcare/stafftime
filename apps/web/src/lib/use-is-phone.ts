import { useEffect, useState } from 'react';

/// The width below which the navigation moves to the bottom of the screen
/// (Tailwind's `sm`, 640px).
const QUERY = '(max-width: 639px)';

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const update = () => setPhone(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return phone;
}
