import { describe, expect, it } from "vitest";
import { CONTENT_TYPE_FIELD_KINDS as JINI_CONTENT_TYPE_FIELD_KINDS } from "@jini-ai/cms/content-types";

import { CONTENT_TYPE_FIELD_KINDS } from "../api";

/**
 * @file Drift guard for `lib/api.ts`'s hand-copied `CONTENT_TYPE_FIELD_KINDS` — see that file's
 * own header comment for why the copy exists instead of importing the value directly (the
 * `@jini-ai/cms/content-types` barrel is server-only weight this admin's browser bundle shouldn't
 * carry). This test file pays that barrel's import cost instead, since a `.test.ts` never ships.
 *
 * This is the loud version of the check that was missing the first time: Jini widened its
 * `ContentTypeFieldKind` enum with `relation`/`json` (`df1be096`) while `lib/api.ts`'s copy stayed
 * at the original 5, and nothing caught it until `CollectionEntryEditor.tsx` crashed on render. A
 * failure here means the two have drifted again — widen (or narrow) `CONTENT_TYPE_FIELD_KINDS` in
 * `lib/api.ts` to match, and re-check `CollectionEntryEditor.tsx`'s `FIELD_CONTROLS` for
 * exhaustiveness (`tsc` also enforces that half, since `FIELD_CONTROLS` is typed as a
 * `Record<ContentTypeFieldDef["kind"], ...>`).
 *
 * If this instead fails because Jini's *published* `@jini-ai/cms/content-types` (i.e. its built
 * `dist/`, which is what this import — and Tovu's runtime — actually resolves to) hasn't been
 * rebuilt yet against a source change, that is also a true finding: Tovu's admin and Tovu's
 * currently-running Jini dependency disagree about the enum. Rebuild `@jini-ai/cms` and re-run.
 */
describe("ContentTypeFieldKind stays in sync with @jini-ai/cms", () => {
  it("lib/api.ts's CONTENT_TYPE_FIELD_KINDS is exactly Jini's CONTENT_TYPE_FIELD_KINDS, same members, same order", () => {
    expect(CONTENT_TYPE_FIELD_KINDS).toEqual(JINI_CONTENT_TYPE_FIELD_KINDS);
  });
});
