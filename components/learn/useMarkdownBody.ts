import { useCallback, useEffect, useState } from 'react';

type BodyState = { status: 'loading' } | { status: 'ready'; body: string } | { status: 'error'; message: string };

/** Loads a lazily imported markdown body, with loading/error states and retry. */
export const useMarkdownBody = (load: () => Promise<string>, key: string) => {
  const [state, setState] = useState<BodyState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    load()
      .then((body) => {
        if (!cancelled) setState({ status: 'ready', body });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
      });
    return () => {
      cancelled = true;
    };
    // `load` is derived from `key`; re-run only when the content or attempt changes.
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { state, retry };
};
