import { useState } from "react";
import { formatUserFacingError } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import type { AdminTaxonomy, AdminTaxonomyWithTerms } from "@/lib/api";
import { adminFailureChannel } from "@/lib/admin-failure-channel";
import { uniqueId } from "@/lib/unique-id";
import { TOVU_ADMIN_VERSION } from "@/lib/app-version";
import { taxonomyHtmlEmbed } from "../html-rules";

/** Copy follows Forms' saved-identity and visible-feedback contract; clipboard is a swappable port. */
export function useTaxonomyHtmlEmbed(
  { taxonomies, t }: { taxonomies: readonly AdminTaxonomyWithTerms[] | null; t: (key: string) => string },
  { clipboard }: { clipboard?: { writeText: (text: string) => Promise<void> } } = {},
) {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  async function copyHtmlEmbed({ taxonomy }: { taxonomy: AdminTaxonomy }, _optional = {}) {
    const failureGeneration = adminFailureChannel.getGeneration();
    try {
      await (clipboard ?? navigator.clipboard).writeText(taxonomyHtmlEmbed({ taxonomy, taxonomies: (taxonomies ?? []).map((group) => group.taxonomy) }));
      setCopyFeedback(t("Copied!"));
    } catch (error) {
      const message = t("The taxonomy HTML embed could not be copied.");
      const action = t("Check your browser's clipboard permissions and try again.");
      setCopyFeedback(`${message} ${action}`);
      adminFailureChannel.publish({ generation: failureGeneration, failure: formatUserFacingError({
        message, action, step: "Copy taxonomy HTML embed", cause: error,
      }, { ...TOVU_ERROR_REDACTION_OPTIONS, errorId: uniqueId(), appVersion: `Tovu Admin ${TOVU_ADMIN_VERSION}`, time: new Date().toISOString() }) });
    }
  }
  return { copyHtmlEmbed, copyFeedback };
}
