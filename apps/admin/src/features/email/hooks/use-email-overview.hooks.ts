import { useCallback, useMemo, useState } from "react";

import { ApiError } from "@/lib/api";
import { emailApi, type EmailApi, type MailTestSendResult, type MailUseRow } from "../email-api";
import { errorMessage, useLoad, type LoadView } from "./email-load.hooks";
import { uniqueId } from "../../../lib/unique-id";

/**
 * @file Overview tab state beyond the status read: **What uses email** (`GET …/mail-uses`) and
 * **Send test email** (`POST …/mail-test-send`). The click is the confirmation; one request id per
 * click makes a retried request replay instead of sending twice. A blank recipient means the
 * signed-in operator's own address (the server's default).
 */

export type TestSendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; result: MailTestSendResult }
  | { kind: "error"; message: string };

export interface EmailOverviewController {
  uses: LoadView<{ checkedAt: string; uses: MailUseRow[] }>;
  reloadUses: () => void;
  to: string;
  setTo: (value: string) => void;
  test: TestSendState;
  sendTest: () => Promise<void>;
}

/** A fresh idempotency key for one click (8-64 of `[A-Za-z0-9_-]`). */
export function newRequestId(): string {
  return uniqueId().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64).padEnd(8, "0");
}

/**
 * @param required.api - the Email API port; a fake in tests.
 * @param optional.requestId - the id factory; fixed in tests.
 */
export function useEmailOverview(required: { api: Pick<EmailApi, "readUses" | "sendTest"> }, optional: { requestId?: () => string } = {}): EmailOverviewController {
  const { api } = required;
  const makeId = optional.requestId ?? newRequestId;
  const load = useCallback(() => api.readUses(), [api]);
  const { view: uses, reload: reloadUses } = useLoad({ load });
  const [to, setTo] = useState("");
  const [test, setTest] = useState<TestSendState>({ kind: "idle" });

  const sendTest = useCallback(async () => {
    setTest({ kind: "sending" });
    try {
      const answer = await api.sendTest({ to: to.trim() || undefined, requestId: makeId() });
      setTest({ kind: "done", result: answer.result });
      reloadUses();
    } catch (error) {
      // 429 still carries the truthful result (duplicate or rate limited): show it, not a bare error.
      const result = error instanceof ApiError ? (error.body?.result as MailTestSendResult | undefined) : undefined;
      setTest(result ? { kind: "done", result } : { kind: "error", message: errorMessage(error) });
    }
  }, [api, to, makeId, reloadUses]);

  return useMemo(() => ({ uses, reloadUses, to, setTo, test, sendTest }), [uses, reloadUses, to, test, sendTest]);
}

/** The real API port. */
export function useWiredEmailOverview(): EmailOverviewController {
  return useEmailOverview({ api: emailApi });
}
