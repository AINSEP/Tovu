/**
 * @file Public surface of the form destinations category: where a published static site's form
 * submissions go, contributed by Agent Plugins (`jini-form-destinations.json`). See `@jini-ai/cms/forms`.
 */
export { FORM_DESTINATIONS_FILENAME, loadFormDestinationRegistry, loadFormDestinationRegistryFromSource } from "./registry.js";
export { assertSubmitUrl, rewriteFormActions } from "./rewrite-actions.js";
export { formDestinationKeyLabel, formReceiverKey, listFormDestinations } from "./key-store.js";
export { createFormDestinationPort, type FormDestinationPortDeps } from "./port.js";
export { createFormDestinationDeliverer } from "./deliver.js";
export { createCustomCredentialConnectionPort } from "./connection-port.js";
