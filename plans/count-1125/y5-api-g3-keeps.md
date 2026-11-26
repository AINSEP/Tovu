# Y5 API host bindings

These retained host bindings contain product policy and effect injection for their Jini owners.

| path | LOC | residual |
| --- | ---: | --- |
| features/agent-plugins/connect-bindings.ts | 139 | Host catalog, copy, identity policy, MCP projection and configured connect dependencies. |
| features/agent-plugins/exports/bindings.ts | 11 | Host URL prefix, manifest identity policy and binary-read effect. |
| features/webhooks/site-key-read-bindings.ts | 24 | Host environment, metadata fields, path segments, filesystem and home isolation. |

## Keep rules

```text
^apps/website/src/features/agent\-plugins/connect\-bindings\.ts$
^apps/website/src/features/agent\-plugins/exports/bindings\.ts$
^apps/website/src/features/webhooks/site\-key\-read\-bindings\.ts$
```
