# jy-cls refresh notes

Validation is deferred to the coordinator as dispatched. No tests, builds, type checks, linters, installs, API/catalog generation, or git mutations were run.

## J-CLS-UI item skips

A token is skipped everywhere in this package when an emitter is over the hard limit, keeping existing selectors coherent. Cross-package matches include prose and persisted/tool selectors, as the CULL says to skip a token found in another package.

- `a2ui-card`: cross-package: chat, ui; packages/ui/src/features/a2ui/renderer.tsx:72 RenderNode (64 lines, complexity 8).
- `a2ui-placeholder`: cross-package: chat, ui; packages/ui/src/features/a2ui/renderer.tsx:72 RenderNode (64 lines, complexity 8).
- `a2ui-placeholder-cycle`: cross-package: chat, ui; packages/ui/src/features/a2ui/renderer.tsx:72 RenderNode (64 lines, complexity 8).
- `a2ui-placeholder-missing`: cross-package: chat, ui; packages/ui/src/features/a2ui/renderer.tsx:72 RenderNode (64 lines, complexity 8).
- `a2ui-row`: cross-package: chat, ui; packages/ui/src/features/a2ui/renderer.tsx:72 RenderNode (64 lines, complexity 8).
- `asset-grid-card`: packages/ui/src/features/asset-grid/react/components/AssetCard.tsx:70 AssetCard (74 lines, complexity 7).
- `asset-grid-card-meta`: packages/ui/src/features/asset-grid/react/components/AssetCard.tsx:70 AssetCard (74 lines, complexity 7).
- `asset-grid-card-preview-btn`: packages/ui/src/features/asset-grid/react/components/AssetCard.tsx:70 AssetCard (74 lines, complexity 7).
- `asset-grid-card-preview-overlay`: packages/ui/src/features/asset-grid/react/components/AssetCard.tsx:70 AssetCard (74 lines, complexity 7).
- `asset-grid-card-select-check`: packages/ui/src/features/asset-grid/react/components/AssetCard.tsx:70 AssetCard (74 lines, complexity 7).
- `asset-grid-card-subtitle`: packages/ui/src/features/asset-grid/react/components/AssetCard.tsx:70 AssetCard (74 lines, complexity 7).
- `asset-grid-card-thumb`: packages/ui/src/features/asset-grid/react/components/AssetCard.tsx:70 AssetCard (74 lines, complexity 7).
- `asset-grid-card-thumb-lazy`: packages/ui/src/features/asset-grid/react/components/AssetCard.tsx:70 AssetCard (74 lines, complexity 7).
- `asset-grid-card-title`: packages/ui/src/features/asset-grid/react/components/AssetCard.tsx:70 AssetCard (74 lines, complexity 7).
- `asset-grid-refresh-btn`: packages/ui/src/features/asset-grid/react/components/AssetGridToolbar.tsx:78 AssetGridToolbar (51 lines, complexity 5).
- `asset-grid-root`: packages/ui/src/features/asset-grid/react/components/AssetGrid.tsx:100 AssetGrid (82 lines, complexity 3).
- `asset-grid-search`: packages/ui/src/features/asset-grid/react/components/AssetGridToolbar.tsx:78 AssetGridToolbar (51 lines, complexity 5).
- `asset-grid-search-icon`: packages/ui/src/features/asset-grid/react/components/AssetGridToolbar.tsx:78 AssetGridToolbar (51 lines, complexity 5).
- `asset-grid-search-wrap`: packages/ui/src/features/asset-grid/react/components/AssetGridToolbar.tsx:78 AssetGridToolbar (51 lines, complexity 5).
- `asset-grid-toolbar`: packages/ui/src/features/asset-grid/react/components/AssetGridToolbar.tsx:78 AssetGridToolbar (51 lines, complexity 5).
- `asset-tree-drop-overlay`: packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBrowser.tsx:77 AssetTreeBrowser (71 lines, complexity 7).
- `asset-tree-drop-overlay-card`: packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBrowser.tsx:77 AssetTreeBrowser (71 lines, complexity 7).
- `asset-tree-main`: packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBrowser.tsx:77 AssetTreeBrowser (71 lines, complexity 7).
- `asset-tree-preview`: packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx:43 FilePreviewPane (72 lines, complexity 5).
- `asset-tree-preview-close`: packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx:43 FilePreviewPane (72 lines, complexity 5).
- `asset-tree-preview-download`: packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx:43 FilePreviewPane (72 lines, complexity 5).
- `asset-tree-preview-kind`: packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx:43 FilePreviewPane (72 lines, complexity 5).
- `asset-tree-preview-meta`: packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx:43 FilePreviewPane (72 lines, complexity 5).
- `asset-tree-preview-name`: packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx:43 FilePreviewPane (72 lines, complexity 5).
- `asset-tree-preview-open-cta`: packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx:43 FilePreviewPane (72 lines, complexity 5).
- `asset-tree-preview-placeholder`: packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx:43 FilePreviewPane (72 lines, complexity 5).
- `asset-tree-preview-stats`: packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx:43 FilePreviewPane (72 lines, complexity 5).
- `asset-tree-preview-thumb`: packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx:43 FilePreviewPane (72 lines, complexity 5).
- `asset-tree-preview-thumb-open`: packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx:43 FilePreviewPane (72 lines, complexity 5).
- `asset-tree-reloading-overlay`: packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBrowser.tsx:77 AssetTreeBrowser (71 lines, complexity 7).
- `comment-side-new-comment`: packages/ui/src/features/viewer-shell/react/components/CommentSideParts.tsx:82 CommentSideCreateForm (66 lines, complexity 7).
- `comment-side-new-comment-actions`: packages/ui/src/features/viewer-shell/react/components/CommentSideParts.tsx:82 CommentSideCreateForm (66 lines, complexity 7).
- `comment-side-new-comment-shell`: packages/ui/src/features/viewer-shell/react/components/CommentSideParts.tsx:82 CommentSideCreateForm (66 lines, complexity 7).
- `composer-input-wrap`: packages/ui/src/features/viewer-shell/react/components/CommentSideParts.tsx:82 CommentSideCreateForm (66 lines, complexity 7).
- `composer-shell`: packages/ui/src/features/viewer-shell/react/components/CommentSideParts.tsx:82 CommentSideCreateForm (66 lines, complexity 7).
- `composer-spacer`: packages/ui/src/features/viewer-shell/react/components/CommentSideParts.tsx:82 CommentSideCreateForm (66 lines, complexity 7).
- `composer-textarea-layer`: packages/ui/src/features/viewer-shell/react/components/CommentSideParts.tsx:82 CommentSideCreateForm (66 lines, complexity 7).
- `connector-card-actions`: packages/ui/src/features/connectors/components/ConnectorCard.tsx:199 ConnectorCard (74 lines, complexity 6).
- `connector-card-head`: packages/ui/src/features/connectors/components/ConnectorCard.tsx:199 ConnectorCard (74 lines, complexity 6).
- `connector-card-title`: packages/ui/src/features/connectors/components/ConnectorCard.tsx:199 ConnectorCard (74 lines, complexity 6).
- `connector-card-title-name`: packages/ui/src/features/connectors/components/ConnectorCard.tsx:199 ConnectorCard (74 lines, complexity 6).
- `connector-card-top`: packages/ui/src/features/connectors/components/ConnectorCard.tsx:199 ConnectorCard (74 lines, complexity 6).
- `connector-drawer`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:400 ConnectorDetailDrawer (102 lines, complexity 2).
- `connector-drawer-backdrop`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:400 ConnectorDetailDrawer (102 lines, complexity 2).
- `connector-drawer-body`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:400 ConnectorDetailDrawer (102 lines, complexity 2).
- `connector-drawer-close`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:56 ConnectorDrawerHead (53 lines, complexity 6).
- `connector-drawer-count`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:400 ConnectorDetailDrawer (102 lines, complexity 2).
- `connector-drawer-eyebrow`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:56 ConnectorDrawerHead (53 lines, complexity 6).
- `connector-drawer-head`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:56 ConnectorDrawerHead (53 lines, complexity 6).
- `connector-drawer-section`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:400 ConnectorDetailDrawer (102 lines, complexity 2).
- `connector-drawer-section-title`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:400 ConnectorDetailDrawer (102 lines, complexity 2).
- `connector-drawer-status`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:56 ConnectorDrawerHead (53 lines, complexity 6).
- `connector-drawer-titles`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:56 ConnectorDrawerHead (53 lines, complexity 6).
- `connector-drawer-tool-count-chip`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:56 ConnectorDrawerHead (53 lines, complexity 6).
- `connector-grid`: packages/ui/src/features/connectors/components/ConnectorGrid.tsx:74 ConnectorGrid (60 lines, complexity 8).
- `connector-meta`: packages/ui/src/features/connectors/components/ConnectorCard.tsx:199 ConnectorCard (74 lines, complexity 6).
- `connector-meta-category`: packages/ui/src/features/connectors/components/ConnectorCard.tsx:199 ConnectorCard (74 lines, complexity 6).
- `connector-meta-dot`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:56 ConnectorDrawerHead (53 lines, complexity 6).
- `connector-meta-item`: packages/ui/src/features/connectors/components/ConnectorCard.tsx:199 ConnectorCard (74 lines, complexity 6).
- `connector-status-dot`: packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx:56 ConnectorDrawerHead (53 lines, complexity 6).
- `connectors-heading`: packages/ui/src/features/connectors/ConnectorsBrowser.tsx:111 ConnectorsBrowser (82 lines, complexity 2).
- `connectors-panel`: packages/ui/src/features/connectors/ConnectorsBrowser.tsx:111 ConnectorsBrowser (82 lines, complexity 2).
- `connectors-panel-embedded`: packages/ui/src/features/connectors/ConnectorsBrowser.tsx:111 ConnectorsBrowser (82 lines, complexity 2).
- `connectors-search`: packages/ui/src/features/connectors/components/ConnectorSearchBar.tsx:20 ConnectorSearchBar (54 lines, complexity 5).
- `external-mcp-stored-at`: cross-package: daemon, ui.
- `icon-btn`: packages/ui/src/features/viewer-shell/react/components/CommentSideParts.tsx:82 CommentSideCreateForm (66 lines, complexity 7).
- `lang-menu-check`: packages/ui/src/react/components/LanguageMenu.tsx:156 LanguageMenu (61 lines, complexity 5).
- `lang-menu-code`: packages/ui/src/react/components/LanguageMenu.tsx:156 LanguageMenu (61 lines, complexity 5).
- `lang-menu-label`: packages/ui/src/react/components/LanguageMenu.tsx:156 LanguageMenu (61 lines, complexity 5).
- `lang-menu-wrap`: packages/ui/src/react/components/LanguageMenu.tsx:156 LanguageMenu (61 lines, complexity 5).
- `library-card`: packages/ui/src/features/memory/react/components/MemoryEntryCard.tsx:15 MemoryEntryCard (68 lines, complexity 7); packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx:16 MemoryExtractionCard (70 lines, complexity 5).
- `library-card-action`: packages/ui/src/features/memory/react/components/MemoryEntryCard.tsx:15 MemoryEntryCard (68 lines, complexity 7); packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx:16 MemoryExtractionCard (70 lines, complexity 5).
- `library-card-badge`: packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx:16 MemoryExtractionCard (70 lines, complexity 5).
- `library-card-desc`: packages/ui/src/features/memory/react/components/MemoryEntryCard.tsx:15 MemoryEntryCard (68 lines, complexity 7); packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx:16 MemoryExtractionCard (70 lines, complexity 5).
- `library-card-expand`: packages/ui/src/features/memory/react/components/MemoryEntryCard.tsx:15 MemoryEntryCard (68 lines, complexity 7).
- `library-card-info`: packages/ui/src/features/memory/react/components/MemoryEntryCard.tsx:15 MemoryEntryCard (68 lines, complexity 7); packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx:16 MemoryExtractionCard (70 lines, complexity 5).
- `library-card-name`: packages/ui/src/features/memory/react/components/MemoryEntryCard.tsx:15 MemoryEntryCard (68 lines, complexity 7); packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx:16 MemoryExtractionCard (70 lines, complexity 5).
- `library-card-title-row`: packages/ui/src/features/memory/react/components/MemoryEntryCard.tsx:15 MemoryEntryCard (68 lines, complexity 7); packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx:16 MemoryExtractionCard (70 lines, complexity 5).
- `library-content`: packages/ui/src/features/memory/react/components/MemoryList.tsx:232 MemoryList (87 lines, complexity 2).
- `library-preview`: packages/ui/src/features/memory/react/components/MemoryEntryCard.tsx:15 MemoryEntryCard (68 lines, complexity 7).
- `markdown-rendered`: occurs in another assigned file.
- `memory-card-actions`: packages/ui/src/features/memory/react/components/MemoryEntryCard.tsx:15 MemoryEntryCard (68 lines, complexity 7); packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx:16 MemoryExtractionCard (70 lines, complexity 5).
- `memory-connector-actions`: packages/ui/src/features/memory/react/components/MemorySuggestionPanel.tsx:43 MemorySuggestionPanel (60 lines, complexity 5).
- `memory-extraction-counts`: packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx:16 MemoryExtractionCard (70 lines, complexity 5).
- `memory-extraction-failure`: packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx:16 MemoryExtractionCard (70 lines, complexity 5).
- `memory-extraction-ids`: packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx:16 MemoryExtractionCard (70 lines, complexity 5).
- `memory-extraction-reason`: packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx:16 MemoryExtractionCard (70 lines, complexity 5).
- `memory-hooks-panel`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1).
- `memory-hooks-panel-head`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1).
- `memory-hooks-panel-head-icon`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1).
- `memory-hooks-panel-hint`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1).
- `memory-hooks-panel-list`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1).
- `memory-hooks-panel-row`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1).
- `memory-hooks-panel-row-copy`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1).
- `memory-hooks-panel-row-desc`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1).
- `memory-hooks-panel-row-icon`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1).
- `memory-hooks-panel-row-label`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1).
- `memory-hooks-panel-title`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1).
- `memory-hooks-panel-toggle`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1).
- `memory-icon-btn`: packages/ui/src/features/memory/react/components/MemorySettingsPanel.tsx:88 MemorySettingsPanel (73 lines, complexity 5).
- `memory-management-panel`: packages/ui/src/features/memory/react/components/MemoryList.tsx:232 MemoryList (87 lines, complexity 2).
- `memory-panel-head-card`: packages/ui/src/features/memory/react/components/MemorySettingsPanel.tsx:88 MemorySettingsPanel (73 lines, complexity 5).
- `memory-panel-master-toggle`: packages/ui/src/features/memory/react/components/MemorySettingsPanel.tsx:88 MemorySettingsPanel (73 lines, complexity 5).
- `memory-records-section`: packages/ui/src/features/memory/react/components/MemoryList.tsx:232 MemoryList (87 lines, complexity 2).
- `memory-settings-panel`: packages/ui/src/features/memory/react/components/MemorySettingsPanel.tsx:88 MemorySettingsPanel (73 lines, complexity 5).
- `memory-source-action`: packages/ui/src/features/memory/react/components/MemorySuggestionPanel.tsx:43 MemorySuggestionPanel (60 lines, complexity 5).
- `memory-source-badge`: packages/ui/src/features/memory/react/components/MemorySuggestionPanel.tsx:43 MemorySuggestionPanel (60 lines, complexity 5).
- `memory-subsection-head`: packages/ui/src/features/memory/react/components/MemoryList.tsx:232 MemoryList (87 lines, complexity 2); packages/ui/src/features/memory/react/components/MemorySuggestionPanel.tsx:43 MemorySuggestionPanel (60 lines, complexity 5).
- `memory-suggestion-list`: packages/ui/src/features/memory/react/components/MemorySuggestionPanel.tsx:43 MemorySuggestionPanel (60 lines, complexity 5).
- `memory-suggestion-panel`: packages/ui/src/features/memory/react/components/MemorySuggestionPanel.tsx:43 MemorySuggestionPanel (60 lines, complexity 5).
- `memory-unified-list`: packages/ui/src/features/memory/react/components/MemoryList.tsx:232 MemoryList (87 lines, complexity 2).
- `onboarding-view__select-label`: packages/ui/src/react/components/OnboardingDropdown.tsx:515 OnboardingDropdown (60 lines, complexity 4).
- `palette-tweaks`: packages/ui/src/react/components/PaletteTweaks.tsx:165 PaletteTweaks (66 lines, complexity 3).
- `palette-tweaks-check`: packages/ui/src/react/components/PaletteTweaks.tsx:165 PaletteTweaks (66 lines, complexity 3).
- `palette-tweaks-chip`: packages/ui/src/react/components/PaletteTweaks.tsx:165 PaletteTweaks (66 lines, complexity 3).
- `palette-tweaks-chip-original`: packages/ui/src/react/components/PaletteTweaks.tsx:165 PaletteTweaks (66 lines, complexity 3).
- `palette-tweaks-header`: packages/ui/src/react/components/PaletteTweaks.tsx:165 PaletteTweaks (66 lines, complexity 3).
- `palette-tweaks-label`: packages/ui/src/react/components/PaletteTweaks.tsx:165 PaletteTweaks (66 lines, complexity 3).
- `palette-tweaks-list`: packages/ui/src/react/components/PaletteTweaks.tsx:165 PaletteTweaks (66 lines, complexity 3).
- `palette-tweaks-stripe`: packages/ui/src/react/components/PaletteTweaks.tsx:165 PaletteTweaks (66 lines, complexity 3).
- `palette-tweaks-stripe-original`: packages/ui/src/react/components/PaletteTweaks.tsx:165 PaletteTweaks (66 lines, complexity 3).
- `palette-tweaks-sub`: packages/ui/src/react/components/PaletteTweaks.tsx:165 PaletteTweaks (66 lines, complexity 3).
- `palette-tweaks-title`: packages/ui/src/react/components/PaletteTweaks.tsx:165 PaletteTweaks (66 lines, complexity 3).
- `resource-board-card-body`: packages/ui/src/features/resource-dashboard/react/components/ResourceCard.tsx:36 ResourceCard (56 lines, complexity 5).
- `resource-kanban-board`: packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:33 ResourceKanbanBoard (70 lines, complexity 1).
- `resource-kanban-card-close`: packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:33 ResourceKanbanBoard (70 lines, complexity 1); packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:44 <anonymous> (56 lines, complexity 2).
- `resource-kanban-card-subtitle`: packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:33 ResourceKanbanBoard (70 lines, complexity 1); packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:44 <anonymous> (56 lines, complexity 2).
- `resource-kanban-card-title`: packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:33 ResourceKanbanBoard (70 lines, complexity 1); packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:44 <anonymous> (56 lines, complexity 2).
- `resource-kanban-column`: packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:33 ResourceKanbanBoard (70 lines, complexity 1); packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:44 <anonymous> (56 lines, complexity 2).
- `resource-kanban-column-count`: packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:33 ResourceKanbanBoard (70 lines, complexity 1); packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:44 <anonymous> (56 lines, complexity 2).
- `resource-kanban-column-empty`: packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:33 ResourceKanbanBoard (70 lines, complexity 1); packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:44 <anonymous> (56 lines, complexity 2).
- `resource-kanban-column-header`: packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:33 ResourceKanbanBoard (70 lines, complexity 1); packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:44 <anonymous> (56 lines, complexity 2).
- `resource-kanban-column-list`: packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:33 ResourceKanbanBoard (70 lines, complexity 1); packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx:44 <anonymous> (56 lines, complexity 2).
- `resource-row-history`: packages/ui/src/features/resource-dashboard/react/components/ResourceRunHistoryList.tsx:24 ResourceRunHistoryList (61 lines, complexity 4).
- `resource-row-history-actions`: packages/ui/src/features/resource-dashboard/react/components/ResourceRunHistoryList.tsx:24 ResourceRunHistoryList (61 lines, complexity 4).
- `resource-row-history-empty`: packages/ui/src/features/resource-dashboard/react/components/ResourceRunHistoryList.tsx:24 ResourceRunHistoryList (61 lines, complexity 4).
- `resource-row-history-head`: packages/ui/src/features/resource-dashboard/react/components/ResourceRunHistoryList.tsx:24 ResourceRunHistoryList (61 lines, complexity 4).
- `resource-row-history-list`: packages/ui/src/features/resource-dashboard/react/components/ResourceRunHistoryList.tsx:24 ResourceRunHistoryList (61 lines, complexity 4).
- `resource-row-history-row`: packages/ui/src/features/resource-dashboard/react/components/ResourceRunHistoryList.tsx:24 ResourceRunHistoryList (61 lines, complexity 4).
- `resource-row-history-status`: packages/ui/src/features/resource-dashboard/react/components/ResourceRunHistoryList.tsx:24 ResourceRunHistoryList (61 lines, complexity 4).
- `resource-row-list-items`: packages/ui/src/features/resource-dashboard/react/components/ResourceRowListViewParts.tsx:74 ResourceRowListRows (62 lines, complexity 1).
- `search-icon`: cross-package: agent-runtime, ui; packages/ui/src/features/connectors/components/ConnectorSearchBar.tsx:20 ConnectorSearchBar (54 lines, complexity 5).
- `settings-section`: packages/ui/src/features/memory/react/components/MemoryList.tsx:232 MemoryList (87 lines, complexity 2).
- `settings-section-card`: packages/ui/src/features/memory/react/components/MemoryList.tsx:232 MemoryList (87 lines, complexity 2).
- `skeleton-shimmer`: cross-package: ui, daemon, agent-plugins.
- `sketch-canvas-wrap`: packages/ui/src/features/sketch-editor/react/components/SketchEditor.tsx:178 SketchEditor (54 lines, complexity 3).
- `sketch-editor`: cross-package: README.md, daemon, provider-plugins, ui; occurs in another assigned file; packages/ui/src/features/sketch-editor/react/components/SketchEditor.tsx:178 SketchEditor (54 lines, complexity 3).
- `sketch-excalidraw-wrap`: packages/ui/src/features/sketch-editor/react/components/SketchEditor.tsx:178 SketchEditor (54 lines, complexity 3).
- `status-pending`: cross-package: ui, user-management.
- `tab-panel`: cross-package: ui, admin, ui-kit; packages/ui/src/features/connectors/ConnectorsBrowser.tsx:111 ConnectorsBrowser (82 lines, complexity 2).
- `tab-panel-toolbar`: packages/ui/src/features/connectors/ConnectorsBrowser.tsx:111 ConnectorsBrowser (82 lines, complexity 2).
- `toggle-slider`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1); packages/ui/src/features/memory/react/components/MemorySettingsPanel.tsx:88 MemorySettingsPanel (73 lines, complexity 5); packages/ui/src/features/skills/react/components/SkillRow.tsx:172 SkillRowActions (53 lines, complexity 3).
- `toggle-switch`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1); packages/ui/src/features/memory/react/components/MemorySettingsPanel.tsx:88 MemorySettingsPanel (73 lines, complexity 5); packages/ui/src/features/skills/react/components/SkillRow.tsx:172 SkillRowActions (53 lines, complexity 3).
- `toggle-switch-sm`: packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx:62 MemoryHooksPanel (61 lines, complexity 1); packages/ui/src/features/skills/react/components/SkillRow.tsx:172 SkillRowActions (53 lines, complexity 3).
- `toolbar-left`: packages/ui/src/features/connectors/ConnectorsBrowser.tsx:111 ConnectorsBrowser (82 lines, complexity 2).
- `toolbar-right`: packages/ui/src/features/connectors/ConnectorsBrowser.tsx:111 ConnectorsBrowser (82 lines, complexity 2).
- `toolbar-search`: packages/ui/src/features/connectors/components/ConnectorSearchBar.tsx:20 ConnectorSearchBar (54 lines, complexity 5).
- `toolbar-search-clear`: packages/ui/src/features/connectors/components/ConnectorSearchBar.tsx:20 ConnectorSearchBar (54 lines, complexity 5).
- `viewer-action`: packages/ui/src/features/viewer-shell/react/components/ViewportSwitcher.tsx:33 ViewportSwitcher (57 lines, complexity 7).
- `viewer-empty`: packages/ui/src/features/viewer-shell/react/components/MarkdownSplitPane.tsx:72 MarkdownSplitPane (57 lines, complexity 8).
- `viewer-viewport-icon`: packages/ui/src/features/viewer-shell/react/components/ViewportSwitcher.tsx:33 ViewportSwitcher (57 lines, complexity 7).
- `viewer-viewport-menu`: packages/ui/src/features/viewer-shell/react/components/ViewportSwitcher.tsx:33 ViewportSwitcher (57 lines, complexity 7).
- `viewer-viewport-menu-label`: packages/ui/src/features/viewer-shell/react/components/ViewportSwitcher.tsx:33 ViewportSwitcher (57 lines, complexity 7).
- `viewer-viewport-switcher`: packages/ui/src/features/viewer-shell/react/components/ViewportSwitcher.tsx:33 ViewportSwitcher (57 lines, complexity 7).
- `viewer-viewport-trigger`: packages/ui/src/features/viewer-shell/react/components/ViewportSwitcher.tsx:33 ViewportSwitcher (57 lines, complexity 7).

