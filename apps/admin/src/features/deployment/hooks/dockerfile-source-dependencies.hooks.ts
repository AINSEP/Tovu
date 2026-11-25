import { useDockerfileSource as useJiniDockerfileSource } from "@jini-ai/devops/deploy/react/hooks/use-dockerfile-source.hooks";
import { useFetchQuery, useFetchMutation } from "@jini-ai/ui/fetch-query";
import { useDirtyGuard } from "@jini-ai/ui/panel-kit";
import { ApiError, describeApiError } from "@/lib/admin-http/request";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as defaultT } from "../deployment-host-i18n";
import { dockerfileLoadErrorMessage, dockerfileSaveErrorMessage } from "@jini-ai/admin/deployment/deployment-i18n";
import type { Translate } from "@jini-ai/core/text";
import type { AdminDockerfileSource } from "@jini-ai/admin/deployment/api/deployment-api.types";
import { deploymentApi } from "@/features/deployment/deployment-host-ports";
import type { DockerfileSourcePort } from "@jini-ai/admin/deployment/host/hooks/dockerfile-source-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `deployment-overview-dependencies.hooks.ts`'s `defaultDeploymentOverviewPort`. */
export const defaultDockerfileSourcePort: DockerfileSourcePort = {
  getDockerfileSource: () => deploymentApi.getDockerfileSource(),
  setDockerfileSource: ({ contents, ifMatch }, _options = {}) => deploymentApi.setDockerfileSource({ contents, ifMatch }),
};

/** A fixed, deliberately-fake-looking etag for {@link createFakeDockerfileSourcePort}'s default
 *  write echo — never meant to resemble a real sha256 digest, so a test asserting on it can never
 *  be confused about whether it observed the real transport or this stub. Exported so tests can
 *  assert against this exact value instead of duplicating the literal (and risking silent drift if
 *  it ever changes). */
export const FAKE_DOCKERFILE_ETAG = '"fake-etag"';

/** An in-memory {@link DockerfileSourcePort} for tests — resolves a caller-supplied snapshot (or
 *  rejects, for the load-error path) instead of a real fetch.
 *
 *  `setDockerfileSource` defaults to echoing `contents` back as
 *  `{ exists: true, contents, etag: FAKE_DOCKERFILE_ETAG }` — the same SHAPE the real `PUT` route
 *  returns for any successful write (an `ifMatch`-checked write, in production) — so existing
 *  get-only callers of this factory need no changes. This default does NOT check `ifMatch` against
 *  anything (it always "succeeds"); a test exercising the save-error or conflict path overrides it
 *  via `options.setDockerfileSource` (e.g. `() => Promise.reject(new Error("disk full"))`, or a
 *  rejection shaped like the real `ApiError` for the 412 path — see
 *  `use-dockerfile-source.unit.test.tsx`'s own conflict tests). */
export function createFakeDockerfileSourcePort(
  { snapshot }: { snapshot: AdminDockerfileSource | (() => Promise<AdminDockerfileSource>) },
  options: { setDockerfileSource?: DockerfileSourcePort["setDockerfileSource"] } = {},
): DockerfileSourcePort {
  return {
    getDockerfileSource: () => (typeof snapshot === "function" ? snapshot() : Promise.resolve(snapshot)),
    setDockerfileSource:
      options.setDockerfileSource ??
      (({ contents }, _options = {}) => Promise.resolve({ exists: true, contents, etag: FAKE_DOCKERFILE_ETAG })),
  };
}

/**
 * Narrows a `412`'s `ApiError.body.current` down to the `{exists, contents}` shape
 * {@link DockerfileSourceController.saveConflict} carries — pulled out of `save()` itself so its
 * own chain of optional-chaining/typeof narrowing (defensive against a body that isn't shaped as
 * expected — this reads an HTTP error body, not a value this module controls) counts against THIS
 * function's complexity budget instead of `save()`'s.
 *
 * @complexity O(1).
 */
function readSaveConflictPayload(err: ApiError): { exists: boolean; contents: string | null } {
  const current = (err.body as { current?: { exists?: unknown; contents?: unknown } } | undefined)?.current;
  return {
    exists: current?.exists === true,
    contents: typeof current?.contents === "string" ? current.contents : null,
  };
}

export function useDockerfileSource({ port, t, locale }: { port: DockerfileSourcePort; t: Translate; locale: string }, _options = {}) {
  return useJiniDockerfileSource({ port, t, locale,
    useFetchQueryHook: useFetchQuery, useFetchMutationHook: useFetchMutation,
    useDirtyGuardHook: required => useDirtyGuard(required, { host: window }),
    readSaveConflict: ({ error }) => error instanceof ApiError && error.status === 412 ? readSaveConflictPayload(error) : null,
    describeFailure: ({ error, locale, operation }) => operation === "load"
      ? dockerfileLoadErrorMessage({ locale, error: describeApiError({ e: error, fallback: "unknown error" }) })
      : dockerfileSaveErrorMessage({ locale, error: describeApiError({ e: error, fallback: "unknown error" }) }),
    writeClipboard: ({ contents }) => navigator.clipboard.writeText(contents),
  });
}

/**
 * Binds the real `/api/.../system/dockerfile` client, and a `t` bound to the real resolved locale.
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair — see
 * `use-deployment-overview.hooks.ts`'s `useWiredDeploymentOverview` for the identical shape.
 */
export function useWiredDockerfileSource() {
  const locale = useAdminLocale();
  const t = (key: string): string => defaultT({ locale: locale, key: key });
  return useDockerfileSource({ port: defaultDockerfileSourcePort, t, locale });
}
