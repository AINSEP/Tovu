import type { ReactNode } from 'react';
import type { UseAdminLocaleHook } from '@jini-ai/admin/react/kit';
import { useAdminModules, useModuleProviderContent } from './modules.hooks';
export function AdminModulesProvider(
  {
    useAdminModulesHook = useAdminModules,
    useModuleProviderContentHook = useModuleProviderContent,
    ...props
  }: { permissions: readonly string[]; useAdminLocaleHook: UseAdminLocaleHook; grantsReady?: boolean; children: ReactNode; useAdminModulesHook?: typeof useAdminModules; useModuleProviderContentHook?: typeof useModuleProviderContent }
) {
  const runtime = useAdminModulesHook({ permissions: props.permissions, useAdminLocaleHook: props.useAdminLocaleHook, grantsReady: props.grantsReady });
  const content = useModuleProviderContentHook({ runtime, children: props.children });
  return <>{content}</>;
}
