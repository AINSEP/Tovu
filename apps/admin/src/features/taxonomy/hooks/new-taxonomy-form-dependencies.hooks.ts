import { api } from "@/lib/api";
import type { NewTaxonomyFormPort } from "./new-taxonomy-form-port.hooks";

/**
 * @file The only place under `features/taxonomy/hooks` that reaches `lib/api` for
 * `createTaxonomy` — see `new-taxonomy-form-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies.hooks.ts`'s
 *  `defaultRedirectsPort`. */
export const defaultNewTaxonomyFormPort: NewTaxonomyFormPort = {
  createTaxonomy: (input) => api.createTaxonomy(input),
};

/** Seed state for {@link createFakeNewTaxonomyFormPort}. */
export interface FakeNewTaxonomyFormPortOptions {
  /** When set, `createTaxonomy` rejects with this message instead of succeeding. */
  createError?: string;
}

/**
 * An in-memory {@link NewTaxonomyFormPort} for tests — the fake that lets a test describe "the
 * create succeeds" or "the create fails" directly, instead of hand-building fetch `Response`s.
 * Shipped alongside the real binding per the pattern's "every port gets a fake" rule (see
 * `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakeNewTaxonomyFormPort(
  options: FakeNewTaxonomyFormPortOptions = {}
): NewTaxonomyFormPort & {
  /** Every taxonomy the fake's `createTaxonomy` has created, in call order. */
  readonly created: AdminTaxonomyCreateCall[];
} {
  const created: AdminTaxonomyCreateCall[] = [];

  return {
    created,

    async createTaxonomy(input) {
      if (options.createError) throw new Error(options.createError);
      created.push(input);
      return {
        taxonomy: {
          id: `fake-${created.length}`,
          name: input.name,
          hierarchical: input.hierarchical,
          status: "active",
          updatedAt: new Date(0).toISOString(),
          version: 1,
        },
      };
    },
  };
}

/** The exact payload one `createTaxonomy` call received — recorded for assertions. */
type AdminTaxonomyCreateCall = { name: string; hierarchical: boolean };
