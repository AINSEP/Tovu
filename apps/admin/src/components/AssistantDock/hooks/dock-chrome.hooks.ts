import { useMemo } from "react";
import { type I18nAdapter } from "@jini-ai/chat/react";
import { conversationTitleForDisplay } from "@jini-ai/chat/core";

import { useWiredAssistantChats, type UseAssistantChats } from "@/hooks/use-assistant-chats.hooks";
import { useWiredAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translateAssistantDockLabel, createChatI18nAdapter } from "../assistant-dock-i18n";

/**
 * Builds the `I18nAdapter` `AssistantDock.tsx` passes to `<JiniChatProvider i18n={...}>` — a thin
 * memoized wrapper around `createChatI18nAdapter` (`assistant-dock-i18n.ts`), which does the actual
 * dictionary lookup and is already independently tested there. Extracted (2026-08-18) purely to get
 * the `useMemo` call itself out of the component body — no I/O, no seam: `locale` is the only input
 * and `createChatI18nAdapter` is a pure function of it.
 *
 * @param input.locale - `useWiredAdminLocale()`'s current value.
 * @returns The memoized adapter, stable for as long as `locale` does not change.
 * @example
 * const chatI18n = useI18n({ locale });
 */
export function useChatI18n({ locale }: { locale: string }, _options: Record<string, never> = {}): I18nAdapter {
  return useMemo(() => createChatI18nAdapter({ locale }), [locale]);
}

/**
 * @file Seam layer (2026-08-18, added after the inline-hook-extraction pass above, in response to
 * live review of that pass): one `use*Seam` wrapper per `INFO.md` rule-3 injectable prop on
 * `AssistantDockProps`, each fusing "pick the override or default the real hook" and "call it" into
 * a single call `AssistantDock.tsx` makes directly — `const { … } = useExecutionConfigSeam({ override: props.useExecutionConfig })`
 * — rather than the two-step `const useXState = resolveXHook(props.useX); const { … } = useXState();`
 * the component previously did for each of the eight seamed hooks.
 *
 * Moving this here, not just shortening it in place, is the point: `INFO.md`'s own table says
 * `<Name>.tsx` holds "props interface + JSX, and nothing else" and `<Name>.hooks.tsx` holds "the
 * state, effects, refs, and DOM/IO logic, as named `use*` hooks" — the override-or-default decision
 * is part of a seamed hook's own contract, not a rendering concern, so it belongs here. The
 * `resolveXHook` functions this replaces existed as separately-scoped functions (not inline default
 * parameters, `SeeMore`'s `{ useClamp = useSeeMoreClamp }` idiom) specifically to keep ESLint's
 * cyclomatic-complexity rule from counting each seam's default against `AssistantDock`'s OWN
 * function body (see that function's own `@complexity` doc). A `use*Seam` wrapper preserves that
 * property for free: its `??` lives in the wrapper's body, not `AssistantDock`'s, so
 * `AssistantDock`'s measured complexity is unchanged by this pass (still 5 cyclomatic / 2 cognitive
 * — verify with `check-admin-complexity-drift.ts` after any further edit here).
 *
 * `AssistantDockProps` itself, its seam docs, and `resolveAgentBridge` (not hook-shaped — a plain
 * `override ?? null`, never a two-step resolve-then-call) are unaffected and stay in
 * `AssistantDock.tsx`; only the eight hook seams move (later joined by a ninth, folded into
 * `useAssistantDockChrome` — see its own doc below). External behavior is identical: same prop
 * names, same default-to-the-real-hook semantics, same "AssistantDock use*Injection" test coverage
 * (`components/__tests__/AssistantDock.unit.test.tsx`) — this is a pure internal relocation.
 */

export function useChatsSeam(
  { override }: { override: (() => UseAssistantChats) | undefined },
  { principalId, useWiredChats = useWiredAssistantChats }: { principalId?: string; useWiredChats?: typeof useWiredAssistantChats } = {},
): UseAssistantChats {
  // `principalId` reaches only the wired hook: it scopes the remembered last conversation, which an
  // injected test hook has no use for.
  return override ? override() : useWiredChats({ principalId });
}

export interface AssistantDockChrome {
  /** The resolved locale string — {@link AssistantDockProps.useAdminLocale}'s override, or
   *  `useWiredAdminLocale`'s real fetched value. */
  locale: string;
  /** Translates this component's OWN pane chrome (eyebrow, title fallback, composer placeholder) —
   *  `assistant-dock-i18n.ts`'s own `t`, which falls back to `COMMON_I18N` via
   *  `createDictionaryTranslator` before returning the raw key. Recomputed each render (cheap: one
   *  object lookup), not memoized — matches this closure's pre-extraction behavior exactly. */
  t: (input: { key: string }, options?: Record<string, never>) => string;
  /** The `I18nAdapter` `<JiniChatProvider i18n={...}>` takes — `@jini-ai/chat/react`'s OWN
   *  translation contract, covering the `ConversationList` switcher mounted in `header` below, a
   *  DIFFERENT (larger, package-owned) key set than `t` above. See {@link useChatI18n}. */
  chatI18n: I18nAdapter;
}

