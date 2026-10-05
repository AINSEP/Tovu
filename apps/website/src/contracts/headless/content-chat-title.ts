/** CMS chat naming adapter. Preserve a named post/page as a complete phrase instead of spending
 * Jini's six-word heuristic on "publish a short blog post titled How". The generic title policy
 * stays in Jini; this adapter only recognizes CMS requests and delegates all other prompts.
 * Long named content gets a complete action label, never a sliced fragment of its title. */
export function deriveContentConversationTitle(
  required: { prompt: string; deriveFallback: (input: { prompt: string }) => string },
  _optional: Record<string, never> = {},
): string {
  const prompt = required.prompt.trim();
  // Standalone resource/skill slugs are already meaningful titles; retain the existing behavior.
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(prompt) && prompt.length <= 64) return prompt;
  const content = /\b(blog\s+post|post|page|article)\b/i.exec(prompt);
  if (!content) return required.deriveFallback({ prompt });
  const tail = prompt.slice(content.index + content[0].length);
  const named = /\b(?:titled|called|named)\s*(?::\s*)?(?:["“]([^"”]+)["”]|'([^']+)'|([^\n.!?]+))/i.exec(tail);
  const quoted = /["“]([^"”]+)["”]/.exec(tail);
  const title = (named?.[1] ?? named?.[2] ?? named?.[3] ?? quoted?.[1])?.trim();
  if (title) {
    const label = content[0].toLowerCase() === "page" ? "Page" : content[0].toLowerCase() === "article" ? "Article" : "Blog post";
    const candidate = `${label}: ${title}`;
    if (candidate.length <= 80) return candidate;
    const action = /\bpublish\b/i.test(prompt) ? "Publish" : /\b(?:create|write)\b/i.test(prompt) ? "Write" : "Edit";
    return `${action} ${label.toLowerCase()}`;
  }
  // A dangling title introducer never identifies content. Fall back to the complete CMS action.
  const fallback = required.deriveFallback({ prompt });
  return fallback.replace(/\s+(?:titled|called|named)(?:\s+.*)?$/i, "");
}
