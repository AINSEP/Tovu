import type { SourceControlKitHost } from "@jini-ai/devops/source-control/site/provider-kit";
import { trackFetch } from "@jini-ai/diagnostics/observability";
import { type ObservabilityPort } from "@jini-ai/core/contracts/observability";

import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";
import { EgressRefusedError } from "../../platform/http/index.js";

/**
 * @file Binds this host's egress-refusal class and fetch tracer into the git-host provider kit
 * (`@jini-ai/devops/source-control/site/provider-kit`), which owns neither.
 */

/**
 * @param required.observability - Records each `kit.fetch` as one outbound span (host/status only).
 *   Absent: `kit.fetch` is untraced. The guarded `httpClient` is traced where it is built, not here.
 * @complexity O(1).
 */
export function sourceControlKitHost(required: { readonly observability?: ObservabilityPort } = {}, _optional: Record<string, never> = {}): SourceControlKitHost {
  const { observability } = required;
  return {
    describeTransportError: ({ error }) => error instanceof EgressRefusedError
      ? { refusal: error.callerSafeMessage, logDetail: error.message }
      : { refusal: undefined, logDetail: describeErrorForLog({ err: error }) },
    ...(observability ? { observeFetch: ({ fetch }: { fetch: typeof globalThis.fetch }) => trackFetch({ fetch, observability }) } : {}),
  };
}
