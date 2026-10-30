import { createContext, useContext, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import type { AdminInstance } from '@jini-ai/admin/core/module';
import type { ModulePageProps, TabViewProps } from '@jini-ai/admin/react/bind-react';
import type { MediaPickerPort } from '@jini-ai/admin/contracts/media-picker';
import type { createOverlayController } from '@jini-ai/admin/react/overlays';
type HostModulePageProps = ModulePageProps & { params?: Readonly<Record<string, unknown>> };
interface ModuleBinding { Provider: ComponentType<{ admin: AdminInstance; children: ReactNode }>; pages: Readonly<Record<string, { Page: LazyExoticComponent<ComponentType<HostModulePageProps>>; tabs: Readonly<Record<string, LazyExoticComponent<ComponentType<TabViewProps>>>> }>> }
export type Runtime = { permissionKey: string; admin: AdminInstance; bindings: Record<string, ModuleBinding>; picker: MediaPickerPort; overlays: ReturnType<typeof createOverlayController> };
export const AdminModulesContext = createContext<Runtime | null>(null);
export function useHostMediaPicker(_required: Record<string, never> = {}, _optional: Record<string, never> = {}) {
  return useContext(AdminModulesContext)?.picker ?? null;
}
