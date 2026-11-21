# Jini catch-only census

**241 remaining historical keys, 454 recorded findings. Eight files have READY sheets in one Jini job.** The base is `origin/integ/merge-7-2026-11-20` at `06559affb`. `O` numbers refer to the historical ledger ordinals used by the prior census. I matched them to merge‑7 by `(file, rule)`. Every row below is for `catch-reads-error`. Line numbers are on merge‑7 unless a pushed ref is named.

KEEP retains the existing behavior and any live ledger debt. A READY row can retain other findings in the same file. E3 needs a private diagnostic owner, E4 needs the incident or wire boundary, E6 needs the feature notice owner and disclosure policy, E8 needs the run-event carrier, and E9 needs sidecar ownership.

## Disposition

| Key | Status | Merge‑7 evidence and disposition |
|---|---|---|
|2|BLOCKED-E6|Plugin files `:27` needs a listing notice that respects generation.|
|3|BLOCKED-E6|Plugin controller `:22,51` needs distinct action and list notices.|
|38|KEEP|SEO `:47` isolates the optional refresh after the PUT commits.|
|48|BLOCKED-E3|Token tool `:213,291` needs private validator and post-save activation fault ownership.|
|52|KEEP|Token import `:194` already warns with safe fields. Importer failures can echo tokens.|
|54|BLOCKED-E3|Plugin host `:188,229` needs private identity-read causes behind its existing warnings.|
|55|BLOCKED-E3|Token sign-in `:78` collapses resolver failure into unsupported.|
|60|KEEP|Activation `:895` is post-rename directory sync. The committed write stands.|
|62|BLOCKED-E3|Bundled digests `:116,229` masks ledger I/O as empty or unchanged.|
|63|KEEP|Bundled file policy `:20` sends unreadable files through full scanning.|
|64|BLOCKED-E3|Capability projection `:34,44,59` needs private file diagnostics behind safe refusals.|
|73|BLOCKED-E3|Package roots `:58,65` needs per-root diagnostics while discovery continues.|
|75|KEEP|Package paths `:100,127` walks existing ancestors and applies containment afterward.|
|76|KEEP|Provider contribution `:85,97` refuses one hostile descriptor or parser and continues.|
|77|BLOCKED-E3|Plugin references `:212,249,334` needs private discovery, stat and skill-read causes.|
|78|BLOCKED-E3|Bundled seed `:323,333` needs a discovery owner for skipped roots.|
|79|KEEP|`set-enabled:101` isolates the optional observer after activation commits.|
|80|BLOCKED-E3|Skill reader `:72–75,132,153` needs private filesystem and close ownership.|
|81|KEEP|Capability tools `:135,156` fail closed when serialization or inspection throws.|
|82|BLOCKED-E3|Uninstall `:365,388–389,489–502` needs compensation diagnostics while preserving stranded-tree evidence.|
|89|BLOCKED-E3|Pi session `:108,118,211` needs transcript and attachment diagnostics.|
|93|READY|Anthropic live models `:145` leaves the CLI’s existing offline model list available.|
|94|BLOCKED-E3|Claude model discovery `:135,227,235,268` needs probe, read and cleanup ownership.|
|95|KEEP|Filesystem policy `:84,106` preserves launch eligibility during inconclusive capability probes.|
|97|KEEP|Executable resolution `:34` rejects an unresolvable candidate and continues selection.|
|99|BLOCKED-E3|Codex launch `:62,122–159` needs probe and descriptor-cleanup ownership.|
|100|KEEP|Pi `:56` treats a failed optional model probe as unavailable.|
|101|BLOCKED-E3|Detection `:158,289,424,467` needs owners for config, catalog and executable-probe faults.|
|102|KEEP|Executables `:244` rejects a candidate whose runnability check failed.|
|104|BLOCKED-E3|MMD routes `:128` needs to distinguish absent configuration from read failure.|
|105|BLOCKED-E3|Model adapters `:199–228,281,376,396` needs probe and cleanup ownership while preserving fallback order.|
|106|BLOCKED-E3|Model discovery `:174,252` needs private cache and launch-configuration diagnostics.|
|107|KEEP|OpenCode logs `:67,79,89` skip unavailable diagnostic inputs and preserve the run outcome.|
|108|BLOCKED-E4|AIHubMix `:150` needs safe provider-error reading and private cause handling.|
|109|BLOCKED-E3|Connection guard `:158` needs DNS diagnostics while denying. Keep the URL refusal at `:94`.|
|110|BLOCKED-E4|Connection test `:490` needs safe body-read ownership. Keep the non-JSON fallback at `:336`.|
|111|BLOCKED-E3|OAuth callback `:98,211` needs cleanup ownership while preserving timeout settlement.|
|112|BLOCKED-E3|OAuth credentials `:57` needs private refresh and persistence diagnostics before fallback.|
|114|BLOCKED-E4|Ollama `:260` falls back to provider response text. Pin safe detail at the consumer.|
|117|KEEP|Qoder `:50,187` retains display output and forwards unrecognized stream lines as raw.|
|118|BLOCKED-E3|Site guide `:94,106,147` needs diagnostics while retaining authorization denial and unavailable enrichment.|
|120|BLOCKED-E3|Forwarding `:175,250` needs private causes behind fixed reports. Keep cache eviction at `:281`.|
|121|KEEP|Analytics fanout `:9–13` contains sink and vendor failure so other vendors receive events.|
|122|KEEP|Product analytics `:77,118,133–150` drops unsafe events, isolates vendors, and preserves consent invalidation.|
|124|BLOCKED-E3|Artifact stub guard `:94,148,174` needs inspection diagnostics behind unavailable candidates.|
|125|KEEP|JWT adapter `:111` returns the same safe rejection for unreadable verification input.|
|127|BLOCKED-E4|A2UI poster `:135` needs the safe failure-body reader before changing diagnostics.|
|129|BLOCKED-E8|Durable subscription `:78,89,141` needs reconnect ownership and terminal-event parity.|
|130|BLOCKED-E8|Assistant transport `:535,781,844` needs body-reader, conversation and persistence ownership after AG‑UI adoption.|
|157|BLOCKED-E8|Durable accept `:24,30` preserves a committed attempt despite observer or dispatch failure. Pin incident ownership.|
|158|BLOCKED-E8|Durable recovery `:32,157,168,190,197` needs verdict and cleanup ownership across cancellation and replay.|
|160|BLOCKED-E4|CLI errors `:158` needs reader parity for raw excerpts and the structured envelope.|
|161|BLOCKED-E4|CLI HTTP `:135,153,346` needs reader parity for fallback bodies and sanitized formatting.|
|165|BLOCKED-E3|Comment hooks `:51,64` needs separate validator and post-commit observer ownership.|
|166|KEEP|Form collection `:39,69` withholds malformed plugin settings from clients.|
|171|KEEP|Form pull trigger `:23` contains a failing reporter after handing it the cause.|
|175|KEEP|Subscriber notification `:124` contains the terminal logging sink.|
|176|BLOCKED-E3|Attachment reconciliation `:56,60,62` needs private causes while retaining three distinct kept outcomes.|
|178|READY|Submit service `:284` has the host logger. Keep the disk-probe warning and terminal guard at `:272`, and background logger guard at `:294`.|
|182|BLOCKED-E3|Video frames `:24,60,330` needs executable-probe and cleanup ownership after the env sheet.|
|184|BLOCKED-E3|Redirect host config `:143` needs private diagnostics while keeping `oracle-error`.|
|186|BLOCKED-E3|Redirect resolver `:145` needs an outbox owner without delaying redirect resolution.|
|187|BLOCKED-E3|Target gate `:55,112` needs private target-read and origin-oracle ownership.|
|188|KEEP|Taxonomy cleanup `:37` guards the logger that receives the cleanup failure.|
|189|KEEP|Trash sweeper `:170` keeps polling when its error callback throws.|
|190|KEEP|Trash write service `:68` preserves the completed transition when reporting throws.|
|193|BLOCKED-E3|Widget HTML export `:204` needs host lookup and render diagnostics without losing the page.|
|194|BLOCKED-E3|Widget read service `:119` skips bad rows. Pin the existing warning’s private owner.|
|195|KEEP|Page widget resolution `:95` degrades only the malformed region, per REQ‑27.|
|196|KEEP|Widget instance resolution `:39` uses the existing unresolved-reference placeholder.|
|197|BLOCKED-E3|Widget writes `:452,503` need malformed-record ownership behind the existing skips.|
|200|BLOCKED-E3|Catalog tools `:53` already warns after save. Pin the private count-read cause.|
|202|BLOCKED-E3|Commerce plugin `:136` needs private storage-preparation ownership. Keep URL refusal at `:92`.|
|205|BLOCKED-E3|Payment evidence `:193` needs ownership of the failing alert side effect.|
|206|BLOCKED-E3|Outbox relay `:73` needs diagnostics while leaving the unconfirmed publish available for retry.|
|207|BLOCKED-E3|Settlement worker `:43` needs activation-read diagnostics while draining durable work.|
|208|BLOCKED-E3|Ingest worker `:241` needs ownership of alert delivery failure.|
|210|BLOCKED-E3|Payment operations `:178` needs ownership of alert delivery failure.|
|211|BLOCKED-E3|Reconciler `:132` needs private cause ownership behind the `errors` tally.|
|212|BLOCKED-E3|Provider contexts `:55` needs private credential-read ownership behind the refusal.|
|213|KEEP|Consent bridges `:11,31,34` isolate broken mounts and disposal. Consent remains authoritative.|
|214|KEEP|Consent DOM `:42,159` preserves purge behavior and leaves invalid declarations inert.|
|215|KEEP|Consent runtime `:22,73,106–107,233,244` contains plugin failures, preserves receipt retry and withholds stale optional code.|
|216|KEEP|Consent plugin contract `:23` isolates listener failures from other subscribers.|
|217|KEEP|Consent extensions `:11` keeps optional assets inert when installation fails.|
|219|BLOCKED-E3|Consent receipt `:75` needs retirement diagnostics. Keep the fixed invalid-body refusal at `:86`.|
|220|KEEP|Consent region `:39` explicitly defaults to strict policy when resolution fails.|
|228|BLOCKED-E4|Settings HTTP `:23` needs safe request-body classification. Keep terminal diagnostic isolation at `:35`.|
|230|KEEP|Settings stream `:144` guards the sink so cleanup and retries continue.|
|231|BLOCKED-E3|Claude staging `:108,117` needs credential-read and rollback ownership.|
|232|BLOCKED-E3|Claude MCP config `:21` conflates absent inheritance with read failure.|
|233|BLOCKED-E3|Claude MCP delivery `:73` needs inherited-config read ownership.|
|234|BLOCKED-E3|Codex home staging `:176,185` needs separate config-read and cleanup ownership.|
|237|KEEP|Child stream events `:142` preserves the original bridge error if its diagnostic probe fails.|
|238|KEEP|Event cleanup `:42,128` contains throwing diagnostic callbacks after the cleanup outcome is known.|
|239|BLOCKED-E3|HTTP MCP `:31,87` needs a private cleanup and startup owner behind stdio fallback.|
|240|BLOCKED-E3|Launch `:894,1046,1069,1137,1178,1430` needs private staging and cleanup ownership. Refresh after `jz2-a`, which retains these paths.|
|242|BLOCKED-E3|MCP bridge probe `:36,50` needs listener and process teardown ownership.|
|244|KEEP|OpenCode MCP config `:58,118` deliberately rebuilds staging from an invalid inherited document.|
|245|READY|Run output `:88` waits for diagnostic emission while the lifecycle owns terminal state.|
|246|KEEP|Trace lifecycle `:55,100` contains sink failure and removes completed or failed trace bookkeeping.|
|247|KEEP|Tool gaps `:27,121` limits invalid diagnostic inputs and contains the host reporter.|
|248|READY|Delegated correlation `:52` preserves the legacy output path when fingerprinting fails.|
|249|KEEP|Frontend registry `:376` keeps cancellation authoritative despite a closed channel. Same catch on `jm7-a:391`.|
|250|BLOCKED-E3|Attachments `:360` needs cleanup diagnostics without replacing the upload result.|
|251|BLOCKED-E3|Attachment persistence `:251,260` needs removal ownership. Keep restart non-adoption at `:161,179`.|
|252|BLOCKED-E3|Disk attachment store `:14,183` needs cleanup ownership while preserving the original store error.|
|253|BLOCKED-E3|Cancel-owned runs `:45` needs per-run reporting while attempting every cancellation.|
|254|KEEP|Daemon status `:95` contains shutdown wiring failure after the scheduled reply.|
|255|BLOCKED-E4|Delegated tools `:345` needs private recovery reporting behind the original write outcome.|
|257|KEEP|Guest scope `:24` rejects undecodable or otherwise unreadable signed credentials uniformly.|
|260|BLOCKED-E3|Host tools `:131,143,155,178` needs probe and executable-selection diagnostics.|
|261|BLOCKED-E4|Remote events `:214` needs to distinguish run absence from lookup failure privately.|
|264|BLOCKED-E4|Surface restoration `:44` needs a private cause path while preserving the safe frame.|
|267|BLOCKED-E3|Legacy migration `:89,97,192` needs filesystem fault and rename-fallback ownership.|
|268|BLOCKED-E4|Remote attachment lookup `:52` needs reader ownership with status and null-body parity.|
|269|BLOCKED-E8|Remote executor `:198` needs surface-delivery ownership while preserving terminal settlement.|
|270|KEEP|Routine schedule `:104,128,283` treats invalid schedule or time-zone inputs as unusable.|
|271|BLOCKED-E3|Scheduler `:416` needs proof of the completion promise’s existing rejection owner.|
|272|BLOCKED-E3|Run credentials `:221` must deny on lookup failure while recording the cause privately.|
|273|KEEP|Run events `:84` isolates one subscriber so other subscribers still receive the event.|
|274|PARTIAL|Registry `:170` names `start()`’s caller as owner. Verify the existing rejection-and-successor witness for `afterSettled`.|
|276|BLOCKED-E3|Session coordination `:88,111` needs cancellation and emission diagnostics. Finishing stays mandatory.|
|277|KEEP|SQLite event log `:87` preserves the failed initialization when owned-handle close also fails.|
|278|BLOCKED-E8|Surface exchanges `:392` needs emission ownership. The tool result stays authoritative.|
|280|BLOCKED-E8|Access lowering `:29,52` needs diagnostics that preserve credential revocation before cancellation.|
|281|BLOCKED-E6|Tool approval `:123` needs confirmation failure ownership and pending-state parity.|
|282|KEEP|Tool handler `:66` preserves an authorized write when optional guidance fails.|
|283|KEEP|Tool analytics `:38` isolates telemetry from execution.|
|284|KEEP|Tool recovery `:329` rejects unsafe prefills with the existing credential-free policy.|
|285|KEEP|Tool redaction `:185` contains observer failure without emitting its exception text.|
|286|KEEP|Result diagnostics `:31` preserves the original line when optional image summarization fails.|
|287|KEEP|Result media `:119` retains the existing text fallback for unserializable output.|
|288|BLOCKED-E3|Data module `:898` needs post-commit journal and snapshot diagnostics.|
|289|KEEP|Disk headroom `:55` exposes `measurementFailed` and preserves the explicit unknown-capacity outcome.|
|290|BLOCKED-E3|Snapshot `:104` needs failed-artifact removal ownership.|
|293|BLOCKED-E3|PGlite owner `:448–449` needs stop and close diagnostics that preserve setup failure and lock release.|
|294|BLOCKED-E3|PGlite socket `:289` needs disconnect rollback ownership.|
|296|BLOCKED-E3|SQLite operations `:78` needs cleanup diagnostics for the exclusively reserved failed backup.|
|297|BLOCKED-E3|SQLite inspection `:60,127` needs private PRAGMA and counting diagnostics while preserving tolerant output.|
|298|BLOCKED-E3|Transfer tools `:102` needs unlink ownership without replacing the snapshot outcome.|
|299|BLOCKED-E3|Copy engine `:295` needs private inspection cause behind its unreadable outcome.|
|301|KEEP|Desktop config `:19` returns false for an unavailable optional local probe.|
|302|READY|Electron shell `:27` implements the existing never-throws `dirExists` contract.|
|305|BLOCKED-E3|Webview policy `:57` must deny immediately. Pin a host owner for policy callback faults.|
|306|BLOCKED-E3|Window navigation `:166` needs private handoff reporting while retaining guest denial.|
|307|BLOCKED-E3|Instance presence `:57,72,87` needs read and cleanup ownership without treating uncertainty as death.|
|310|BLOCKED-E3|Node toolchain `:92` needs private temp-file cleanup reporting behind the write failure.|
|311|KEEP|Install location `:64` rejects an unreadable candidate launcher.|
|314|READY|Tauri shell `:27` implements the existing never-throws `dirExists` contract.|
|315|BLOCKED-E9|Tauri sidecar `:71` needs shutdown ownership and original signal behavior.|
|316|BLOCKED-E3|Windows registry `:43` conflates an absent uninstall record with registry command failure.|
|319|BLOCKED-E3|DNS delegation `:29` needs a private cause behind the stable provider outcome.|
|320|BLOCKED-E3|DNS resolver `:117` needs diagnostics while retaining existing DNS classifications.|
|321|BLOCKED-E3|Local dev `:48` needs a private inventory failure owner.|
|323|KEEP|Server retirement `:34` preserves a server whose retirement is uncertain and clears its fence.|
|324|BLOCKED-E3|Electron archive `:75` needs distinct missing-source and failed-inspection evidence.|
|325|BLOCKED-E3|Source-control commit `:92` needs workspace cleanup ownership behind the original outcome.|
|326|KEEP|Repository paths `:21,42` deny invalid path input without echoing it.|
|328|BLOCKED-E3|Discovery filesystem `:10,22` needs absence versus unexpected read classification.|
|329|KEEP|Delivery `:40,72` uses a safe error-class fallback and contains the warning sink.|
|330|KEEP|Observability fanout `:25,69,88,103,108,121,136` isolates adapters and retains the original operation outcome.|
|331|KEEP|Tracker `:25,80,106` contains provider and diagnostic callback faults.|
|335|BLOCKED-E3|Public page `:176,243` needs browser-close ownership without masking the deadline.|
|336|BLOCKED-E3|Render page `:158,172,182,382,393` needs teardown ownership while retaining abort and deadline precedence.|
|337|BLOCKED-E3|Request guard `:93,168,290,324,332,371` needs private probe and cleanup ownership while preserving refusal behavior.|
|338|BLOCKED-E3|HTML response `:44` needs transform reporting while returning the original body and validators.|
|342|KEEP|Fenced conformance `:51,132` deliberately observes a losing contender and preserves the test’s original failure.|
|345|BLOCKED-E3|BYO client `:44` needs private credential-read ownership behind `unreadable`.|
|346|BLOCKED-E3|Connection host `:175` needs ownership of unexpected client-resolution faults.|
|347|BLOCKED-E3|Credentialed request `:353` needs private probe diagnostics. Keep the value-free origin refusal at `:403`.|
|348|KEEP|Credential tools `:352,455` use safe refusal and label fallback at secret-field checks.|
|350|BLOCKED-E4|AIHubMix shared `:123` needs safe provider failure-body handling.|
|351|BLOCKED-E4|AIHubMix adapter `:141,165` needs safe body read and decode failure handling.|
|352|BLOCKED-E3|Media guard `:103` needs private DNS diagnostics. Preserve fail-closed URL and DNS results.|
|369|KEEP|Remembered approval `:74` contains the diagnostic callback after it receives the cause.|
|370|KEEP|Revocation `:78` contains the sink without bypassing refusal.|
|371|BLOCKED-E3|MCP bootstrap `:322` needs close-failure ownership behind the original connection failure.|
|372|BLOCKED-E3|MCP connection gate `:106` needs private activation diagnostics while denying.|
|373|BLOCKED-E3|Hosted credentials `:45,86,130` needs safe grant, decrypt and configuration fault ownership.|
|375|KEEP|Hosted store view `:64` omits an unreadable token hint while still listing non-secret metadata.|
|380|BLOCKED-E3|Stdio adapter `:362` needs close diagnostics that preserve the initialization error.|
|381|KEEP|Stdio launch resolver `:155` refuses a failed executable candidate.|
|382|KEEP|Federation trust `:957` reports unserializable remote output without reproducing it.|
|385|KEEP|Message relay `:57` returns the safe result. The browser retains unclaimed input.|
|386|KEEP|Stdio hosting `:155` ends the output drain when its stop signal wins.|
|387|BLOCKED-E3|Tool server `:163,357` needs close ownership with existing `done()` ordering.|
|393|BLOCKED-E3|Note store `:271,278,311,322,416,444,474,556` needs safe read, maintenance and deletion ownership.|
|394|KEEP|Verification `:257` isolates a deferred event listener from the stored outcome.|
|406|BLOCKED-E3|OAuth refresh `:167` needs token-store diagnostic ownership without leaking credentials.|
|409|KEEP|Sealed OAuth state `:77` gives unreadable or tampered input the same safe refusal.|
|416|BLOCKED-E3|Download `:85,122,140` needs maintenance, cleanup and digest-read diagnostics.|
|417|BLOCKED-E3|Download locks `:76,82` needs diagnostics for failed lock removal.|
|418|BLOCKED-E3|Download maintenance `:36–76` needs diagnostics behind partial removal and warning summaries.|
|421|BLOCKED-E3|Download store `:21,29,76,189` needs private stat, read, removal and verification ownership.|
|422|BLOCKED-E3|Download transfer `:149,178,206` needs partial-file and manifest cleanup ownership.|
|423|READY|Bounded fetch `:236–237` contains synchronous and asynchronous cancellation faults behind the original read outcome.|
|424|BLOCKED-E3|Filesystem `:113,150` needs private cleanup and discovery ownership.|
|425|KEEP|Atomic write `:84,87` contains secondary cleanup faults and preserves the original write failure.|
|426|KEEP|Boot identity `:34` preserves unknown identity, never proof of death.|
|427|KEEP|Directory sync `:17` preserves the existing resolved-path fallback when canonicalization fails.|
|428|KEEP|Directory user config `:88` preserves invalid settings for the existing warning and quarantine path.|
|433|BLOCKED-E3|Reviewed file `:54,83` must deny while distinguishing unexpected inspection faults privately.|
|434|KEEP|Mail wrapper `:63,66` emits one existing activity warning and contains its sink after delivery.|
|436|BLOCKED-E3|Mailer `:132,145,216–280` needs private setting, fingerprint and sender lookup diagnostics. Keep terminal sink isolation.|
|437|BLOCKED-E3|Sender verification `:35,43,47,68,70` needs private lookup diagnostics behind existing domain states.|
|438|KEEP|Process `:141,310,335` preserves process-stamp refusal and documented empty sampling results. Two other findings moved.|
|439|KEEP|Proxy environment `:423` treats an unavailable optional system lookup as no answer.|
|440|KEEP|Resource paths `:194` still formats the original error when user-name lookup fails.|
|441|KEEP|Sandbox env `:106,129` preserves the existing canonical-path fallback and ancestor walk.|
|442|KEEP|Vault archive `:53` reports an omission count without displaying credential data or exceptions.|
|444|BLOCKED-E3|Legacy owner `:60` needs private recovery-read ownership behind `OwnerStoreRecoveryError`.|
|447|BLOCKED-E3|Terminal `:86,120,426,442,453,469` needs probe and signal ownership while preserving finish semantics.|
|448|KEEP|Toolchain `:270` retains candidates already collected when another scan root is unreadable.|
|449|BLOCKED-E3|Plugin activation `:76` needs compensation diagnostics behind the original error. `rs3-jini` retains the catch.|
|450|BLOCKED-E3|Browser assets `:57` must refuse admission and needs a private integrity-check owner.|
|452|BLOCKED-E3|Plugin loader `:62,144,203,219` needs private setup and admission cause ownership. `rs3-jini` retains the guards.|
|454|BLOCKED-E3|Package files `:220` needs directory-read diagnostics behind partial inventory.|
|456|BLOCKED-E3|Source drafts `:427` needs to distinguish missing approval from read failure while withholding approval.|
|457|BLOCKED-E3|Provider revision watch `:67` needs private store-read diagnostics while polling continues.|
|458|KEEP|Quarantine `:47` isolates the optional observer after the committed state change.|
|460|BLOCKED-E3|Plugin management `:60,66,321` needs catalog and linked-provider lookup ownership.|
|465|KEEP|PostHog consent `:60,162,173` keeps optional delivery, purge and SDK failures isolated from consent.|
|466|BLOCKED-E3|PostHog `:101` needs shutdown diagnostic ownership using its existing adapter reporter.|
|468|KEEP|OTel `:166` isolates reporting failures on the terminal reporting path. `rs3-jini` retains it.|
|469|BLOCKED-E3|Sentry `:100,141,152` needs lifecycle diagnostics through its existing adapter reporter.|
|470|BLOCKED-E3|Stripe HTTP `:56` needs private cause ownership while preserving the retryable unknown outcome.|
|471|KEEP|Telemetry reporter `:36,40` contains borrowed logging and diagnostic sinks.|
|472|KEEP|Certificate trust `:69` denies when issuer or signature verification fails.|
|473|BLOCKED-E3|Sandbox worker `:129` needs termination diagnostics while retaining settlement and release order.|
|474|RETIRE|`search/indexer.ts` has lost `guarded` on `06559affb`. `jm7-b` repoints its debt key to `indexer-write.ts`.|
|475|BLOCKED-E3|Search service `:38,135` needs private provider and visibility diagnostics while preserving filtering.|
|477|BLOCKED-E3|Builtin server features `:252` needs private readiness diagnostics behind the existing health check.|
|479|KEEP|Kernel `:114` preserves boot failure while closing partially acquired resources.|
|480|KEEP|Legacy SQLite `:52` preserves bootstrap failure when close also throws.|
|485|READY|Supervisor `:153` observes caller-free discovery. Keep the readiness retry at `:139`.|
|545|KEEP|User-management conformance `:38,46,112,140,153,158` deliberately tests rejected requests.|
|546|KEEP|Users controller `:136` withholds identity-dependent affordances, including delete, when identity is unknown.|
|552|KEEP|Hasher `:99` refuses malformed or foreign hashes without exposing stored hash details.|
|553|KEEP|Login providers `:57` refuses invalid provider configuration with a closed reason.|
|554|BLOCKED-E3|Passkeys `:63,104` needs private verifier fault ownership behind registration and login denial.|

