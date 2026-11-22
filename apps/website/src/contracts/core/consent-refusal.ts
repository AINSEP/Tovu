/** @file The consent refusal a publish returns: consent builds it when its checks fail, publish paths return it as is. */
export type ConsentProblem = { code: string; message: string; field?: string };
/** The existing HTTP 409 / choice envelope; clients perform a reviewed settings publication, then retry.
 * Keeping the choice declarative prevents an untrusted flag from disabling consent in a crawler. */
export function deploymentRefusal({ problems }: { problems: ConsentProblem[] }, _options = {}) {
  return { code: 'CONSENT_REVIEW_REQUIRED', error: 'Review cookie consent before publishing this site.', blockingProblems: problems,
    choices: [
      { id: 'fix-now', label: 'Fix now', href: '/consent?tab=overview', action: 'Review declarations, the privacy policy and readiness before publishing again.' },
      { id: 'publish-without-banner', label: 'Publish without banner', href: '/consent?tab=rules&intent=publish-without-banner', action: 'Explicitly save enabled:false through PUT consent/settings, POST consent/publish with current revision ids, then retry deployment.', warning: 'This disables the banner and optional-content enforcement on the live site too. Optional scripts may run without a visitor choice.' },
    ] };
}
