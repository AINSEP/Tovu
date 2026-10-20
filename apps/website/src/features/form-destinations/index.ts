/**
 * @file Public surface of the form destinations category: where a published static site's form
 * submissions go, contributed by Agent Plugins (`tovu-form-destinations.json`). See `./types.ts`.
 */
export type {
  FormDeliveryConnectionPort,
  FormDestinationAddress,
  FormDestinationCredential,
  FormDestinationDescriptor,
  FormDestinationForm,
  FormDestinationKit,
  FormDestinationModule,
  FormDestinationPage,
  FormDestinationPublishInput,
  FormDestinationRegistry,
  FormReceiverPlan,
  FormReceiverPort,
  FormSubmissionsInspection,
  LoadedFormDestination,
  RemoteFormSubmission,
} from "./types.js";
export { buildFormDestinationRegistry, FORM_DESTINATIONS_FILENAME, loadFormDestinationRegistry, loadFormDestinationRegistryFromSource, parseFormDestinationsFile } from "./registry.js";
export { FORM_RECEIVER_AUTO, FORM_RECEIVER_NONE, selectFormReceiver, type FormReceiverSelection } from "./select.js";
export { assertSubmitUrl, rewriteFormActions } from "./rewrite-actions.js";
export { formDestinationKeyLabel, formReceiverKey, listFormDestinations } from "./key-store.js";
export { formDestinationKey, pullFromFormDestination, type FormDestinationImportPort } from "./pull.js";
export { createFormDestinationPort, type FormDestinationPortDeps } from "./port.js";
export { createFormDestinationDeliverer } from "./deliver.js";
export { createCustomCredentialConnectionPort } from "./connection-port.js";