Two additional live identities explain the merge‑7 ledger drift. `platform/src/process-probes.ts:129,145` is **KEEP** because unavailable readings stay unknown. `search/src/indexer-write.ts:24` is **BLOCKED-E3** because `guarded` needs an owner for the private provider cause behind `unexpected_response`. `jm7-b` assigns both identities. The moves clear the old search key and reduce the old process key from five findings to three.

| Standing exclusion | Disposition |
|---|---|
|Hygiene-a/b and practice|OWNED-ELSEWHERE cloud cull|
|Launch-44-41|OWNED-ELSEWHERE `jy-*`, `tv-y1`, `tv-y2`|
|ACP-3/4/5 redo|OWNED-ELSEWHERE ACP, including `jz2-a`|
|RT-J3|OWNED-ELSEWHERE RT-J3|
|Tier‑2 Tovu class tokens|PARKED|
|`todos.md` L|PARKED|
|424 UI functions over 50 lines|PARKED|
|fn50 / c6fix|OWNED-ELSEWHERE size and complexity work|
|Coverage|PARKED|
|Mutation-testing campaign|PARKED|
|Held 89-file patch|OWNED-ELSEWHERE `ex-err-jini` at `b79994b9c`|

## READY sheets

All paths below are relative to `packages/` in Jini. The only new imports are the exact lines named below. Importer repoints, export additions, manifest changes, API-baseline changes, and injection-debt changes are zero for every sheet. Each named test already exists. The cull removes Chrome and Electron looks for these equivalent rewrites.

