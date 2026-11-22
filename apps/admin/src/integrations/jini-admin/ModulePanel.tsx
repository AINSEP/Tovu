import { useModulePanel, type ModulePanelProps } from './modules.hooks';
export function ModulePanel({ useModulePanelHook = useModulePanel, ...props }: ModulePanelProps & { useModulePanelHook?: typeof useModulePanel }) {
  const vm = useModulePanelHook(props);
  return <>{vm.content}</>;
}
