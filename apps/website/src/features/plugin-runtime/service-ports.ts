/** Consumer-owned service boundaries for install policy. The plugin-execution ports
 * (`PluginPostReadPort`, `PluginProviderFacesPort`) live in `@jini-ai/plugins/runtime/service-ports`. */
import type { HostSignals } from "@tovu/contracts/host-signals";

/** Host facts are resolved by composition before install policy runs. */
export interface PluginHostFactsPort {
  readonly hostSignals: HostSignals;
}
