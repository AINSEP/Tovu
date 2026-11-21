# DG-C Jini refresh

- J1: no additional test importers needing repoint. Combine must link the required authorizer input with Tovu V1 and update the API baseline/release linkage.
- J3: no additional test importers needing repoint; the additive signal option preserves existing one-argument calls. Target write service matches merge-9 before this change; no S6 overlap found.
- J4: STOPPED at the unlisted production type importer `packages/cms/src/widgets/host-ports.ts:3`; it exposes `updateEntry` through `WidgetHostPorts.entries.updateEntry:58`. Refresh the sheet's production-importer inventory before redispatch. No entries files changed and no test repoints performed. Target write service matches merge-9; no S6 overlap found.
- QJ1: injected visibility case and exact-path normalization contract remain present; no anchor refresh or importer changes needed.

All execution and mutation checks remain with combine; none ran here.
