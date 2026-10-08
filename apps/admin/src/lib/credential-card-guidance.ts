import type { SecretRedactionSignal } from "@jini-ai/chat/core";

/** Values stay out of this callback. Reuse the one pending secure card instead of opening a twin. */
export function guideToPendingCredentialCard(
  { document }: { document: Pick<Document, "querySelectorAll"> }, _optional = {},
): boolean {
  const cards = [...document.querySelectorAll<HTMLElement>('[data-agent-element^="mcp-ui-pending-"]')]
    .filter(element => /secret-card/.test(element.dataset.agentElement ?? ""));
  if (cards.length !== 1) return false;
  const card = cards[0]!.closest<HTMLElement>(".mcpui-surface-overflow-wrap") ?? cards[0]!;
  card.scrollIntoView?.({ block: "center", behavior: "smooth" });
  card.querySelector<HTMLIFrameElement>("iframe")?.focus();
  return true;
}

/** With no unique pending card, [token removed] and the system credential rule request a new card. */
export function onAdminSecretRedacted(_signal: SecretRedactionSignal): void {
  if (globalThis.document) guideToPendingCredentialCard({ document: globalThis.document }, {});
}
