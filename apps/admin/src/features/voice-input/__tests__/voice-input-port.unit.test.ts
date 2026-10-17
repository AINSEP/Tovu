import { describe, expect, it, vi } from "vitest";

import { getVoiceInputPort, type VoiceInputPort } from "../voice-input-port";

describe("getVoiceInputPort", () => {
  it("returns the injected window's bridge instead of the ambient desktop bridge", () => {
    const port: VoiceInputPort = {
      isAvailable: async () => ({ available: true }),
      transcribe: async () => ({ text: "injected transcript", elapsedMs: 1 }),
    };
    const ambientPort: VoiceInputPort = {
      isAvailable: async () => ({ available: false, reason: "unsupported-platform:linux" }),
      transcribe: async () => ({ text: "ambient transcript", elapsedMs: 2 }),
    };
    vi.stubGlobal("window", { tovuVoice: ambientPort });
    try {
      expect(getVoiceInputPort({ tovuVoice: port } as Window)).toBe(port);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns null in a runtime without a window", () => {
    vi.stubGlobal("window", undefined);
    try {
      expect(getVoiceInputPort(undefined)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
