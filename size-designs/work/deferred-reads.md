# Deferred reads in the two composition roots (measured)

`node work/deferred-reads.cjs <file> <function>` (TypeScript AST, syntax only; needs `typescript`, path at the top of the script).
It lists every identifier read **inside a nested function** whose `const`/`let` is declared **later** in the outer function body.
Format: `binding(declaration line) <- reading lines`. Base: Tovu `integ/wave-b-r2` 65302ee5. Not listed (found by reading): `let` cells declared early and reassigned late.

```
== deps.ts composeSiteRouteDeps
routeDeps(2265) <- 1109,1115,1563,1798,2262
observability(2014) <- 1138
workspaceId(1163) <- 1140,1141,1144
settingsRepo(1263) <- 1141
contentTypeRepo(1774) <- 1243
outbox(1424) <- 1243
mediaRepo(2108) <- 1525,1528,1546,1551,1609,1788
postRepo(2095) <- 1525,1540,1609,1658,1793,1805
assetBlobRepo(2109) <- 1552,1609
entryRefsRepo(1766) <- 1552,1609
mediaContentTypeStore(2112) <- 1788
mailDurableOutboxReady(2053) <- 2048
== app.ts createRouteDeps
agentPluginLayout(1171) <- 483
routeDeps(1198) <- 485,899,900,901,902,1175,1181,1195
contentTypeRepo(972) <- 499
outbox(584) <- 499
formDefinitionRepo(966) <- 750,751,764
entryRefsRepo(963) <- 811,899
menuRepo(964) <- 823,824,844
navLocationBindingRepo(965) <- 843
transformDefinitionRepo(1167) <- 984
mediaContentTypeStore(1064) <- 984
```
