import { hkdfSync } from "node:crypto";

import type { KeyringPort } from "../../../webhooks/index.js";

/** One recorded `derive` request. */
export interface RecordedDerive {
  readonly workspaceId: string;
  readonly purpose: string;
  readonly info: string;
}

/**
 * A fake of {@link KeyringPort} for the pinned-bytes tests of the publishing trust code.
 *
 * It uses the same construction the production keyring uses (HKDF-SHA256, 32 bytes, `purpose`,
 * workspace and `info` all bound into the HKDF info string) over a fixed site key, so a derived
 * value depends on every input the trust code passes. A fake that ignored one of them would let a
 * test pass after that input was dropped from a derivation.
 *
 * `activeKey` and `deriveSigningSecret` throw: the publishing trust code must only call `derive`.
 */
export function createFixedKeyring(required: { siteKeyHex: string }, _optional = {}): {
  keyring: KeyringPort;
  derives: RecordedDerive[];
} {
  const siteKey = Buffer.from(required.siteKeyHex, "hex");
  const derives: RecordedDerive[] = [];
  const keyring: KeyringPort = {
    activeKey: async () => {
      throw new Error("the publishing trust code must not ask for the active key");
    },
    deriveSigningSecret: async () => {
      throw new Error("the publishing trust code must not derive a webhook signing secret");
    },
    derive: async (input) => {
      derives.push({ workspaceId: String(input.workspaceId), purpose: input.purpose, info: input.info });
      const info = `${input.purpose}:${String(input.workspaceId)}:${input.info}`;
      return new Uint8Array(hkdfSync("sha256", siteKey, Buffer.alloc(0), info, 32));
    },
  };
  return { keyring, derives };
}
