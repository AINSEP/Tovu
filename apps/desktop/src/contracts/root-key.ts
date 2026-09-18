/**
 * Browser-safe root-key contract shared by the Electron main process and the renderer. Types and
 * IPC channel constants only, no logic — same shape as `runtime-inventory.ts` and `project.ts`.
 *
 * What crosses this boundary is a REPORT about root-key material, never the material. The status
 * type below has no field that can hold a key: the fingerprint is a one-way truncated digest, and
 * everything else is a boolean, a filesystem path, or a word from a fixed vocabulary. See
 * `src/root-key-status.ts` for how it is produced and why the shell computes it at all.
 */

/** Why present root-key material was refused. Mirrors `keyring.env.ts`'s own `RootKeyRejection`,
 *  plus `unreadable` for a key file the boot check could not open. */
export type RootKeyRejection = "empty" | "not-hex" | "odd-length" | "too-short" | "unreadable";

/** What the shell learned about root-key material when it booted. See `RootKeyBootStatus` in
 *  `src/root-key-status.ts`, which this mirrors field for field. */
export interface RootKeyStatusDto {
  readonly present: boolean;
  readonly source: "env" | "file" | "none";
  /** Present iff `present` — `sha256(key bytes)` truncated to 12 hex characters, the same value
   *  the admin Secrets page shows. Never reversible to the key. */
  readonly fingerprint?: string;
  /** `true` when a source was configured but its content is unusable. */
  readonly invalid?: true;
  readonly reason?: RootKeyRejection;
  /** Where a generated key file lives or would live. A path convention, not a secret. */
  readonly keyFilePath: string;
  readonly envVarName: string;
}

export const ROOT_KEY_CHANNELS = Object.freeze({
  /** Renderer → main: the status the shell took ONCE at boot. Deliberately a boot snapshot rather
   *  than a fresh read — the defect this whole guard exists for is a delay between cause and
   *  symptom, so what the operator is shown must be what was true when the shell (and every site
   *  server that inherited its environment) started. */
  status: "runner:root-key:status",
});