### O93 · Jini merge‑7 · 0.9k tokens

**Tests first.** `agent-runtime/src/__tests__/anthropic-live-models.test.ts:225,235` covers refusal reporting and an injected probe that rejects. Remove the fallback wrapper for the mutation. The rejection must escape in the `:235` case.

**Edit.** In `agent-runtime/src/anthropic-live-models.ts:130–148`, `fetchAnthropicModels`, add `import { orFallback } from '@jini-ai/core/errors/idioms';`. Replace the try/catch with `return orFallback({ work: async () => { /* existing try-body statements */ }, fallback: null, step: 'Discover live Anthropic models' });`. The placeholder comment is sheet notation. Keep the existing warning, timeout, and return statements verbatim. The private caller is `cachedOrFetchedModels:184`. The leaf’s existing imports are in `defs/claude.ts:15`, `__tests__/anthropic-live-models.test.ts:8`, and `defs/__tests__/claude.test.ts:5`. Debt −1. STOP if the cached promise, credential partition, warning, or source encoding changes.

### O178 · Jini merge‑7 · 1.1k tokens

**Tests first.** `cms/src/forms/__tests__/file-fields.test.ts:103–114` requires the original submission error to survive cleanup failure and a throwing logger. Remove the observer to turn the warning assertion red. Await the failing discard directly to turn the original-error cases red.

