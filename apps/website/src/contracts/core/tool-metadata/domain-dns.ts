import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** domain-dns registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "domain_check_dns": {
    search: {
      keywords: "domain DNS custom points pointing host hosting deploy target expected compare mismatch apex www publish destination",
      queries: [
        "Does my custom domain point at the right host?",
        "Compare my domain DNS against the hosting address.",
        "Is www pointing to the deploy target?",
        "Check whether the apex DNS matches my publish destination.",
        "Why is the domain pointing at a different hosting IP?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "domain_lookup_dns": {
    search: {
      keywords: "domain DNS dig lookup resolve records A AAAA CNAME MX TXT NS nameservers propagation apex www IP mail verification ACME challenge _acme-challenge DKIM DMARC _dmarc _domainkey",
      queries: [
        "What DNS records does my domain have?",
        "Show the A and AAAA IP addresses for the apex and www.",
        "Look up the MX and TXT records for my domain.",
        "Which nameservers handle this domain?",
        "Has the DNS change propagated yet?",
        "Look up ACME challenge CNAME and DKIM or DMARC TXT records.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "domain_tls_status": {
    search: {
      keywords: "domain TLS SSL HTTPS certificate status valid trust trusted expired hostname mismatch security",
      queries: [
        "Is the TLS certificate for my domain valid?",
        "Check my SSL certificate status.",
        "Is HTTPS trusted on this domain?",
        "Has my site's certificate expired?",
        "Does the certificate match the domain hostname?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
