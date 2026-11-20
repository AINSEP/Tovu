import type { ReactNode } from 'react';
import { useAdminModules, useModuleProviderContent } from './modules.hooks';
export function AdminModulesProvider(
  {
    useAdminModulesHook = useAdminModules,
    useModuleProviderContentHook = useModuleProviderContent,
    ...props
  }: { permissions: readonly string[]; children: ReactNode; useAdminModulesHook?: typeof useAdminModules; useModuleProviderContentHook?: typeof useModuleProviderContent }
) {
  const runtime = useAdminModulesHook(props);
  const content = useModuleProviderContentHook({ runtime, children: props.children });
  return <>{content}</>;
}
