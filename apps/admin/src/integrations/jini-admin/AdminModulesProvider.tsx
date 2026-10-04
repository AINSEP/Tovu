import type { ReactNode } from 'react';
import { useAdminModules, useModuleProviderContent } from './modules.hooks';
export function AdminModulesProvider(props: { permissions: readonly string[]; children: ReactNode }, _optional: Record<string, never> = {}) {
  const runtime = useAdminModules(props);
  const content = useModuleProviderContent({ runtime, children: props.children });
  return <>{content}</>;
}