**Edit.** In `cms/src/forms/submit-service.ts:276–287`, `discardUploads`, add `import { orFallback } from "@jini-ai/core/errors/idioms";`. Replace the loop’s try/catch with this call. Preserve both existing why-comments above it.

```ts
await orFallback({
  work: () => deps.files!.discard({ workspaceId: input.workspaceId, reference }),
  fallback: undefined,
  step: "Discard failed form upload",
}, {
  observe: ({ error: cleanupError }) => deps.logger.warn({ message: "form upload cleanup failed" }, { error: cleanupError }),
});
```

The private caller is at `submit-service.ts:260`. Existing entry is `forms/index.ts:7`. Direct module references are `forms/express/handler.ts:11`, its `__tests__/handler.test.ts:354`, and `forms/__tests__/{common-fields.test.ts:7,file-fields.test.ts:6,injected-ports.test.ts:5,stale-form.test.ts:4,submit-service.boundaries.test.ts:9,submit-service.test.ts:11,support/host-ports.fixture.ts:7,support/switch-bindings.fixture.ts:7}`. Debt −1, three findings retained. STOP if the error object, warning text, discard ordering, or original rejection changes.

### O245 · Jini merge‑7, after `jz2-a` caller refresh · 0.8k tokens

**Tests first.** `daemon/src/agent-executor/__tests__/run-output.test.ts:131–137` settles a run before diagnostic emission and still expects `failed` with no appended event. Mutate to await `lifecycle.emit` directly.

