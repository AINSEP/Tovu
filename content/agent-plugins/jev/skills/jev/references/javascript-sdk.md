# JavaScript SDK — what's confirmed, and what isn't

Source: `docs.typesafe.ai/sdk/javascript.md` (the JS SDK landing/quickstart page) and
`docs.typesafe.ai/sdk/javascript/api.md` (the API reference **index** page only — its per-class,
per-interface, per-type-alias, and per-function sub-pages were out of scope for this skill's
research and were not read). Crawled 2026-09-21.

The JS SDK landing page is short — a quickstart, not a full guide — and defers deeper detail to the
SDK's own GitHub source (`client.ts`, `types.ts` at the version current when the docs were written,
`v0.6.0`). Treat everything under "Not confirmed" below as a real gap in this skill, not settled
knowledge — read the installed package's own `.d.ts` files or its source before relying on any of it,
rather than inventing a field name or default.

## Confirmed

**Install** (requires Node.js 20+; ships ESM, CommonJS, and TypeScript declarations):

```sh
npm install @typesafe-ai/sdk
```

**Client construction:**

```ts
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();
```

- The zero-arg constructor reads the API key from `TYPESAFE_API_KEY` in the environment. That is the
  name to set for anything using the SDK's default constructor — a machine-local alias like
  `JEV_API_KEY` (sometimes used in local dev setups) is not read by the SDK itself.

**Request call shape** (only `choice` is demonstrated with a runnable example on the two in-scope
pages):

```ts
const response = await client.systemOne({
  state: { document: "I was charged twice. Please fix this ASAP." },
  questions: {
    category: choice("What is this ticket about?", {
      billing: null,
      technical: null,
      other: null,
    }),
  },
});

console.log(response.answers.category.choice);
```

- Method: `client.systemOne({ state, questions })` — one call, any number of named questions.
- `state`: a plain JS object (or string/array, per the HTTP API's `state` shape).
- `questions`: a map of `{ key: Question }`, where each `Question` is built with a helper function
  rather than a raw object literal.
- `choice(instructions: string, criteria: object)` — first positional arg is the instructions
  string, second is the criteria map (option name → description, or `null` when the option name is
  self-explanatory, matching the HTTP API's Choice `criteria` shape).
- The API index page confirms the three primitive-constructor functions are exactly `choice`,
  `score`, and `noul` — matching interfaces `ChoiceQuestion<T>` / `ScoreQuestion<T>` /
  `NoulQuestion`, and matching response interfaces `ChoiceResponse<T>` / `ScoreResponse<T>` /
  `NoulResponse`. Neither `score(...)` nor `noul(...)` has a runnable example on either in-scope
  page — by analogy with `choice`, expect `score(instructions, criteria)` and
  `noul(instructions, criteria?)`, but this is inference from the naming pattern and the HTTP API
  shape, not a confirmed code example. Verify against the installed package's types before shipping.
- Response shape: `response.answers.<key>.<primitive-field>` — e.g.
  `response.answers.category.choice`. The docs state "answer types are inferred from your
  questions," i.e. TypeScript narrows `.choice`/`.score`/`.noul` per key based on which helper built
  that question.

## Not confirmed (exists per the API index's type/class names, but no field-level docs page)

The API reference index page lists these names without documenting their fields on an in-scope page:

- `TypeSafeClientConfig` (interface) — presumably `new TypeSafeClient(config)`'s options shape; only
  the zero-arg form is shown in the quickstart.
- `RequestOptions` (interface) — presumably per-call overrides.
- `RetryPolicy` (interface) — presumably configurable retry count/backoff/retryable-status behavior.
- `Fetch` (type alias) — suggests a custom `fetch` implementation can be injected.
- `Logger` (interface), `LogLevel` (type alias), `LOG_LEVELS` (variable) — suggests configurable
  logging.
- `ENV`, `EnvVar` (variable / type alias) — suggests more environment variables than
  `TYPESAFE_API_KEY` are recognized; none are named on an in-scope page.
- `VERSION` (variable) — the SDK's own version constant.
- `WithResponse<T>` (interface), `APIPromise<T>` (class) — suggests calls return a promise-like
  object that can also expose the raw HTTP response.
- `EntryType` (type alias) — the same structured-value union documented on the HTTP side (see
  `primitives-reference.md`'s "Structured `instructions`/`criteria`" section); linked from
  `primitives/advanced.md` but its own field shape lives on an out-of-scope sub-page.
- `Description`, `ChoiceCriteria`, `ScoreCriteria`, `ScoreLegend<T>`, `ScoreOf<T>`, `Question`,
  `ResultFor<T>` (type aliases) — presumably the typed building blocks behind `choice`/`score`/
  `noul`'s parameters and `SystemOneResult<Q>`'s per-question answer type.
- `SystemOneRequest<Q>`, `SystemOneRequestPayload`, `SystemOneResult<Q>` (interfaces) — presumably
  `client.systemOne()`'s typed request/response shape.
- `Usage` (interface) — presumably the typed form of the HTTP API's `usage: {input_tokens,
  output_tokens}`.
- `Models`, `ModelCard` (interface) — presumably a typed form of `GET /v1/models`'s response.

**Error classes** (Classes section of the API index, names only — no descriptions, fields, HTTP
status mapping, or `instanceof`/catch examples on either in-scope page):

`TypeSafeError`, `APIError`, `APIConnectionError`, `APITimeoutError`, `APIUserAbortError`,
`AuthenticationError`, `BadRequestError`, `InternalServerError`, `NotFoundError`,
`PermissionDeniedError`, `RateLimitError`, `UnprocessableEntityError`.

The naming is consistent with a common status-code-keyed error-subclass pattern (a base `APIError`
with per-status subclasses, plus a `TypeSafeError` likely as the overall base or for non-HTTP
failures), matching the HTTP API's own error table (`401`→`AuthenticationError`,
`422`→`UnprocessableEntityError`, `429`→`RateLimitError`, presumably `529`→`InternalServerError` or
similar) — but this mapping is **inferred from naming and the HTTP error table, not confirmed by an
SDK doc page**. Don't hard-code a specific `instanceof` check without verifying against the
installed package.

## What to do about the gap

Before shipping code against any of the "not confirmed" items above: read the installed
`node_modules/@typesafe-ai/sdk`'s type declarations directly, or fetch the specific sub-page from
`docs.typesafe.ai/sdk/javascript/api/...` that this skill's crawl deliberately skipped (e.g.
`.../classes/RateLimitError.md`, `.../interfaces/TypeSafeClientConfig.md`). Don't invent a
constructor option, retry field, or error subclass name — TypeSafe's own agent-skill guidance
explicitly warns that "the agent invents request or response fields" is a real, named failure mode,
usually caused by working from stale or incomplete context rather than the current docs.