/** Delegate title cleanup and automatic-title casing to Jini; saved custom wording is preserved.
 * @complexity O(c + m + p) for conversations, loaded messages and the first prompt's length.
 */
export function resolveAssistantConversationTitle({ chats, fallback }: {
  chats: Pick<UseAssistantChats, 'conversations' | 'activeId' | 'initialMessages'>; fallback: string;
}, _options = {}): string {
  const conversation = chats.conversations.find(item => item.id === chats.activeId);
  if (!conversation) return fallback;
  return conversationTitleForDisplay({
    title: conversation.title, titleSource: conversation.titleSource,
    firstPrompt: chats.initialMessages.find(message => message.role === 'user')?.content,
  }) ?? fallback;
}

/**
 * Ninth seam, added on top of the original eight after live review: `useWiredAdminLocale()` was
 * still being called bare in `AssistantDock.tsx` — the one hook in the component touching real
 * DOM/IO (`port.loadLanguage()`'s fetch, `port.subscribeToSettingsRefresh`) that had NOT been given
 * an `INFO.md` rule-3 seam, unlike every other IO hook here. Consequence: every existing
 * `AssistantDock` test was making an unstubbed real fetch attempt for the locale on every render
 * (silently swallowed by `useAdminLocale`'s own `.catch(() => undefined)`, landing on
 * `DEFAULT_LOCALE`), and no test could drive `locale`/`chatI18n`/`t()` for any OTHER locale without
 * either stubbing `lib/settings-tabs` globally or asserting only ever the English default.
 *
 * Bundles `locale`, `t`, and `chatI18n` into one call — not three separate ones
 * (`useAdminLocaleSeam(...)`, an inline `t` closure, `useChatI18n({ locale })`) — because all three
 * exist for exactly one shared purpose (translating this dock's own chrome) and were only ever
 * consumed together at the one call site in `AssistantDock.tsx`. A prior revision of this pass kept
 * them as three separate steps in the component body; that was redundant on inspection — three
 * statements standing in for what is really one derived value. `t` itself was also still inline in
 * the component before this consolidation (a plain closure, not a raw hook call, so it was outside
 * this pass's original "extract every inline hook" mandate on a literal reading — but leaving it
 * splintered from `locale`/`chatI18n`, its only two reasons to exist, made no sense once those two
 * were unified here).
 *
 * `useChatI18n` (above) is still its own export, composed internally rather than inlined — it keeps
 * its own direct, narrower tests (locale in, adapter out, no coupling to how `locale` was obtained),
 * and this hook's own tests can stay focused on the seam and the `t()` dictionary behavior.
 *
 * `useWiredAdminLocale` is not itself newly extracted here — it already existed as a properly split,
 * independently tested `useX(port)`/`useWiredX()` pair (`use-admin-locale.hooks.ts`,
 * `admin-locale-dependencies.hooks.ts`, `admin-locale-port.hooks.ts`, with its own
 * `use-admin-locale.hooks.test.ts`) called bare from ~40 files repo-wide by deliberate, documented
 * choice (`use-admin-locale.hooks.ts`'s own header: "converting every one of those call sites was
 * out of scope for this pass... once every remaining bare call site is converted to
 * `useWiredAdminLocale()`, this default can be dropped"). This seam does not touch that shared hook
 * or its ~39 other bare call sites — it only gives `AssistantDock` specifically the same
 * per-consumer prop override every other IO hook in this file already has, the same way `useChats`
 * (also a shared, externally-defined hook) already gets one without every OTHER `useAssistantChats`
 * call site needing to.
 *
 * @param input.useAdminLocaleOverride - {@link AssistantDockProps.useAdminLocale}. Defaults to the real
 *   `useWiredAdminLocale`.
 * @returns `{ locale, t, chatI18n }` — see {@link AssistantDockChrome}.
 * @example
 * const { locale, t, chatI18n } = useAssistantDockChrome({ useAdminLocaleOverride: useAdminLocale });
 */
export function useAssistantDockChrome({ useAdminLocaleOverride }: { useAdminLocaleOverride: (() => string) | undefined }, { useI18n = useChatI18n }: { useI18n?: typeof useChatI18n } = {}): AssistantDockChrome {
  const locale = (useAdminLocaleOverride ?? useWiredAdminLocale)();
  const t = ({ key }: { key: string }, _options: Record<string, never> = {}): string => translateAssistantDockLabel({ locale, key });
  const chatI18n = useI18n({ locale });
  return { locale, t, chatI18n };
}

