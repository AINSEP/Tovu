/** CMS chat naming adapter. Preserve a named post/page as a complete phrase instead of spending
 * Jini's six-word heuristic on "publish a short blog post titled How". The generic title policy
 * stays in Jini; this adapter only recognizes CMS requests and delegates all other prompts.
 * Long named content gets a complete action label, never a sliced fragment of its title. */
import { stripConversationTitleMarkdown } from "@jini-ai/chat/core";

export function deriveContentConversationTitle(
  required: { prompt: string; deriveFallback: (input: { prompt: string }) => string },
  _optional: Record<string, never> = {},
): string {
  // Strip markup before recognizing CMS names: an early period boundary once stranded **plannie.
  // The generic text policy belongs to Jini; this adapter still owns only CMS-specific naming.
  const prompt = stripConversationTitleMarkdown({ text: required.prompt });
  // Standalone resource/skill slugs are already meaningful titles; retain the existing behavior.
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(prompt) && prompt.length <= 64) return prompt;
  const content = /\b(blog\s+post|post|page|article)\b/i.exec(prompt);
  if (!content) return required.deriveFallback({ prompt });
  const tail = prompt.slice(content.index + content[0].length);
  const title = readContentName({ tail });
  if (title) return formatContentName({ prompt, contentKind: content[0], title });
  // A dangling title introducer never identifies content. Fall back to the complete CMS action.
  const fallback = required.deriveFallback({ prompt });
  return stripDanglingContentName({ fallback });
}

/** Inspect each quote boundary once, including curly openings inside an otherwise unclosed title. */
function readQuotedContentName({ text }: { text: string }, _optional = {}): string | undefined {
  let opening: number | undefined;
  for (const match of text.matchAll(/["“”]/g)) {
    const { 0: character, index } = match;
    if (character !== '“' && opening !== undefined && index > opening + 1) return text.slice(opening + 1, index);
    if (character !== '“') opening = undefined;
    if (character !== '”') opening ??= index;
  }
  return undefined;
}

function readNamedContentName({ tail }: { tail: string }, _optional = {}): string | undefined {
  const introducer = /\b(?:titled|called|named)/i.exec(tail);
  if (!introducer) return undefined;
  const suffix = tail.slice(introducer.index + introducer[0].length);
  const prefix = /^\s*(?::\s*)?/.exec(suffix)![0];
  let start = prefix.length;
  if (start === suffix.length) {
    // Greedy introducer whitespace can give its final non-newline character back to the name.
    while (start > 0 && suffix[start - 1] === "\n") start -= 1;
    start -= 1;
  }
  if (start < 0) return undefined;
  return readContentNameValue({ value: suffix.slice(start) });
}

function readContentNameValue({ value }: { value: string }, _optional = {}): string | undefined {
  return /^["“]([^"”]+)["”]/.exec(value)?.[1]
    ?? /^'([^']+)'/.exec(value)?.[1]
    // Domains and versions contain punctuation too; only a following space or end ends a sentence.
    ?? /^[^\n]+?(?=[.!?](?:\s|$)|\n|$)/.exec(value)?.[0];
}

function readContentName({ tail }: { tail: string }, _optional: Record<string, never> = {}): string | undefined {
  const named = readNamedContentName({ tail });
  return (named ?? readQuotedContentName({ text: tail }))?.trim();
}

/** Position after the last line break that the final dot-matched name suffix cannot cross. */
function contentNameFinalLineStart({ text }: { text: string }, _optional = {}): number {
  let start = /$/.exec(text)!.index;
  while (start > 0 && /./.test(text[start - 1]!)) start -= 1;
  return start;
}

/** Preserve the complete CMS action when an introducer has no usable title. Scan each suffix once. */
function stripDanglingContentName({ fallback }: { fallback: string }, _optional = {}): string {
  const lineStart = contentNameFinalLineStart({ text: fallback });
  for (const match of fallback.matchAll(/(?<=\s)(?:titled|called|named)(?=\s|$)/gi)) {
    let bodyStart = match.index + match[0].length;
    while (bodyStart < fallback.length && /\s/.test(fallback[bodyStart]!)) bodyStart += 1;
    if (bodyStart < lineStart) continue;
    let start = match.index;
    while (start > 0 && /\s/.test(fallback[start - 1]!)) start -= 1;
    return fallback.slice(0, start);
  }
  return fallback;
}

function formatContentName(
  { prompt, contentKind, title }: { prompt: string; contentKind: string; title: string },
  _optional: Record<string, never> = {},
): string {
  let label = "Blog post";
  if (contentKind.toLowerCase() === "page") label = "Page";
  if (contentKind.toLowerCase() === "article") label = "Article";
  const candidate = `${label}: ${title}`;
  if (candidate.length <= 80) return candidate;
  let action: string;
  if (/\bpublish\b/i.test(prompt)) action = "Publish";
  else if (/\b(?:create|write)\b/i.test(prompt)) action = "Write";
  else action = "Edit";
  return `${action} ${label.toLowerCase()}`;
}
