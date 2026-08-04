# Shared `@jini-ai/chat` Markdown renderer has no labeled-link support

Filed as a finding, not fixed — this is a design task, not a one-line regex addition. See
"Why this is not a quick fix" below.

## What was found

Investigating a live bug (a Gemini reply on Tovu's public site-assistant widget showed
literal `[About page (What Is Tovu?)](about)` instead of a clickable link), the root
cause traced to `packages/chat/src/react/components/Markdown.tsx` in Jini
(`/Users/la/Programming/Jini`) — the small hand-rolled markdown renderer every
`@jini-ai/chat` host uses for assistant message text.

Its inline pass (`INLINE_RE`, line 173) recognizes exactly four spans:

```
/(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*|_[^_]+_)|(https?:\/\/[^\s)]+)/g
```

`` `code` ``, `**bold**`, `*italic*`/`_italic_`, and bare `https?://` autolinks. There is
**no alternative for labeled link syntax `[text](url)` at all** — not a matching bug, the
pattern simply isn't there. Any model output containing that syntax falls through every
alternative untouched and renders as literal bracket/paren text.

## Scope: this is a shared-package gap, not a public-widget-only one

Checked directly rather than assumed: both consumers of `@jini-ai/chat/react`'s
`ChatPane` in this codebase hit the identical code path, since both use it unmodified —

- `apps/admin/src/components/AssistantDock.tsx` (admin dock, ADR-049)
- `apps/site-chat/src/SiteAssistantWidget.tsx` (public site-assistant widget, SPEC-046)

Both route through `MessageRow.tsx` → `<Markdown>{segment.text}</Markdown>`. A model that
writes a markdown link in either surface shows raw brackets in both. Whoever picks this
up should fix `Markdown.tsx` once, in Jini, not patch either host separately.

## Why this is not a quick fix

`Markdown.tsx`'s own header is explicit about why it exists in this form: "No
`dangerouslySetInnerHTML` — output is a tree of typed React elements, so untrusted text
can't smuggle markup through." Assistant message text is treated as untrusted content by
design, not an oversight — and on the public widget specifically, that text can include
the model paraphrasing or quoting published post content it looked up via its tools
(`src/assistant/site/tools.ts`'s `get_published_entry`), which is visitor-authored content
one step removed, not purely model-generated.

Adding `[text](url)` support means introducing an `href` onto a real `<a>` element for the
first time in this component. Doing that safely requires deciding, and did not exist
before this note:

- a scheme allowlist (`https:`/relative paths at minimum; explicitly reject `javascript:`,
  `data:`, `vbscript:`, and bare `//` protocol-relative URLs that resolve off-site)
- whether a same-origin/relative path should differ in treatment from an absolute
  external URL (e.g. `rel="noreferrer"` + `target="_blank"` only for external — the
  existing bare-autolink branch already does this unconditionally, which may not be the
  right default for a relative link)
- how this interacts with `apps/site-chat`'s own `client-directives.ts`/REQ-6 design,
  where a page path is only ever meant to reach the client pre-resolved server-side
  (see `2026-08-04` site-assistant fix in this same reports directory) — a markdown link
  parser that accepts an arbitrary model-written path would reopen exactly the channel
  that design keeps closed at the tool layer, unless the renderer itself also validates
  the target against something the client already trusts

None of that exists today. That is the reason this is being filed rather than fixed
alongside the prompt-layer bug it was found investigating: the prompt-layer fix removes
the immediate incentive for the model to write links in the navigation case, but does
nothing for legitimate non-navigation cases (e.g. the model citing an external source),
which will keep rendering as raw text until someone designs and builds the above.

## Suggested next step

Route to Software Architect / ADR for the href-sanitization design before any
implementation — this affects a shared package consumed by both an authenticated admin
surface and anonymous public traffic, with different trust levels for what "the model"
might be relaying.
