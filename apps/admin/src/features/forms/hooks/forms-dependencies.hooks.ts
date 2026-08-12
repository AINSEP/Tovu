import { api, type AdminFormDefinition, type AdminFormField, type AdminFormNotify } from "../../../lib/api";
import type { FormsPort } from "./forms-port.hooks";

/**
 * @file The only place under `features/forms/hooks` that reaches `lib/api` for form-definition
 * CRUD — see `forms-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies.hooks.ts`'s
 *  `defaultRedirectsPort`. */
export const defaultFormsPort: FormsPort = {
  listForms: () => api.listForms(),
  getForm: (id) => api.getForm(id),
  createForm: (input, options) => api.createForm(input, options),
  updateForm: (target, options) => api.updateForm(target, options),
};

/** Seed state for {@link createFakeFormsPort}. */
export interface FakeFormsPortOptions {
  forms?: AdminFormDefinition[];
}

function blankNotify(): AdminFormNotify {
  return { enabled: false, recipients: [] };
}

/**
 * An in-memory {@link FormsPort} for tests — the fake that lets a test describe "this form
 * exists" or "the save fails" directly, instead of hand-building fetch `Response`s. Shipped
 * alongside the real binding per the pattern's "every port gets a fake" rule (see
 * `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakeFormsPort(options: FakeFormsPortOptions = {}): FormsPort & {
  /** Every form currently in the fake's store, in list order. */
  readonly forms: AdminFormDefinition[];
} {
  const forms = [...(options.forms ?? [])];

  return {
    forms,

    async listForms() {
      return { data: [...forms] };
    },

    async getForm(id) {
      const found = forms.find((f) => f.id === id);
      if (!found) throw new Error(`fake forms port: unknown form ${id}`);
      return { data: found };
    },

    async createForm(input, options = {}) {
      const created: AdminFormDefinition = {
        id: `fake-${forms.length + 1}`,
        workspaceId: "fake-ws",
        name: input.name,
        slug: input.slug,
        fields: input.fields as AdminFormField[],
        notify: options.notify ?? blankNotify(),
        status: "active",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      };
      forms.push(created);
      return { data: created };
    },

    async updateForm({ id }, options = {}) {
      const index = forms.findIndex((f) => f.id === id);
      if (index < 0) throw new Error(`fake forms port: unknown form ${id}`);
      const updated = { ...forms[index]!, ...options };
      forms[index] = updated;
      return { data: updated };
    },
  };
}
