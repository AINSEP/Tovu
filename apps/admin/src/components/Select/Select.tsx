import "../../styles/select.css";
import { Select as PackageSelect, resolveSelectTriggerLabel as resolvePackageLabel, type SelectOption, type SelectProps as PackageProps } from "@jini-ai/ui/admin-widgets";
import type { useSelectDropdown } from "./Select.hooks";
import type { Translate } from "@jini-ai/ui/panel-kit";

export type { SelectOption } from "@jini-ai/ui/admin-widgets";

export type SelectProps = Omit<PackageProps, "useDropdown"> & {
  useDropdown?: typeof useSelectDropdown;
};

/** Preserve the host's injectable hook props while the package owns rendering and live effects. */
export function Select({ useDropdown, ...props }: SelectProps) {
  const useHostDropdown: PackageProps["useDropdown"] = useDropdown
    ? (required, optional = {}) => useDropdown({ ...required, ...optional })
    : undefined;
  return <PackageSelect {...props} useDropdown={useHostDropdown} />;
}

/** Keep the host's helper contract while Jini resolves translated trigger copy. */
export function resolveSelectTriggerLabel(selectedOption: SelectOption | null, placeholder: string | undefined, t: Translate = (key) => key) {
  return resolvePackageLabel({ selectedOption, placeholder }, { t });
}
// Search/listbox rationale: Jini/packages/ui/src/features/admin-widgets/components/Select/Select.tsx.
