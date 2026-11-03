import { ensureAssistantDaemonReady, noteAssistantDaemonParking } from "./daemon-supervisor.js";

/** Retry one explicit, pre-dispatch park refusal. Never retry a reset or infer safety from a
 * generic 503. Both legacy proxy and durable launches use this same Tovu wire contract.
 * The send closure resolves the current origin again after the old child exits.
 * @returns The original response for passive observers, otherwise at most one replacement send.
 * @complexity At most two HTTP sends and one bounded, single-flight discovery wait.
 */
export async function fetchWithDaemonParkRecovery({ send }: { send: () => Promise<Response> }, {
  ensureReady = ensureAssistantDaemonReady, onParked = required => noteAssistantDaemonParking(required, {}), passive = false,
}: { ensureReady?: typeof ensureAssistantDaemonReady; onParked?: (required: { pid: number }) => void; passive?: boolean } = {}): Promise<Response> {
  const response = await send();
  if (response.status !== 503 || response.headers.get("x-tovu-daemon-parked") !== "1") return response;
  const pid = Number(response.headers.get("x-tovu-daemon-pid"));
  if (!Number.isSafeInteger(pid) || pid <= 0) return response;
  onParked({ pid });
  if (passive) return response;
  await response.body?.cancel();
  await ensureReady({}, {});
  return send();
}