Existing test files reached by the exact token greps and repointed:

- `packages/ui/src/features/asset-grid/react/components/__tests__/AssetCard.l161.characterization.test.tsx`
- `packages/ui/src/features/asset-grid/react/components/__tests__/AssetGrid.l161.characterization.test.tsx`
- `packages/ui/src/features/asset-tree-browser/__tests__/react/components/AssetTreeBrowser.test.tsx`
- `packages/ui/src/features/connectors/__tests__/components/ConnectorDetailDrawer.test.tsx`
- `packages/ui/src/features/connectors/__tests__/components/ConnectorGrid.test.tsx`
- `packages/ui/src/features/connectors/__tests__/components/ConnectorLogo.test.tsx`
- `packages/ui/src/features/iframe-pool/react/components/IframeKeepAliveProvider.test.tsx`
- `packages/ui/src/features/iframe-pool/react/components/PooledIframe.ssr.test.tsx`
- `packages/ui/src/features/memory/__tests__/react/components/MemoryAdvancedModal.test.tsx`
- `packages/ui/src/features/memory/__tests__/react/components/MemoryConnectedPanel.test.tsx`
- `packages/ui/src/features/memory/__tests__/react/components/MemoryExtractionCard.test.tsx`
- `packages/ui/src/features/memory/__tests__/react/components/MemoryList.test.tsx`
- `packages/ui/src/features/memory/__tests__/react/render-markdown.test.tsx`
- `packages/ui/src/features/progress-card/__tests__/components/ProgressCard.characterization.test.tsx`
- `packages/ui/src/features/progress-card/__tests__/components/ProgressCard.test.tsx`
- `packages/ui/src/features/progress-card/__tests__/components/ProgressCard.w5-pin.test.tsx`
- `packages/ui/src/features/resource-dashboard/__tests__/ResourceBoardView.test.tsx`
- `packages/ui/src/features/resource-dashboard/__tests__/ResourceCard.test.tsx`
- `packages/ui/src/features/resource-dashboard/__tests__/ResourceRowListItem.test.tsx`
- `packages/ui/src/features/source-config-list/__tests__/SourceConfigItemCard.test.tsx`
- `packages/ui/src/features/source-config-list/react/components/SourceConfigList.test.tsx`
- `packages/ui/src/features/viewer-shell/__tests__/react/components/CommentSidePanel.test.tsx`
- `packages/ui/src/features/viewer-shell/__tests__/react/components/MarkdownSplitPane.test.tsx`
- `packages/ui/src/features/viewer-shell/__tests__/react/components/ViewerShell.test.tsx`
- `packages/ui/src/react/__tests__/components/AppChromeHeader.test.tsx`
- `packages/ui/src/react/__tests__/components/Loading.test.tsx`
- `packages/ui/src/react/__tests__/components/Notice.test.tsx`
- `packages/ui/src/react/components/EditorIcon.test.tsx`

