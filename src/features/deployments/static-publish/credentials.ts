import type { PublishCredentialSource, StaticPublishTargetId } from "./types";

/**
 * @file Env-var `PublishCredentialSource` — the ONLY credential source this pass wires up.
 *
 * Purpose:
 * Tovu already has a workspace-scoped encrypted secret store (ADR-058) —
 * `src/assistant/site-credential-store.ts`, backed by `SecretSealerPort`/`KeyringPort` and a
 * dedicated `site_assistant_credentials` table — and that IS the right long-term home for a
 * publish token entered in the admin (a token pasted into a form is exactly ADR-058's use case).
 * Investigated and deliberately not extended this pass, disclosed rather than silently skipped:
 * wiring a new provider credential into that pattern needs its own DB table + migration + repo
 * port + sqlite adapter, touching `src/db/schema.ts` and `server/deps.ts` — both high-traffic
 * composition-root files with several other agents concurrently active in this same tree during
 * this dispatch (2026-08-15). Building a new persisted-secret vertical unreviewed, on top of
 * migration machinery this codebase has documented fragility around when two changes land
 * concurrently, is a materially separate piece of work from "wrap Jini's publish adapters" and is
 * better done as its own follow-up once the admin UI's actual credential-entry shape exists to
 * design the table against.
 *
 * `PublishCredentialSource` (`./types.ts`) is the seam that follow-up needs: swap this file's
 * `createEnvPublishCredentialSource()` for one backed by `SiteAssistantCredentialRepoPort`'s exact
 * shape (`{workspaceId, provider, sealed, masked}`, one row per `(workspaceId, target)`), and no
 * caller of this module (`adapter.ts`, the admin route, the agent tools) changes at all.
 *
 * How it relates to the project:
 * `GITHUB_TOKEN`/`VERCEL_TOKEN` are plain, undocumented-in-`.env.example` env vars, not a new
 * secret-storage mechanism — the same category as `TOVU_EXPORT_DIR`/`TOVU_ADMIN_PASSWORD`, which
 * this codebase already reads directly from `process.env` for operator-supplied config that isn't
 * (yet) in the encrypted store.
 */

const ENV_VAR_BY_TARGET: Readonly<Record<StaticPublishTargetId, string>> = {
  "github-pages": "GITHUB_TOKEN",
  vercel: "VERCEL_TOKEN",
};

/**
 * Builds a `PublishCredentialSource` that resolves a target's token from a fixed env var.
 * `workspaceId` is accepted (per the port's shape) but not consulted — this process serves exactly
 * one workspace (`RouteDeps.workspaceId` is a single value throughout this codebase), so a
 * process-wide env var is already workspace-scoped in practice.
 *
 * @param env - Defaults to `process.env`; overridable for tests so no test needs to mutate real
 *   process env vars (which would leak across parallel test files in the same process).
 * @complexity O(1).
 */
export function createEnvPublishCredentialSource(env: NodeJS.ProcessEnv = process.env): PublishCredentialSource {
  return {
    async resolve(input) {
      const envVar = ENV_VAR_BY_TARGET[input.target];
      const raw = env[envVar];
      const token = raw?.trim();
      if (!token) {
        return {
          ok: false,
          reason: `${envVar} is not set — publishing to ${input.target} requires a token with write access configured in the server environment`,
        };
      }
      return { ok: true, token };
    },
  };
}
