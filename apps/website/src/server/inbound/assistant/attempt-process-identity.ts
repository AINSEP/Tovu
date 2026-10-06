import { execFile } from "node:child_process";

export type ProcessStartReader = (required: { pid: number }, optional: {}) => Promise<string | null>;

/** ps supplies the OS start identity, not our observation timestamp. PID reuse then proves the
 * old child is dead without killing an unrelated process. An unreadable identity is uncertain. */
export const readProcessStart: ProcessStartReader = ({ pid }, _optional) => new Promise((resolve, reject) => {
  execFile("ps", ["-o", "lstart=", "-p", String(pid)], { env: { ...process.env, LC_ALL: "C", TZ: "UTC" } }, (error, stdout) => {
    if (error && error.code !== 1) { reject(error); return; }
    resolve(stdout.trim() || null);
  });
});

export async function verifyAttemptChildDead(
  required: { pid: number; startedAt: string }, { readStart = readProcessStart }: { readStart?: ProcessStartReader } = {},
): Promise<boolean> {
  const current = await readStart({ pid: required.pid }, {});
  return current === null || current !== required.startedAt;
}