IDs, data attributes, test IDs, agent handles, docs, comments, custom properties and keyframes were kept verbatim. No computed-prefix family required a rename.

## J-ARGS-UI2 caller closure

The exact named-symbol greps reached two additional existing test importers, updated with the same argument repoint: `packages/ui/src/react/__tests__/components/LanguageMenu.test.tsx` and `packages/ui/src/react/__tests__/components/PaletteTweaks.test.tsx`. The width helper test importer is the one named in the dispatch. No unlisted production importer. `packages/ui/docs/spec/api.spec.md` was intentionally left unchanged; updated signatures are in COMMIT-PLAN.md.

## J-CLS-CA item skips

- `a2ui-card`: cross-package: chat, ui; packages/chat/src/react/components/A2uiSurfaceCard.tsx:42 RenderComponent (100 lines, complexity 9).
- `a2ui-placeholder`: cross-package: chat, ui; packages/chat/src/react/components/A2uiSurfaceCard.tsx:42 RenderComponent (100 lines, complexity 9).
- `a2ui-placeholder-cycle`: cross-package: chat, ui; packages/chat/src/react/components/A2uiSurfaceCard.tsx:42 RenderComponent (100 lines, complexity 9).
- `a2ui-placeholder-missing`: cross-package: chat, ui; packages/chat/src/react/components/A2uiSurfaceCard.tsx:42 RenderComponent (100 lines, complexity 9).
- `a2ui-row`: cross-package: chat, ui; packages/chat/src/react/components/A2uiSurfaceCard.tsx:42 RenderComponent (100 lines, complexity 9).
- `mcpui-surface-card-empty`: packages/chat/src/react/components/McpUiSurfaceCard.tsx:306 SurfaceCardContent (69 lines, complexity 6).
- `qf-color`: cross-package: chat, daemon.
- `qf-direction-cards`: cross-package: chat, daemon.
- `qf-field`: cross-package: chat, daemon.
- `qf-file`: cross-package: chat, daemon.
- `qf-file-summary`: cross-package: chat, daemon.
- `qf-file-wrap`: cross-package: chat, daemon.
- `qf-help`: cross-package: chat, daemon.
- `qf-input`: cross-package: chat, daemon.
- `qf-label`: cross-package: daemon, chat.
- `qf-options`: cross-package: daemon, chat.
- `qf-range`: cross-package: daemon, chat.
- `qf-range-value`: cross-package: daemon, chat.
- `qf-range-wrap`: cross-package: daemon, chat.
- `qf-required`: cross-package: daemon, chat.
- `qf-select`: cross-package: daemon, chat.
- `qf-switch`: cross-package: daemon, chat.
- `tab-panel`: cross-package: ui, admin, ui-kit.
- `widget-config-form`: packages/admin/src/widgets/react/pages/WidgetInstanceEditor.tsx:35 WidgetInstanceEditor (66 lines, complexity 3).

