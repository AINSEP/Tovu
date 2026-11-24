import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import type { AuthoritativeDnsPort, DnsProviderContext, DnsProviderRegistry } from "@jini-ai/devops/dns";
import type { DomainBindingStore } from "./binding.repo.js";
import type { MailRequirementsPort } from "@jini-ai/devops/dns/site/mail-requirements";
import type { SenderDomainVerificationPort } from "@jini-ai/platform/mail";

/** Workspace authorization plus the DNS kernel ports built in the composition root. */
export interface DnsChangeToolDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  registry: DnsProviderRegistry;
  resolver: AuthoritativeDnsPort;
  context: DnsProviderContext;
  /** Absent when the composition has no content database (hermetic roots): `dns_verify` refuses. */
  bindings?: DomainBindingStore;
  /** The resolved mailer's `domainRequirements` (`include: ["mail"]`). Absent: that include refuses. */
  mailRequirements?: MailRequirementsPort;
  /** The mail provider's own sender-domain verdict, for `mail_dns_status`. Absent: reported as `null`. */
  senderDomainVerification?: SenderDomainVerificationPort;
  now: () => number;
}

