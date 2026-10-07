import type { UIResource } from "@jini-ai/ui/mcp-ui/surfaces";

/** Published Jini starts the dwell during document.write. If the iframe is hidden then, no timer
 * is armed; becoming visible by sandbox initialization need not send visibilitychange to that
 * new document. Re-check at the bridge's ready boundary. This preserves the original visibility,
 * dwell, trusted-click and single-call gates. Remove after adopting chat-tools.jini.patch.
 * No new Jini symbol is imported: whenReady is already part of every emitted bridge. */
export function rearmConfirmationDwell(
  { resource }: { resource: UIResource },
  _optional: Record<string, never> = {},
): UIResource {
  const marker = '  document.addEventListener("visibilitychange", onVisibilityChange);';
  const text = resource.resource.text;
  if (text.includes("api.whenReady(onVisibilityChange)")) return resource;
  return { ...resource, resource: { ...resource.resource,
    text: text.replace(marker, `${marker}\n  api.whenReady(onVisibilityChange);`),
  } };
}
