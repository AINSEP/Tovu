export const FIND_QUERY_SETTLE_MS = 200;
export interface FindQueryClock {
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (timer: unknown) => void;
}
/** Guest searches steal focus asynchronously. Keep keystrokes local until typing settles,
 * instead of issuing a new focus-stealing search for every controlled-input update. */
export function createFindQueryScheduler(
  _required: Record<string, never> = {},
  { clock = {
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  } }: { clock?: FindQueryClock } = {},
) {
  let timer: unknown;
  let pending: (() => void) | null = null;
  const cancel = () => {
    if (pending !== null) clock.cancel(timer);
    pending = null;
  };
  const flush = () => {
    const callback = pending;
    cancel();
    callback?.();
    return callback !== null;
  };
  const schedule = ({ run }: { run: () => void }, _optional = {}) => {
    cancel();
    pending = run;
    timer = clock.schedule(flush, FIND_QUERY_SETTLE_MS);
  };
  return { schedule, cancel, flush };
}
