/** Unrun eval scaffold. Inject a model runner; this file opens no network connection and performs
 * no writes. Use a low-cost configured model (owner example: Claude Haiku 5.5) through the existing
 * provider runner; model ids and availability belong to that runner's live provider catalog. */
import { SITE_GUIDE_POINTER } from "../../apps/website/src/assistant/site-guide-pointer.js";

export const SITE_GUIDE_PLANNER_CASE = {
  prompt: "Design a planner directory site.",
  system: SITE_GUIDE_POINTER,
  variants: ["enriched", "core-only", "restricted"] as const,
};
export interface GuideEvalCall { readonly toolId: string; readonly input: Readonly<Record<string, unknown>> }
export interface GuideEvalTrace { readonly calls: readonly GuideEvalCall[]; readonly answer: string }
/** Evaluate observable choices; discovery calls may precede the first domain tool call.
 * Passing requires guide-first, explicit forms/widgets learning, and native form/widget usage in
 * the design. This scorer is an eval signal, not proof that the proposed site's code works.
 * @complexity O(c + a), calls and answer length.
 * @example scoreSiteGuidePlanner({ trace });
 */
export function scoreSiteGuidePlanner({ trace }: { trace: GuideEvalTrace }, _options: Record<string, never> = {}) {
  const substantive = trace.calls.filter(call => call.toolId !== "search_tools" && call.toolId !== "describe_tool");
  const guideFirst = substantive[0]?.toolId === "site_guide" && substantive[0].input.operation === "overview";
  const explained = new Set(substantive.filter(call => call.toolId === "site_guide" && call.input.operation === "explain").map(call => call.input.topic));
  const usedForms = /\bforms?\b|forms_create_definition/i.test(trace.answer);
  const usedWidgets = /widget(?:s| instance)?|widgets_create_instance/i.test(trace.answer);
  const teachesNativeBuildingBlocks = explained.has("forms") && explained.has("widgets") && usedForms && usedWidgets;
  return { passed: guideFirst && teachesNativeBuildingBlocks, guideFirst, teachesNativeBuildingBlocks };
}
/** Runner port deliberately owns model selection, schemas, tool execution and credentials.
 * The runner must use a sandbox/in-memory site and collect delegated tool ids after unwrapping
 * proxy calls. Never include authentication data in a saved trace.
 */
export interface GuideEvalRunner {
  run(input: { prompt: string; system: string; variant: "enriched" | "core-only" | "restricted"; model: string }, options?: Record<string, never>): Promise<GuideEvalTrace>;
}
/** Run only when the coordinator explicitly invokes this scaffold with its provider adapter.
 * Restricted variant is reported for manual assessment: forbidden features must stay unknown.
 * @returns Per-variant traces and scores, without saving them or treating restricted omission as failure.
 */
export async function evaluateSiteGuidePlanner(input: { runner: GuideEvalRunner; model: string }, _options: Record<string, never> = {}) {
  const results = [];
  for (const variant of SITE_GUIDE_PLANNER_CASE.variants) {
    const trace = await input.runner.run({ prompt: SITE_GUIDE_PLANNER_CASE.prompt, system: SITE_GUIDE_PLANNER_CASE.system, variant, model: input.model });
    results.push({ variant, trace, score: scoreSiteGuidePlanner({ trace }), requiresPermissionReview: variant === "restricted" });
  }
  return results;
}
