/** Host adapter around Jini's audited builder writes, pending upstream HTML authoring support.
 * Stores derived fields and markup in the SAME mutation; never a follow-up unaudited write. */
import { ForbiddenError } from "@jini-ai/cms/core";
import { FormFieldValidationError, type FormDefinitionRepoPort } from "@jini-ai/cms-forms";
import { deriveHtmlForm, type FormAuthoring, type HtmlFormDefinitionRecord } from "./html-authoring.js";
import type { FormWriteServiceDeps } from "./write-service.js";

export async function prepareFormAuthoring(
  { deps, input, existing }: {
    deps: FormWriteServiceDeps;
    input: FormAuthoring & { workspaceId: string; actor: { id: string } };
    existing?: HtmlFormDefinitionRecord;
  },
  _optional = {},
): Promise<(FormAuthoring & { fields?: HtmlFormDefinitionRecord["fields"] }) | undefined> {
  const authored = input.mode !== undefined || input.html !== undefined;
  if (!authored) return existing?.mode === "html" ? deriveHtmlForm({ html: existing.html ?? "" }) : undefined;
  // Match HTML Pages' trust boundary, including writes that switch out of authored HTML.
  // Check before parsing so an editor cannot use validation as a way around raw-HTML authority.
  if (input.mode === "builder" && input.html === undefined && existing?.mode !== "html") return { mode: "builder", html: undefined };
  const permission = "pages.edit_html";
  const result = await deps.authorize({ principalId: input.actor.id, permission, workspaceId: input.workspaceId });
  if (!result.allowed) throw new ForbiddenError({ message: "HTML form authoring is restricted to admins and owners", permission, reason: result.reason });
  if (input.mode !== undefined && input.mode !== "html" && input.mode !== "builder") {
    throw new FormFieldValidationError({ message: "Invalid form mode", fieldErrors: [{ field: "mode", reason: "must be builder or html" }] });
  }
  if (input.mode === "builder") return { mode: "builder", html: undefined };
  return deriveHtmlForm({ html: input.html ?? existing?.html ?? "" });
}

/** A bounded decorator, with every repository method forwarded explicitly (class methods do not
 * survive object spread). HTML names may be removed: they are the current markup's allowlist. */
export function withFormAuthoring(
  { repo, authoring }: { repo: FormDefinitionRepoPort; authoring: FormAuthoring & { fields?: HtmlFormDefinitionRecord["fields"] } },
  { replaceFields = false }: { replaceFields?: boolean } = {},
): FormDefinitionRepoPort {
  return {
    findById: async (target) => {
      const record = await repo.findById(target);
      return record && replaceFields ? { ...record, fields: [] } : record;
    },
    findBySlug: (target) => repo.findBySlug(target),
    list: (target) => repo.list(target),
    isSlugTaken: (target) => repo.isSlugTaken(target),
    create: async (record) => { Object.assign(record, authoring); await repo.create(record); },
    update: async (record) => { Object.assign(record, authoring); await repo.update(record); },
  };
}
