import { expect, it } from "vitest";
import { PluginRulesProvider } from "@jini-ai/admin/screens/plugins/rules-context";
import { AgentPluginDisableConfirmDialog } from "@jini-ai/admin/screens/plugins/AgentPluginDisableConfirmDialog";
import { AddAgentPluginPanel } from "@jini-ai/admin/screens/plugins/AddAgentPluginPanel";
import { AgentPluginRow } from "@jini-ai/admin/screens/plugins/AgentPluginRow";
import { AgentPluginManageButton } from "@jini-ai/admin/screens/plugins/AgentPluginManageButton";
import { AgentPluginUpdateSlot } from "@jini-ai/admin/screens/plugins/AgentPluginUpdateControl";
import { PluginPackageFilesModal } from "@jini-ai/admin/screens/plugins/PluginPackageFilesModal";
import { PluginRemoveConfirmDialog } from "@jini-ai/admin/screens/plugins/PluginRemoveConfirmDialog";
import { PluginRow } from "@jini-ai/admin/screens/plugins/PluginRow";
import { AddPluginPanel } from "@jini-ai/admin/screens/plugins/AddPluginPanel";
import { InstalledTabIcon, DownloadedTabIcon, MarketplaceTabIcon, PluginTrashIcon } from "@jini-ai/admin/screens/plugins/plugins-visuals";
import { AgentPlugins } from "../AgentPlugins";
import { Plugins } from "../Plugins";

it("binds AgentPlugins to the original provider, overlays, panels and row controls", () => {
  expect(AgentPlugins({}).props.kit).toMatchObject({
    PluginRulesProvider,
    AgentPluginDisableConfirmDialog,
    AddAgentPluginPanel,
    AgentPluginRow,
    AgentPluginManageButton,
    AgentPluginUpdateSlot,
  });
});

it("binds Plugins to the same original provider and its overlays, panels, rows and icons", () => {
  expect(Plugins({}).props.kit).toMatchObject({
    PluginRulesProvider,
    PluginPackageFilesModal,
    PluginRemoveConfirmDialog,
    PluginRow,
    AddPluginPanel,
    InstalledTabIcon,
    DownloadedTabIcon,
    MarketplaceTabIcon,
    PluginTrashIcon,
  });
});
