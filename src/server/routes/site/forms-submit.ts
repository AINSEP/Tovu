import type { Express, Request } from "express";

import {
  FormDefinitionNotFoundError,
  FormRateLimitExceededError,
  FormSubmissionValidationError,
} from "#src/forms/errors";
import { submitForm, type SubmitFormDeps } from "#src/forms/submit-service";
import { resolveClientIp } from "#src/core/rate-limit/rate-limit";

/**
 * @file Public submission route for `forms` (SPEC-010 `FORMS_POST_SUBMIT`, REQ-05).
 *
 * Mirrors `routes/site/analytics-ingest.ts`'s public-route shape: no session required, registered
 * before the site `/:slug` catch-all (see `server/app.ts`'s wiring). Reuses `resolveClientIp`
 * (`core/rate-limit/rate-limit.ts`) rather than re-deriving IP resolution — all real validation
 * happens inside `submitForm` (C-008); this file owns only the HTTP boundary.
 */

const MAX_BODY_STRING_LENGTH = 5000;

/** Bounds every string value in an untrusted body before it reaches `submitForm` — defensive coercion, mirroring `analytics-ingest.ts`'s `parseBeacon`. */
function boundBody(body: unknown): Record<string, unknown> {
  const raw = (body ?? {}) as Record<string, unknown>;
  const bounded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      bounded[key] = value.slice(0, MAX_BODY_STRING_LENGTH);
    } else if (typeof value === "boolean") {
      bounded[key] = value;
    }
    // Other types (objects/arrays/numbers) are dropped — `validateSubmissionPayload` only ever
    // accepts strings/booleans per the closed field-type vocabulary.
  }
  return bounded;
}

function resolveSourceIp(req: Request): string {
  return resolveClientIp({ socket: req.socket, headers: req.headers });
}

export interface RegisterFormsSubmitRouteDeps {
  workspaceId: string;
  submitForm: SubmitFormDeps;
}

/** Registers `POST /forms/:slug/submit`. Must be registered BEFORE the site `/:slug` catch-all. */
export function registerFormsSubmitRoute(app: Express, deps: RegisterFormsSubmitRouteDeps): void {
  app.post("/forms/:slug/submit", async (req, res) => {
    const slug = String(req.params.slug ?? "");
    const body = boundBody(req.body);
    const sourceIp = resolveSourceIp(req);

    try {
      const result = await submitForm({
        deps: deps.submitForm,
        input: { workspaceId: deps.workspaceId, slug, body, sourceIp },
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof FormDefinitionNotFoundError) {
        res.status(404).json({ error: err.message, code: "FORMS_DEFINITION_NOT_FOUND" });
        return;
      }
      if (err instanceof FormSubmissionValidationError) {
        res.status(400).json({
          error: err.message,
          code: "FORMS_SUBMISSION_VALIDATION_ERROR",
          details: { fieldErrors: err.fieldErrors },
        });
        return;
      }
      if (err instanceof FormRateLimitExceededError) {
        res.status(429).json({
          error: err.message,
          code: "FORMS_RATE_LIMIT_EXCEEDED",
          details: { retryAfterSeconds: err.retryAfterSeconds },
        });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
