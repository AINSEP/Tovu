/**
 * @file This host's bindings for `@jini-ai/agentic/skills/site/*`, bound once and passed to every
 * `resolveSkillLayout` call so the booted layout carries them to the install service, the skill tool
 * registrations, the install tool and the admin routes: the skills-dir override variable, the persisted
 * install-state file name, the site-root resolver, the yauzl/js-yaml/node install adapters, the frontmatter
 * reader, the contained agent-plugins file reader, the per-root installer queues and the CMS permission check.
 */
import * as fs from "node:fs/promises";
import { createSkillFileReader } from "@jini-ai/agent-plugins/lifecycle";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import type { SkillSiteHost } from "@jini-ai/agentic/skills/site/layout";
import { readFrontmatterField } from "#src/platform/markdown/frontmatter";
import { resolveSiteRoot } from "../../platform/site-dir/index.js";
import { SKILL_STATE_FILE } from "./state.js";
import { filesystem, archiveReader, yamlReader } from "./install-adapters.js";

export const SKILL_SITE_HOST: SkillSiteHost = {
  overrideEnvVar: "TOVU_SKILLS_DIR",
  stateFileName: SKILL_STATE_FILE,
  processEnv: () => process.env,
  resolveSiteRoot,
  filesystem,
  archiveReader,
  yamlReader,
  readFrontmatterField,
  createFileReader: ({ skillRoot }) => createSkillFileReader({ skillRoot, filesystem: fs }),
  installers: new Map(),
  requireToolPermission: (input, optional) =>
    requireToolPermission({ ...input, authorize: adaptLegacyAuthorize({ authorize: input.authorize }) }, optional),
};