J-PADS: `QuestionForm.tsx` already has props-only `QuestionFormHead` and `QuestionFormFoot`; the main component uses the framework-required `ref`. No component pad is present. Lowercase `definedGuardOptions`, `isQuestionFormLocked` and `formsListColumns` pads remain. All ten removed admin pads have only JSX callers and no `Parameters<typeof X>` references.

Existing test/snapshot files reached and repointed:

- `packages/admin/src/react/shell/__tests__/AdminShell.slots.test.tsx`
- `packages/admin/src/react/shell/__tests__/__snapshots__/AdminShell.markup.test.tsx.snap`
- `packages/chat/src/react/components/__tests__/MessageRow.display.test.tsx`
- `packages/chat/src/react/components/__tests__/QuestionForm.test.tsx`
- `packages/chat/src/react/components/__tests__/TodoCard.l199.characterization.test.tsx`
- `packages/chat/src/react/components/__tests__/TodoCard.test.tsx`
- `packages/chat/src/react/components/__tests__/ToolCard.long-chat-memory.test.tsx`
- `packages/chat/src/react/components/__tests__/ToolCard.test.tsx`
- `packages/chat/src/react/features/chat-pane/__tests__/styles-tool-row-chevron.test.ts`

## J-ARGS-CHAT caller closure

Updated the existing production callers reached by the named greps: `QuestionForm.answers.hooks.ts`, `QuestionFormField.tsx`, and internal calls in `QuestionForm.values.ts`. The predicates are invoked inside filter callbacks, not passed as callback values or bound in a table. The daemon call-shape TSV is historical documentation, not a caller; it remains unchanged. The existing `QuestionForm.test.tsx` hit is a test name only, so no test repoint was needed.

## J-01 / J-02

No stopped sheets. External headroom-constant mentions occur only in the two existing InfoTip test comments named by the sheet; they are not symbol uses and remain unchanged. The UI API baseline contains none of the eight named internals.
