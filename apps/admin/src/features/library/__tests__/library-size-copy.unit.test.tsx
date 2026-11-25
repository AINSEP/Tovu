import { act, renderHook, waitFor } from "@/__tests__/render-with-jini-kits";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MAX_UPLOAD_BYTES, VIDEO_UPLOAD_LIMIT_BYTES } from "@tovu/contracts/upload-limits";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";

vi.mock("@/hooks/use-admin-locale.hooks", () => ({ useAdminLocale: () => "es" }));

import { useWiredLibrary } from "../hooks/use-wired-library.hooks";

const SPANISH_50_MB = "Este archivo supera los 50 MB. Elige un archivo más pequeño o pide al asistente que lo convierta.";

function wrapper({ children }: { children: ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function sizedFile(name: string, size: number): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

/** A server that refuses every upload with the typed size refusal for `limitBytes`. */
function refuseUploads({ limitBytes, message }: { limitBytes: number; message: string }) {
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const isUpload = init?.method === "POST" && init.body !== undefined;
    const body = isUpload ? { error: message, code: "MEDIA_UPLOAD_TOO_LARGE", fileBytes: limitBytes + 1, limitBytes } : { media: [], users: [], effectivePermissions: ["media.upload"] };
    return new Response(JSON.stringify(body), { status: isUpload ? 400 : 200, headers: { "content-type": "application/json" } });
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("library upload size copy", () => {
  it("library oversize upload shows the translated 50 MB copy", async () => {
    vi.stubGlobal("fetch", () => new Promise(() => undefined));
    const { result } = renderHook(() => useWiredLibrary(), { wrapper });
    // The local check refuses before any request, with the same copy the server refusal gets.
    act(() => result.current.addFiles([sizedFile("huge.pdf", MAX_UPLOAD_BYTES + 1), sizedFile("huge.xyz", MAX_UPLOAD_BYTES + 1)]));
    const rows = new Map(result.current.uploads.map((row) => [row.name, row]));
    expect(rows.get("huge.pdf")?.error).toBe(SPANISH_50_MB);
    // A file refused for its type keeps the type message, even when it is also large.
    expect(rows.get("huge.xyz")?.error).not.toBe(SPANISH_50_MB);

    refuseUploads({ limitBytes: MAX_UPLOAD_BYTES, message: "That file is 51 MB; the limit is 50 MB." });
    act(() => result.current.addFiles([new File(["x"], "server.pdf")]));
    await waitFor(() => expect(result.current.uploads.find((row) => row.name === "server.pdf")?.status).toBe("failed"));
    expect(result.current.uploads.find((row) => row.name === "server.pdf")?.error).toBe(SPANISH_50_MB);
  });

  it("the library keeps the server's own message for the video ceiling", async () => {
    refuseUploads({ limitBytes: VIDEO_UPLOAD_LIMIT_BYTES, message: "That video is over 500 MB." });
    const { result } = renderHook(() => useWiredLibrary(), { wrapper });
    act(() => result.current.addFiles([new File(["x"], "clip.pdf")]));
    await waitFor(() => expect(result.current.uploads[0]?.status).toBe("failed"));
    expect(result.current.uploads[0]?.error).toBe("That video is over 500 MB.");
  });
});