**Edit.** In `daemon/src/agent-executor/run-output.ts:80–90`, `observeRunOutput().settle`, add `import { afterSettled } from '@jini-ai/core/errors/idioms';`. Replace `:88` with `await afterSettled({ promise: lifecycle.emit({ runId, input: { event: 'error', data: { message } } }) });`. The lifecycle owns terminal state and refuses emission to a terminal run. Existing imports are `acp-events.ts:2`, `child-lifecycle.ts:2`, `pi-rpc-events.ts:2`, and `__tests__/run-output.test.ts:4` in the same directory. Debt −1. STOP if emission becomes detached or a failed emission changes settlement.

### O248 · Jini merge‑7, after `jz2-a` test-import refresh · 0.8k tokens

**Tests first.** `daemon/src/__tests__/delegated-result-correlation.test.ts:70–77` covers cyclic data and absence of a false match. Mutation invokes the digest expression directly.

**Edit.** In `daemon/src/delegated-result-correlation.ts:50–53`, private `digest`, add `import { orFallbackSync } from '@jini-ai/core/errors/idioms';`. Replace the try/catch with:

```ts
return orFallbackSync({
  work: () => crypto.digest({ token: JSON.stringify({ isError: input.isError, content: input.content }, normalizedJson) }),
  fallback: undefined,
  step: 'Fingerprint delegated tool result',
});
```

