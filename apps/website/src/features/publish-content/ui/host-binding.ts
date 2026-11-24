/**
 * @file The host binding for the neutral `@jini-ai/cms/publish/content/ui` module (K5, STAYS-HOST):
 * each function below is the neutral one with this product's policy (`policy.ts`, `sections.ts`)
 * injected, under the SAME names (object-arg shape: required first, optional second) the admin dialog and the server-side planners
 * have always called — so behaviour and call sites are unchanged. Pure functions only.
 */
import {
  applyPublishCriteria as applyCriteria,
  decodePublishCriteriaFromQuery as decodeCriteria,
  friendlyPublishReason as friendlyReason,
  parsePublishContentToolInput as parseToolInput,
  preparePublishConfirmation as prepareConfirmation,
  toPublishReportRows as toRows,
  type CriteriaSelection,
  type PublishContentPlanResult,
  type PublishContentReport,
  type PublishCriteria,
  type PublishReportRow,
} from "@jini-ai/cms/publish/content/ui";
import {
  PUBLISH_CONTENT_CAPABILITY,
  PUBLISH_CRITERIA_LIMITS,
  PUBLISH_PLAN_DRIFT_MESSAGE,
  PUBLISH_REPORT_POLICY,
  TYPE_ALIASES,
} from "./policy.js";

/** @complexity O(n) in the report's row count. */
export function toPublishReportRows({ report }: { report: PublishContentReport }, { completed = false }: { completed?: boolean } = {}): readonly PublishReportRow[] {
  return toRows({ report, policy: PUBLISH_REPORT_POLICY }, { completed });
}

/** @complexity O(1) — a fixed, small number of regex tests against one string. */
export function friendlyPublishReason({ reason }: { reason: string }, _optional = {}): string {
  return friendlyReason({ reason, policy: PUBLISH_REPORT_POLICY.reasons });
}

/** @complexity O(rows × items). */
export function applyPublishCriteria({ rows, criteria }: { rows: readonly PublishReportRow[]; criteria: PublishCriteria & { readonly excludeItems?: readonly string[] } }, _optional: Record<string, never> = {}): CriteriaSelection {
  return applyCriteria({ rows, criteria, typeAliases: TYPE_ALIASES });
}

/** @complexity O(n) in the decoded payload's own `types`/`items` length. */
export function decodePublishCriteriaFromQuery({ raw }: { raw: string }, _optional = {}): PublishCriteria | null {
  return decodeCriteria({ raw, limits: PUBLISH_CRITERIA_LIMITS });
}

/** @throws {Error} naming the one `admin.publish_content` field that is malformed. */
export function parsePublishContentToolInput({ input }: { input: Record<string, unknown> }, _optional: Record<string, never> = {}): PublishCriteria {
  return parseToolInput({ input, capabilityId: PUBLISH_CONTENT_CAPABILITY.id });
}

/** @throws {PublishPlanDriftError} when the narrowed plan writes a different set than was reviewed. */
export function preparePublishConfirmation(
  required: { plan: PublishContentPlanResult; deselectedKeys: ReadonlySet<string>;
    planPublish: (input: { selectedEntityKeys: readonly string[]; overwriteEntityKeys?: readonly string[] }) => Promise<PublishContentPlanResult> },
  _optional: Record<string, never> = {},
): Promise<PublishContentPlanResult> {
  return prepareConfirmation({ ...required, driftMessage: PUBLISH_PLAN_DRIFT_MESSAGE });
}
