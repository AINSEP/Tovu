import { useState } from "react";
import type { AdminTaxonomy, AdminTaxonomyWithTerms } from "@/lib/api";
import { taxonomyHtmlEmbed } from "../html-rules";

/** Copy follows Forms' saved-identity and visible-feedback contract; clipboard is a swappable port. */
export function useTaxonomyHtmlEmbed(
  { taxonomies, t }: { taxonomies: readonly AdminTaxonomyWithTerms[] | null; t: (key: string) => string },
  { clipboard }: { clipboard?: { writeText: (text: string) => Promise<void> } } = {},
) {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  async function copyHtmlEmbed({ taxonomy }: { taxonomy: AdminTaxonomy }, _optional = {}) {
    try {
      await (clipboard ?? navigator.clipboard).writeText(taxonomyHtmlEmbed({ taxonomy, taxonomies: (taxonomies ?? []).map((group) => group.taxonomy) }));
      setCopyFeedback(t("Copied!"));
    } catch {
      setCopyFeedback(t("Could not copy embed"));
    }
  }
  return { copyHtmlEmbed, copyFeedback };
}
