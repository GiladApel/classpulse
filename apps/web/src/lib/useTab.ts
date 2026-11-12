import { useSearchParams } from 'react-router';

/** The open tab lives in `?tab=`, so a link (or the browser's back button) lands on the right tab. */
export function useTab<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const [params, setParams] = useSearchParams();
  const current = params.get('tab') as T | null;
  const tab = current && tabs.includes(current) ? current : fallback;
  const set = (t: T) =>
    setParams(
      (p) => {
        p.set('tab', t);
        return p;
      },
      { replace: true },
    );
  return [tab, set];
}
