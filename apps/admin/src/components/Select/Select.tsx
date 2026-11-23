import "../../styles/select.css";
import { Select as PackageSelect, resolveSelectTriggerLabel as resolvePackageLabel, type SelectOption, type SelectProps as PackageProps } from "@jini-ai/ui/admin-widgets";

import { type Translate } from '@jini-ai/core/text';
export type { SelectOption } from "@jini-ai/ui/admin-widgets";

export type SelectProps = PackageProps;

/** Host stylesheet + the package Select. An injected `useDropdown` takes the package's two-object
 *  `({ value, onChange, options }, { disabled })` signature and reaches it unchanged — no
 *  single-object adapter in between. */
export function Select(props: SelectProps) {
  return <PackageSelect {...props} />;
}

/** Keep the host's helper contract while Jini resolves translated trigger copy. */
export function resolveSelectTriggerLabel({ selectedOption, placeholder }: { selectedOption: SelectOption | null; placeholder: string | undefined }, { t = (key) => key }: { t?: Translate } = {}) {
  return resolvePackageLabel({ selectedOption, placeholder }, { t });
}
// Search/listbox rationale: Jini/packages/ui/src/features/admin-widgets/components/Select/Select.tsx.
