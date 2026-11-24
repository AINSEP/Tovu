import { fetchWithDaemonParkRecovery as recoverDaemonPark } from "@jini-ai/sidecar/daemon-park-recovery";

import { ensureAssistantDaemonReady, noteAssistantDaemonParking } from "./daemon-supervisor.js";

/** Tovu's wire names for an explicit, pre-dispatch park refusal from the assistant daemon. */
const TOVU_DAEMON_PARK_HEADERS = { parked: "x-tovu-daemon-parked", pid: "x-tovu-daemon-pid" } as const;

/** Binds the Jini park-refusal replay to Tovu's daemon wire and supervisor. Both legacy proxy and
 * durable launches use this same Tovu wire contract; the defaults are the Tovu daemon supervisor.
 * @complexity At most two HTTP sends and one bounded, single-flight discovery wait.
 */
export function fetchWithDaemonParkRecovery({ send }: { send: () => Promise<Response> }, {
  ensureReady = ensureAssistantDaemonReady, onParked = required => noteAssistantDaemonParking(required, {}), passive = false,
}: { ensureReady?: typeof ensureAssistantDaemonReady; onParked?: (required: { pid: number }) => void; passive?: boolean } = {}): Promise<Response> {
  return recoverDaemonPark({ send, headers: TOVU_DAEMON_PARK_HEADERS, ensureReady: () => ensureReady({}, {}), onParked }, { passive });
}
