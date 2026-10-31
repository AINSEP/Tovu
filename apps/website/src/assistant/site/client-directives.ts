/** Human-only client channel. Page control uses Jini frontend sessions (SPEC-046 v3). */
export type ClientDirective =
  | { readonly kind: "tool_confirmation"; readonly challengeId: string; readonly title: string; readonly summary: string }
  | { readonly kind: "ui_surface"; readonly toolId: string; readonly resource: unknown };
