import { vi } from "vitest";
import type { AdminCredentialCopySource } from "@/lib/api";
import type { CopyKeysPort } from "../hooks/use-copy-keys.hooks";

/**
 * @file Shared copy-keys fixtures for the dialog and hook suites: an identity translator, two
 * eligible source projects with obviously fake four-character hints, and a typed fake port.
 */
export const t = (key: string) => key;

export const COPY_SOURCES: AdminCredentialCopySource[] = [
  { siteId: "a", name: "Alpha", keys: [{ kind: "vendor", id: "one", label: "Main", provider: "OpenAI", worksFor: [], last4: "1234" }] },
  { siteId: "b", name: "Beta", keys: [{ kind: "custom", id: "two", label: "Work", provider: "Example", worksFor: [], last4: "5678" }] },
];

/** Fake HTTP port: lists `choices` and reports one successful copy of key `one`. */
export function fakeCopyKeysPort(choices = COPY_SOURCES): CopyKeysPort {
  return {
    listCredentialCopySources: vi.fn().mockResolvedValue({ sources: choices }),
    copyCredentials: vi.fn().mockResolvedValue({ results: [{ kind: "vendor", id: "one", status: "copied", last4: "1234" }] }),
  };
}
