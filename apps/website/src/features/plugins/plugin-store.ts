import { pluginKernel as kernelOf, type PluginKernel, type PluginStore } from "@jini-ai/db/data-modules";
export type { PluginStore, PluginCoreTables, PluginKernel } from "@jini-ai/db/data-modules";

export function pluginKernel(store: PluginStore): PluginKernel { return kernelOf({ store }); }
