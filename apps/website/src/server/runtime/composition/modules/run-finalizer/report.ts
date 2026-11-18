/**
 * @file Calls a host reporter (a log or span port) so that its own failure cannot change what the
 * run finalizer does next.
 */

/**
 * Runs one report call and contains whatever it throws, or rejects with when the host's reporter
 * turns out to be asynchronous.
 *
 * This is the one place the finalizer drops an error on purpose. The reporter is the only channel
 * its own failure could be reported through, and the alternative is worse: a throw from the log
 * call inside a checkpoint's rejection handler skips the backed-off retry and becomes an unhandled
 * rejection, and a throw from the log call at a watch's end rejects the watch itself.
 * @complexity O(1) beyond the reporter.
 */
export function reportSafely({ report }: { report: () => unknown }, _optional = {}): void {
  // The executor runs `report` synchronously and turns a synchronous throw into the same rejection
  // an asynchronous reporter produces, so one handler contains both.
  new Promise<unknown>((resolve) => { resolve(report()); }).catch(() => {
    // Nothing to do, and nowhere left to say so: see the comment above.
  });
}
