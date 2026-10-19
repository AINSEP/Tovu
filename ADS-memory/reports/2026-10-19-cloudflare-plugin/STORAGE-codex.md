Software Architect(Direct), with DevOps: personas loaded for storage architecture and deployment research.

**Checked October 19, 2026. Tovu can run on Cloudflare Containers, but its ordinary container disk cannot safely hold the only copy of site data.** The smallest reliable route reuses Tovu’s existing Postgres and S3 support.

**1. What Containers provides today**

Containers became **generally available on April 13, 2026**. The newer Durable Object scheduling policy and filesystem snapshots remain **public beta**. [GA announcement](https://blog.cloudflare.com/sandbox-ga/), [September changelog](https://developers.cloudflare.com/changelog/product/containers/)

| Instance | vCPU | RAM | Local disk |
|---|---:|---:|---:|
| lite | 1/16 | 256 MiB | 2 GB |
| basic | 1/4 | 1 GiB | 4 GB |
| standard-1 | 1/2 | 4 GiB | 8 GB |
| standard-2 | 1 | 6 GiB | 12 GB |
| standard-3 | 2 | 8 GiB | 16 GB |
| standard-4 | 4 | 12 GiB | 20 GB |

Custom sizes support 1–4 vCPU, up to 12 GiB RAM and 20 GB disk, with at least 3 GiB RAM per vCPU. Images must fit that disk. Default account ceilings are 6 TiB concurrent RAM, 1,500 vCPU and 30 TB disk—roughly 15,000 lite or 6,000 basic instances. Configure an application’s `max_instances`; request increases for larger limits. [Current limits](https://developers.cloudflare.com/containers/platform/limits/)

Traffic follows **visitor → Worker → Durable Object binding → container port**. A stable Durable Object name addresses the same logical instance; that object’s durable storage is separate from the container filesystem. Cold starts commonly take 1–3 seconds, plus Tovu’s startup work. [Lifecycle and routing](https://developers.cloudflare.com/containers/concepts/architecture/)

Sleep is configurable. With the direct Container API, the inactivity timeout can extend to six hours after the Durable Object becomes inactive; active requests and streams keep it active. Node background activity alone is insufficient to guarantee continued operation. [Container API](https://developers.cloudflare.com/containers/api/durable-object-container/), [Lifetime](https://developers.cloudflare.com/sandbox/concepts/lifetime/)

Placement supports eastern/western North America, eastern/western Europe, Asia Pacific and South America; Middle East, Oceania and Africa have limited capacity and cannot be exclusive choices without special access. Geographic constraints are available with the default scheduling policy; the beta Durable Object policy rejects those configuration fields. [Placement](https://developers.cloudflare.com/containers/concepts/placement/), [Policy restrictions](https://developers.cloudflare.com/containers/reference/wrangler-configuration/)

Build a **linux/amd64** image. `wrangler deploy` can build a configured Dockerfile and push it to Cloudflare’s registry; alternatively use `wrangler containers build -p` or `wrangler containers push`. The beta scheduling policy requires digest-pinned Cloudflare registry references for prebuilt images. [Getting started](https://developers.cloudflare.com/containers/get-started/), [Image management](https://developers.cloudflare.com/containers/guides/image-management/)

Compatibility points for Tovu:

- **WebSockets work**, and SSE can stream through the Worker/DO proxy. Connected HTTP requests have no fixed wall-clock deadline; proxy response bodies without buffering. Deployments can interrupt connections, so reconnection remains necessary. [WebSocket example](https://developers.cloudflare.com/containers/examples/websocket/), [Request limits](https://developers.cloudflare.com/workers/platform/limits/), [Deployment effects](https://developers.cloudflare.com/sandbox/concepts/lifetime/)
- **Background processes can run**, but sleep/replacement ends them. Worker `waitUntil()` provides only 30 seconds after response/disconnection; dependable scheduled work needs alarms, queues or another durable scheduler. [Limits](https://developers.cloudflare.com/workers/platform/limits/), [Container alarms](https://developers.cloudflare.com/containers/api/durable-object-container/)
- **Outbound Internet access is supported**, including direct Postgres TCP when enabled. With `enableInternet: false`, ordinary non-HTTP traffic is denied; HTTP handlers do not magically proxy Postgres port 5432. [Outbound networking](https://developers.cloudflare.com/containers/configuration/outbound-traffic/)
- Worker upload limits still apply: normally 100 MB on Free/Pro zones and 200 MB on Business. Container RAM and disk also constrain uploads, image processing and assistant tools. [Worker limits](https://developers.cloudflare.com/workers/platform/limits/)

**2. “Cloudflare-native stores” means managed storage services outside the container**

| Service | Plain explanation and Tovu fit |
|---|---|
| **D1** | Cloudflare runs SQLite for you. Suitable for content, users, submissions and chat records after adapter work. Paid databases max out at **10 GB each**, queries at **30 seconds**, rows at **2 MB**, and queries at **100 parameters**. It offers transactional batches, rather than Tovu’s existing interactive transaction contract. [Limits](https://developers.cloudflare.com/d1/platform/limits/), [Batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/) |
| **Durable Objects + SQLite** | Each named object owns a durable SQLite database—up to **10 GB per object on Paid**, with 30-day point-in-time recovery. Useful for per-site state and coordination, but requires a database service/adapter around it. Its SQLite is **not a file mounted inside Node**. [Limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) |
| **R2** | Durable storage for whole objects: images, videos, attachments, exports and backups. Its S3-compatible API matches Tovu’s existing media adapter. It does not execute SQL. [S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/) |
| **KV** | A globally cached key/value store, useful for configuration and caches. Updates can take 60 seconds or more to become visible elsewhere; unsuitable as Tovu’s authoritative transactional database. [Consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/) |
| **Hyperdrive** | Pools and accelerates connections to an **existing external Postgres/MySQL database**. It does not provide the database itself. A Node container can instead use its existing Postgres driver directly. [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) |

A Node container can reach D1 through its authenticated [HTTP API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/), or call a Worker HTTP handler that uses a D1 binding. The same handler approach exposes Durable Object operations. Bindings do not become native Node database handles. [Container binding access](https://developers.cloudflare.com/containers/configuration/workers-connections/)

**Least change:** existing Postgres support wins overall. Among Cloudflare-owned SQL services, D1 is the nearest SQL family, but neither D1 nor Durable Objects is a drop-in replacement for `content.db` or `chat.db`.

**3. Why “just save SQLite and regular files to disk” fails**

SQLite itself runs on container disk. **Persistence is the problem:** stopping/sleeping and recreating an instance normally starts with fresh disk from the image. A Node-process restart alone need not erase files; an image rollout replaces instances, while a Worker-only deployment can leave an existing instance running. [Disk lifecycle](https://developers.cloudflare.com/containers/faq/), [Deployment lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/)

I found **no documented Fly-style persistent block volume**. Two alternatives exist:

- **Native snapshots, beta since September 30:** use `scheduling_policy: "durable_object"`, call `snapshotContainer()`, save its handle in DO storage, then restore with `start({ containerSnapshot, … })`. Snapshots are immutable, filesystem-only, limited to 20 GB, expire after 30 days unless restored, and are tied to their original image version. [Snapshot instructions](https://developers.cloudflare.com/containers/guides/snapshots/), [Limits](https://developers.cloudflare.com/containers/platform/limits/)
- **R2 mounted through FUSE:** presents objects as files, but lacks full local filesystem semantics. Cloudflare documents it for datasets/models/assets; s3fs lacks atomic renames and coordination between clients. I would not put live SQLite/WAL databases there. [Cloudflare FUSE guidance](https://developers.cloudflare.com/containers/examples/r2-fuse-mount/), [s3fs limitations](https://github.com/s3fs-fuse/s3fs-fuse)

Snapshots recover the **last captured state**; writes since then can be lost. Multiple containers with local SQLite produce independent, divergent databases. Uploading occasional database copies to R2 neither coordinates writers nor guarantees every acknowledged save survives. A reliable SQLite scheme would need a single writer, WAL-safe replication/backups and tested restoration.

**4. What Tovu already supports**

- **Fly:** the plugin mounts a pre-created volume at `/workspace/Tovu/sites`, keeps one machine running and explicitly forbids scaling its SQLite deployment above one machine. It does **not provision Postgres**. The renderer mounts the volume but does not create it. [Fly template](/Users/la/Programming/Tovu/content/agent-plugins/fly/skills/fly/references/fly.template.toml:50), [Renderer](/Users/la/Programming/Tovu/content/agent-plugins/fly/deploy-configs/fly.mjs:80)
- **Postgres:** already holds both content in `public` and chat in `ai_chat`, through one connection pool. Current selection comes from `.site-meta.json` storage configuration, also exposed through `init --storage postgres --storage-env …`; **`TOVU_DB=postgres` is not the selector**. [Store opener](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/open-site-store.ts:23), [Init options](/Users/la/Programming/Tovu/apps/website/src/cli/commands/init.ts:37)
- **Media:** `TOVU_MEDIA_BLOB_STORE=s3` activates the existing private-bucket adapter; R2 uses its endpoint and region `auto`. The `s3-compatible` plugin separately publishes static exports—it is not the runtime media store. [Runtime adapter](/Users/la/Programming/Tovu/apps/website/src/features/media/blob-store.s3.ts:8), [Static publishing plugin](/Users/la/Programming/Tovu/content/agent-plugins/s3-compatible/targets/s3-compatible.mjs:1)
- **Remaining disk dependency:** `ops/database-journal.db` stays local SQLite even in Postgres mode. Server/daemon logs, mutable themes/plugins and chat attachment staging also use site files. Postgres restore points are currently reported unavailable. [Journal composition](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/deps.ts:1665), [Logs](/Users/la/Programming/Tovu/apps/website/src/platform/server-logs/index.ts:22), [Site files](/Users/la/Programming/Tovu/apps/website/src/platform/site-dir/layout.ts:65), [Restore capability](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/store-bound-services.ts:10)

**5. Recommendation: reuse Postgres + R2, and finish the remaining persistence seams**

Start with **one named container per site**, using the default scheduling policy and `max_instances: 1`.

- **Content and chat:** external managed Postgres using the existing adapters; configure provider backups/PITR.
- **Media and durable attachments/files:** private R2 objects. Mutable themes/plugins/site metadata need durable write-through handling; keep only caches and temporary work on container disk.
- **Operational journal:** add a durable backend behind its existing ports, preserving its independence from content restoration—for example, a separate Postgres database. ADR-041’s separation rule needs an explicit architecture decision before changing its SQLite implementation.
- **Logs:** capture stdout/stderr with Cloudflare observability; archive to R2 where needed. Preserving Tovu’s in-app historical log reader requires an adapter.
- **Jobs:** persist progress and make retries safe; use DO alarms/queues to wake the site when necessary.

**Plugin-only work:** image build/push, Worker/DO routing, secrets, resource provisioning, readiness checks and existing Postgres/R2 configuration. **Core/Jini work remains:** operational journal persistence, mutable file/attachment handling, historical log access and durable job recovery. Reusable mechanisms belong in the existing Jini owners. An entirely Cloudflare-owned design would instead require D1/DO database compatibility work; the inspected Jini kernel currently has no such driver and explicitly distinguishes their transaction limitations. [Kernel contract](/Users/la/Programming/Jini/packages/db/src/kernel/port.ts:29)

**Rough cost:** Workers Paid starts at **$5/month**. Containers charge provisioned RAM/disk while running and active CPU usage; included allowances are shared per account. My 30-day calculation gives approximately **$12 for always-running basic** or **$32 for standard-1**, including the plan and RAM/disk, before CPU, DO/request/log charges, excess egress and external Postgres. Container egress starts at $0.025/GB in North America/Europe after the included 1 TB. [Container pricing](https://developers.cloudflare.com/containers/platform/pricing/)

R2 Standard includes 10 GB-month, then costs **$0.015/GB-month**, plus operations, with free R2 egress. Tovu’s current media proxy can still incur container egress when serving those bytes. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

**Verification limit:** documentation and current source were inspected; no live Cloudflare deployment, sizing, streaming or recovery test was performed. Graph tools were unavailable, so source discovery used direct reads and `rg`. No files changed.
