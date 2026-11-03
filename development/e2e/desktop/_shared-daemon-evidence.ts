/** Execution evidence must cover five sites and five currently live CLI children in one sample.
 * Acceptance alone also covers preparation and runs that fail before any CLI starts.
 * O(s + p) time/space for s run samples and p owned processes; no OS effects here.
 */
export function fiveSitesExecuting({ samples, processes }: {
  samples: readonly { origin: string; runId: string; state: string; childPid: number }[];
  processes: readonly { pid: number }[];
}, _options: Record<string, never> = {}): boolean {
  if (samples.length !== 5) return false;
  if (new Set(samples.map(run => run.origin)).size !== 5) return false;
  if (new Set(samples.map(run => run.childPid)).size !== 5) return false;
  const live = new Set(processes.map(process => process.pid));
  return samples.every(run => run.state === 'running' && run.runId.length > 0 && live.has(run.childPid));
}
