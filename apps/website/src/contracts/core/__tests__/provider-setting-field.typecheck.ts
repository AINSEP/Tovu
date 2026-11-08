/** Provider-field projections stay local until the plugins vocabulary lane moves.
 * This host-only pin compares both current public owners, including optional additions.
 */
import type { ProviderSettingFieldProjection } from '@jini-ai/agent-plugins/lifecycle/host-tools';
import type { PluginProviderSettingField } from '@jini-ai/plugins/host';

type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Projection = ProviderSettingFieldProjection;
type Canonical = PluginProviderSettingField;
type Properties = { [K in keyof Projection]: Equal<Projection[K], Canonical[K]> };
export type ProviderSettingFieldCompatibility = [
  Assert<Projection extends Canonical ? true : false>,
  Assert<Canonical extends Projection ? true : false>,
  Assert<Equal<keyof Projection, keyof Canonical>>,
  Assert<Equal<Projection, Canonical>>,
  Assert<Exclude<Properties[keyof Properties], undefined> extends true ? true : false>,
];
