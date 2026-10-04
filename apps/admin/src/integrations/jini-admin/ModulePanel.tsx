import { useModulePanel, type ModulePanelProps } from './modules.hooks';
export function ModulePanel(props: ModulePanelProps, _optional: Record<string, never> = {}) {
  const vm = useModulePanel(props);
  return <>{vm.content}</>;
}