Local callers are `record:56` and `matches:69`. Existing barrel is `daemon/src/index.ts:116`. Direct references under `daemon/src` are `agent-executor/{child-lifecycle.ts:11,contracts.ts:8,__tests__/agent-executor.test.ts:2}`, `delegated-tool-bridge.ts:13`, `http/delegated-tools.ts:2`, `run-lifecycle.ts:17`, and `__tests__/{delegated-result-correlation.test.ts:2,delegated-tool-bridge.media.test.ts:9,result-boundaries.unit.test.ts:2}`. Debt −1. STOP if hashing or normalization leaves the guarded expression, or a failed fingerprint could record or match a proof.

### O302 · Jini merge‑7 · 0.7k tokens

**Tests first.** `desktop-host/src/electron/__tests__/electron-shell.test.ts:44–61` covers directory, missing path and file. Mutate by executing the existing `stat` and return without the idiom. The missing-path case must reject.

**Edit.** In `desktop-host/src/electron/electron-shell.ts:23–30`, `createElectronShellPort().dirExists`, add `import { orFallback } from '@jini-ai/core/errors/idioms';`. Make the body `return orFallback({ work: async () => { const info = await stat(path); return info.isDirectory(); }, fallback: false, step: 'Check Electron directory' });`. Existing references in that directory are `create-electron-desktop-host.ts:8`, `index.ts:16`, `__tests__/electron-shell.test.ts:6`, and `__tests__/shell-dialog-and-fakes.test.ts:3`. Debt −1. STOP if a failed stat can throw or a regular file can count as a directory.

