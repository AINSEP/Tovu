import { useRef, useState } from "react";
import { useFetchMutation } from "@/lib/fetch-query";
import { describeApiError, KEYS } from "../rules";
import { defaultMediaImportPort, type MediaImportPort } from "./media-import-dependencies.hooks";

/** Quick wins A: retain failed drafts for retry; refresh the same list the upload hook reads. */
export function useRemoteImageImport(
  required: { t: (key: string) => string },
  optional: { port?: MediaImportPort } = {},
) {
  const port = optional.port ?? defaultMediaImportPort;
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const inFlight = useRef(false);
  const mutation = useFetchMutation({
    run: (input: { url: string; alt?: string }) => port.importFromUrl({ url: input.url }, { alt: input.alt }),
    invalidates: [KEYS.list],
  });
  async function submit() {
    if (inFlight.current || !url.trim()) return;
    inFlight.current = true;
    try {
      await mutation.mutate({ url: url.trim(), alt: alt.trim() || undefined });
      setUrl("");
      setAlt("");
    } catch {
      // The mutation owns the visible error; keep the draft so the operator can correct it.
    } finally {
      inFlight.current = false;
    }
  }
  return {
    url, setUrl, alt, setAlt, submit,
    pending: mutation.status === "pending",
    canSubmit: Boolean(url.trim()) && mutation.status !== "pending",
    error: mutation.error ? describeApiError(mutation.error, required.t("Could not import media.")) : null,
  };
}
