import type { PublishReadinessCopy } from "@jini-ai/cms/publish/content/publish-readiness";

/**
 * @file This product's publish-readiness sentences, supplied to `describePublishReadiness`
 * (`@jini-ai/cms/publish/content/publish-readiness`), which decides the verdict and authors no
 * wording. The vocabulary rule in that module's header binds this copy: no sentence here may name a
 * key, token, grant, principal, capability, workspace or installation id, generation, peer or
 * bundle — `__tests__/publish-agent-tools.test.ts` asserts it over every reachable sentence.
 */

/** Joins site names the way a sentence does — "a", "a and b", "a, b and c".
 *  @complexity O(n) in the list length. */
function nameList({ labels }: { labels: readonly string[] }, _optional = {}): string {
  if (labels.length === 1) return labels[0] as string;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1] as string}`;
}

export const PUBLISH_READINESS_COPY: PublishReadinessCopy = {
  nothingPublishable: {
    summary: "There is nothing on this site that can be copied to a live site yet.",
    missing: "This site has no pages, posts or other content set up to be published.",
    nextStep: "Add something to this site first, then come back.",
  },
  publishesTo: ({ siteLabels }) => `This computer publishes to ${nameList({ labels: siteLabels })}.`,
  notConnected: ({ siteLabel }) => ({
    summary: `This computer is not set up to publish to ${siteLabel} yet.`,
    missing: `This computer has not been connected to ${siteLabel}.`,
    nextStep: `Connect this computer to ${siteLabel}, then publish.`,
  }),
  // The never-deployed install. An ordinary first run, so: no fault, no code, no vocabulary.
  noLiveSite: {
    summary: "There is no live site to publish to yet.",
    missing: "This site has never been put online, so there is nowhere to publish to.",
    nextStep: "Put this site online once, then come back and connect this computer to it.",
  },
};