### O314 · Jini merge‑7 · 0.7k tokens

**Tests first.** `desktop-host/src/tauri/__tests__/shell-and-window-fakes.test.ts:6–12` pins false on an injected permission rejection. `tauri-shell.test.ts:28–45` pins directory, missing and file outcomes. Mutate by executing the existing body outside the idiom.

**Edit.** In `desktop-host/src/tauri/tauri-shell.ts:19–30`, `createTauriShellPort().dirExists`, add `import { orFallback } from '@jini-ai/core/errors/idioms';`. Keep its comments and wrap the original three statements in `return orFallback({ work: async () => { /* existing try-body statements */ }, fallback: false, step: 'Check Tauri directory' });`. Existing references are `create-tauri-desktop-host.ts:7`, `index.ts:14`, `__tests__/tauri-shell.test.ts:3`, and `__tests__/shell-and-window-fakes.test.ts:3` in the same directory. Debt −1. STOP if `stat` runs on a missing path or either filesystem rejection escapes.

### O423 · Jini merge‑7 · 0.9k tokens

**Tests first.** `platform/src/__tests__/response-cleanup-w2g.unit.test.ts:4–16` covers both a thrown and a rejected cancel and asserts original failure identity. `fetch-text-details.test.ts:139,161` pins abort and truncation when cancel rejects or stalls. Mutate by returning `reader.cancel(reason)` directly. The legacy cases must expose the cancellation failure.

