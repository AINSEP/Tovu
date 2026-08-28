import fs from "node:fs";
import path from "node:path";

import type { ContentDbSeedData } from "../db/sqlite/content-db.js";
import { InternalError } from "./errors.js";
import type { TemplateJson, TemplateSeedContent } from "./types.js";

/**
 * @file SPEC-003 C-009 — `readTemplate`, the one reader of `templates/<id>/*.json`.
 *
 * Purpose:
 * REQ-02 — a template is versioned DATA, not code. This is the one place that maps the
 * declarative `TemplateSeedContent` on-disk shape (`workspace`/`entries`/`presentation`, per
 * state.spec.md §2) to `db/sqlite/content-db.ts`'s existing `ContentDbSeedData` shape
 * (`workspace`/`posts`/`presentation`) that `openContentDb` actually consumes.
 *
 * How it relates to the project:
 * `templates/starter/seed-content.json` is content-equal to `server/seed.ts`'s live output
 * (AC-02) — generated FROM it by `development/scripts/generate-seed-content.ts` (`npm run
 * generate:seed-content`; drift is a blocking `ci-local.sh` gate, `check:seed-content-drift`), not
 * hand-synced (2026-08-21: hand-syncing this file drifted from `seed.ts` twice in one day with no
 * generator between them — see that script's own header). This module never imports `server/seed.ts`
 * directly: `site-dir` must stay independent of the `server` module (Module Map), and a template
 * is data the runtime reads, not a re-export of another module's code.
 *
 * Architectural role:
 * `site-dir` domain logic. Pure read + pure mapping, no db/fs-write, no `cli`/`express` import.
 */

/**
 * `content/templates/` dir, resolved from this file's own location, never `process.cwd()`.
 *
 * Two levels up, not one: templates are stock DATA and moved out of `src/` on 2026-08-27. The same
 * offset holds in both layouts -- `src/platform/site-dir/` -> `<repo>/content/templates` in the source tree,
 * `dist/src/platform/site-dir/` -> `dist/content/templates` in the compiled one -- because each is exactly
 * two levels below its own root. `npm run build` copies the tree to that second location.
 */
const TEMPLATES_ROOT = path.resolve(import.meta.dirname, "../../content/templates");

export interface ReadTemplateRequired {
  templateId: string;
}

export interface ReadTemplateResult {
  template: TemplateJson;
  seed: ContentDbSeedData;
}

/**
 * Read `templates/<templateId>/{template.json,seed-content.json}` and map the seed shape to
 * `ContentDbSeedData`.
 *
 * @param required.templateId - `"starter"` in v1 (the only template shipped).
 * @returns `{ template, seed }` — `seed` is directly consumable by `openContentDb`.
 * @throws {InternalError} when the template dir/files are missing or unparseable — BR-01 step 3
 *   classifies this as an internal fault, since nothing has been written to the install target
 *   yet at this point in `initSite`'s ordering.
 * @complexity O(n) over the template's own fixed entry count (bounded by the one starter
 *   template's content, not by any caller-controlled input).
 * @overallScore 100
 */
export function readTemplate(required: ReadTemplateRequired): ReadTemplateResult {
  const { templateId } = required;
  const templateDir = path.join(TEMPLATES_ROOT, templateId);

  let template: TemplateJson;
  let seedContent: TemplateSeedContent;
  try {
    template = JSON.parse(fs.readFileSync(path.join(templateDir, "template.json"), "utf8")) as TemplateJson;
    seedContent = JSON.parse(fs.readFileSync(path.join(templateDir, "seed-content.json"), "utf8")) as TemplateSeedContent;
  } catch (err) {
    throw new InternalError(`readTemplate: template "${templateId}" is missing or corrupt: ${(err as Error).message}`);
  }

  const seed: ContentDbSeedData = {
    workspace: seedContent.workspace,
    posts: seedContent.entries,
    presentation: seedContent.presentation,
  };

  return { template, seed };
}
