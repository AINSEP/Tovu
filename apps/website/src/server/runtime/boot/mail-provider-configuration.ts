import { createMailConfiguration } from "@jini-ai/agent-plugins/lifecycle/mail";
import { MAIL_CREDENTIAL_CATEGORY } from "./mail-provider-catalog.js";
export const { describeMailProviders } = createMailConfiguration({ mailHostText: {
 localOnly: "only prints mail locally and never delivers it",
 missingCredential: ({ label }) => `has no complete saved credential "${label}" under Access Tokens (category "${MAIL_CREDENTIAL_CATEGORY}")`,
} });