**Edit.** In `platform/src/fetch-with-timeout.ts:233–238`, `cancelResponseReader`, add `import { orFallback } from "@jini-ai/core/errors/idioms";`. Replace both catches with `return orFallback({ work: () => reader.cancel(reason), fallback: undefined, step: "Cancel response reader" });`. Preserve the existing comment about the consumption error. Local callers are `:220,224`. The public entry is `@jini-ai/platform/fetch-with-timeout`, `package.json:84`. The witness imports are `response-cleanup-w2g.unit.test.ts:2` and `fetch-text-details.test.ts:3`. Debt −2. STOP if either caller changes whether it waits, the original error can be replaced, or `releaseLock` timing changes.

### O485 · Jini merge‑7 · 0.8k tokens

**Tests first.** `sidecar/src/supervision/__tests__/supervisor.test.ts:437,452` exercises caller-free replacement discovery and shutdown of an unready replacement. Remove observation for the mutation. The combine runner must see the shutdown rejection as unhandled.

**Edit.** In `sidecar/src/supervision/supervisor.ts:149–156`, `discoverReadiness`, add `import { observed } from '@jini-ai/core/errors/idioms';`. Move the existing inline why-comment immediately above `observed({ promise: discovery });`, which replaces `:153`. The supervisor owns discovery cancellation and returns the original promise to joiners. The existing witness imports from `../supervisor.js` at `supervisor.test.ts:5`. Debt −1, readiness retry retained. STOP if `.finally`, `context.discoveryWork`, or the promise returned to joiners changes.

## Batch

| Branch | Base and execution order | Estimate |
|---|---|---:|
|`codex/j-census2`|Jini `06559affb` after `jz2-a` for the daemon caller and test references. O93 → O178 → O245 → O248 → O302 → O314 → O423 → O485. Reconcile after `jm7-b`.|6.8k tokens|

**Copy into the Codex brief.** Behavior identical. New functions only use `(required, optional = {})`, with framework-dictated signatures exempt. No re-export shells, new dependencies, `eslint-disable`, `@ts-ignore`, `as any`, or `as never`. Functions ≤50 lines and complexity ≤10. Note files over 500 lines in root `COMMIT-PLAN.md` and continue. Stop the affected sheet for a missing declaration, unlisted production importer, required cast, or function limit breach. Use `git grep -n -F '<symbol>' -- apps/ development/ packages/` and record identical extra test-only repoints in `REFRESH.md`.

Edit only named statements. Move existing why-comments verbatim. Add only named imports, test cases, and mutations. No extra helpers, wrappers, adapters, ports, types, guards, options, retries, defaults, scaffolding, or comments. Hooks are injected as props. Vendor code stays in provider packages and server framework code stays at its adapters. Jini packages import their own package, core and protocol, with server and CLI host preset exceptions. Keep Tovu identifiers out of Jini additions. Log each approved naming break on a `BREAKS:` line. Review the diff, remove stray changes, and list deletions in `COMMIT-PLAN.md`. No other repo-wide scans, tests, builds, installs, type-checks, linters, codebase-memory-mcp, or Git writes. New packages, new dependencies and lockfiles are OPUS-CLOUD.

**Combine.** Expected source delta is nine findings. The cloud runner owns checks, named mutations and ledger reconciliation after `jm7-b`. Run `--update` only after a full comparison reports zero `New:` and `Worse:` entries.

## PARTIAL

O274 still needs a merge‑7 test that demonstrates both original start rejection and successful progress by a waiting caller. O322 is the prior report’s separately identified partial and was outside its 241-key remainder. The prior report’s other 45 dispositions are carried forward.

The requested `cull-debt-jini.md` path was absent from `origin/plan/culls-1120`. I used the identically named scratchpad judge report alongside the branch’s `cull-err-rows.md` and `cull-err-sys.md`. This was a read-only review. The proposed gate deltas and mutations are unverified.
