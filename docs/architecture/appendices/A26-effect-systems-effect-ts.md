### A26. Effect Systems (Effect-TS)

**What it is:** A TypeScript library that makes errors, dependencies, and concurrency explicit in the type system. Every effectful operation declares what it can fail with and what services it requires. Retries, timeouts, and cancellation are compositional primitives.

**Why it matters:** Typed errors — the compiler tells you exactly what can go wrong. Explicit dependencies — no hidden coupling through imports or globals. Automatic retry and timeout behavior without manual wiring. Dramatically reduces runtime surprises in production.

**When to use for Tovu:** Strong candidate for the core operation pipeline in `@tovu/content` and the AI layer. The `DBError | ValidationError | NotFoundError` pattern eliminates the class of bugs where an error type is swallowed or mishandled. The dependency injection model aligns naturally with Tovu's port/adapter design.

**When NOT to use:** Effect-TS has a steep learning curve. Introduce it incrementally in new subsystems rather than as a wholesale migration. Do not use it in plugin-facing APIs — plugin authors should not need to learn Effect to write a basic plugin.

```typescript
import { Effect, pipe, Schedule } from 'effect';

// The type signature tells you exactly what this operation can do:
// - Success: returns Content
// - Failures: NotFoundError | ValidationError | DBError
// - Dependencies: requires ContentService and AIService to be provided
const publishContent = (id: string): Effect.Effect<
  Content,
  NotFoundError | ValidationError | DBError,
  ContentService | AIService
> => pipe(
  // Get content — can fail with NotFoundError
  Effect.flatMap(ContentService, s => s.get(id)),

  // Validate — can fail with ValidationError
  Effect.flatMap(content =>
    content.body.length < 100
      ? Effect.fail(new ValidationError(['Body must be at least 100 characters']))
      : Effect.succeed(content)
  ),

  // Save — can fail with DBError
  Effect.flatMap(content =>
    Effect.flatMap(ContentService, s =>
      s.save({ ...content, status: 'published' })
    )
  ),

  // Retry DB errors up to 3 times with exponential backoff
  Effect.retry({ times: 3, schedule: Schedule.exponential('100ms') }),

  // Hard timeout — operation must complete within 10 seconds
  Effect.timeout('10 seconds')
);

// Run with provided dependencies — compiler enforces all deps are present
const result = await Effect.runPromise(
  publishContent('content-id-123').pipe(
    Effect.provideService(ContentService, contentServiceImpl),
    Effect.provideService(AIService, aiServiceImpl)
  )
);
```
