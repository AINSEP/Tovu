# Finding: route handlers have NO compile-time type safety on request bodies

Surfaced four separate times on 2026-08-20 by the complexity campaign, in two different
subtrees, by three different agents. Not one of them was looking for it.

## The mechanism

`req.body` is typed `any`. So this compiles and is never checked:

```ts
const input = { widgetType: req.body?.widgetType, status: req.body?.status };
```

**Extracting that into a named helper forces you to write a return type — and the moment you do,
TypeScript starts checking, and the missing contract becomes visible.** The refactor didn't create
the gap; it made an invisible one visible.

## The four occurrences

| file | what surfaced |
|---|---|
| `routes/admin/posts/update.ts` | `bodyJson`/`status`/`templateChoice` were `any`; typed helper produced `TS2322` against `UpdatePostInput` |
| `routes/admin/widgets/agent-tools.ts` | `widgetType: body.widgetType` compiled only because `body` was implicitly `any` |
| `src/seo/seo.ts` | annotated `ogType: string` where the real type is `OpenGraphType` |
| `src/export/route-manifest.ts` | `\| null` supplied to a `\| undefined` parameter |

The last two reached `origin` and left `general-work` type-broken for ~2 hours.

## VERIFIED: the domain layer catches all of it — today

I suspected unvalidated input twice and traced both. Both were safe:

**`posts/update.ts`** → `src/features/post/post.ts:677 validateUpdatePostInput()`
```
title     → throws "title is required"
slug      → isValidSlugFormat
bodyJson  → isJsonObject → "bodyJson must be a JSON object"
status    → isValidPostStatus → "status must be 'draft' or 'published'"
```

**`widgets/agent-tools.ts`** → `src/widgets/write-service.ts:11-13`
```
getWidgetTypeRegistration(key)      // registry.ts — returns undefined for unknown
if (!registration) throw new WidgetTypeUnregisteredError(...)
```

**This is good architecture, and it should be named as such:** routes are thin parsers, the domain
owns validation. The casts at the route boundary are safe *because* the chokepoint is downstream.
A code comment in `agent-tools.ts` asserts exactly this, and — unusually for this repo's comment
register — **it checks out.**

## The real risk, and the follow-up worth doing

The safety is **conventional, not enforced.** Nothing stops someone adding a route that casts a
body field and then calls something that does NOT validate. Today every path happens to route
through a validating domain function. There is no gate that would tell you if one didn't.

**Suggested audit (not done):** find route handlers that cast a `req.body` field into a union or
branded type and trace whether the callee validates. Start from the `as` casts introduced by this
campaign — they are now written down and greppable, which is itself an improvement over the
implicit `any` they replaced.

## Practical rule for anyone refactoring routes here

When extraction produces a type error on a body field:

1. **Narrow the annotation to the true type. Never cast the error away** — a cast re-hides exactly
   what the extraction just exposed.
2. If a cast is genuinely correct (the domain validates), **say so in a comment naming the
   validating function**, as `agent-tools.ts` does. That comment is what let this be verified in
   two minutes instead of an afternoon.
3. **Run `npm run typecheck`, not just eslint.** Three files reached origin eslint-clean and
   type-broken today because nobody did.
