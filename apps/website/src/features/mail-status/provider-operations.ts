import { planMailProviderCredential as plan, saveMailProviderCredential as save } from "@jini-ai/user-management/mail/status/provider-operations";
import { createCustomCredential, describeCredential, updateCustomCredential, type CustomCredentialWriteDeps } from "#src/features/custom-credentials/index";

export function planMailProviderCredential(required: Omit<Parameters<typeof plan>[0], "category">, _optional: Record<string, never> = {}) {
  return plan({ ...required, category: "ops" });
}

export function saveMailProviderCredential(required: Omit<Parameters<typeof save>[0], "credentials" | "category"> & { credentials: CustomCredentialWriteDeps }, optional: Parameters<typeof save>[1] = {}) {
  return save({ ...required, category: "ops", credentials: {
    create: input => createCustomCredential(required.credentials, input),
    describe: input => describeCredential(required.credentials, input),
    update: input => updateCustomCredential(required.credentials, input),
  } }, optional);
}
