# DT-desktop-1 — desktop → @jini-ai/desktop-host (Jini step J then Tovu step T)

Lane DT. Batch J:23 T:24. Depends on: none (only already-Jini code). Est: J 89 min, T 36 min.

## J — move verbatim into Jini (12 files, 713 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/desktop/src/find-in-page-verify.ts` | `packages/desktop-host/src/shell/find-in-page-verify.ts` | 42 |  |
| `apps/desktop/src/find-menu.ts` | `packages/desktop-host/src/shell/find-menu.ts` | 50 | W2 |
| `apps/desktop/src/instance-presence.ts` | `packages/desktop-host/src/shell/instance-presence.ts` | 39 | W2 |
| `apps/desktop/src/js-backslide-guard.ts` | `packages/desktop-host/src/shell/js-backslide-guard.ts` | 48 |  |
| `apps/desktop/src/node-toolchain.ts` | `packages/desktop-host/src/shell/node-toolchain.ts` | 73 | W6 |
| `apps/desktop/src/pty-helpers.ts` | `packages/desktop-host/src/shell/pty-helpers.ts` | 51 |  |
| `apps/desktop/src/shell-staleness.ts` | `packages/desktop-host/src/shell/shell-staleness.ts` | 78 |  |
| `apps/desktop/src/speech/mac-on-device-transcriber.ts` | `packages/desktop-host/src/shell/speech/mac-on-device-transcriber.ts` | 93 | W8 |
| `apps/desktop/src/speech/transcription-port.ts` | `packages/desktop-host/src/shell/speech/transcription-port.ts` | 27 | W3 |
| `apps/desktop/src/spellcheck-menu.ts` | `packages/desktop-host/src/shell/spellcheck-menu.ts` | 95 | W1 |
| `apps/desktop/src/auto-update-controller.ts` | `packages/desktop-host/src/shell/auto-update-controller.ts` | 50 | W2 |
| `apps/desktop/src/speech/speech-ipc.ts` | `packages/desktop-host/src/shell/speech/speech-ipc.ts` | 67 | W7 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/desktop-host" exports["./shell/auto-update-controller"]
- "@jini-ai/desktop-host" exports["./shell/find-in-page-verify"]
- "@jini-ai/desktop-host" exports["./shell/find-menu"]
- "@jini-ai/desktop-host" exports["./shell/instance-presence"]
- "@jini-ai/desktop-host" exports["./shell/js-backslide-guard"]
- "@jini-ai/desktop-host" exports["./shell/node-toolchain"]
- "@jini-ai/desktop-host" exports["./shell/pty-helpers"]
- "@jini-ai/desktop-host" exports["./shell/shell-staleness"]
- "@jini-ai/desktop-host" exports["./shell/speech/speech-ipc"]
- "@jini-ai/desktop-host" exports["./shell/spellcheck-menu"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (12, 1687 LOC) → Jini `__tests__/` beside the destination
- `apps/desktop/src/find-in-page-verify.test.ts`
- `apps/desktop/src/auto-update-controller.test.ts`
- `apps/desktop/src/instance-presence.test.ts`
- `apps/desktop/src/js-backslide-guard.test.ts`
- `apps/desktop/src/node-toolchain.test.ts`
- `apps/desktop/src/pty-helpers.test.ts`
- `apps/desktop/src/shell-staleness.test.ts`
- `apps/desktop/src/speech/mac-on-device-transcriber.test.ts`
- `apps/desktop/src/speech/native-speech-adapter.test.ts`
- `apps/desktop/src/speech/transcription-port.test.ts`
- `apps/desktop/src/spellcheck-menu.test.ts`
- `apps/desktop/src/speech/speech-ipc.test.ts`


## T — Tovu repoint: delete the 12 sources, rewrite every importer (24 lines)

```
apps/desktop/scripts/verify-find-in-page.ts:56  '../src/find-in-page-verify.ts' -> '@jini-ai/desktop-host/shell/find-in-page-verify'
apps/desktop/scripts/verify-find-in-page.ts:57  '../src/find-in-page-verify.ts' -> '@jini-ai/desktop-host/shell/find-in-page-verify'
apps/desktop/src/find-menu.test.ts:13  './find-menu.ts' -> '@jini-ai/desktop-host/shell/find-menu'
apps/desktop/src/main/boot/boot-sequence.ts:10  '../../find-menu.ts' -> '@jini-ai/desktop-host/shell/find-menu'
apps/desktop/src/main/index.ts:172  '../instance-presence.ts' -> '@jini-ai/desktop-host/shell/instance-presence'
apps/desktop/scripts/check-js-backslide.ts:31  '../src/js-backslide-guard.ts' -> '@jini-ai/desktop-host/shell/js-backslide-guard'
apps/desktop/src/main/index.ts:117  '../node-toolchain.ts' -> '@jini-ai/desktop-host/shell/node-toolchain'
apps/desktop/scripts/verify-package.ts:34  '../src/pty-helpers.ts' -> '@jini-ai/desktop-host/shell/pty-helpers'
apps/desktop/src/stage-payload-lib.ts:23  './pty-helpers.ts' -> '@jini-ai/desktop-host/shell/pty-helpers'
apps/desktop/src/preload/preload-staleness.test.ts:38  '../shell-staleness.ts' -> '@jini-ai/desktop-host/shell/shell-staleness'
apps/desktop/src/stage-payload-lib.ts:24  './shell-staleness.ts' -> '@jini-ai/desktop-host/shell/shell-staleness'
apps/desktop/src/stage-payload-run.ts:17  './shell-staleness.ts' -> '@jini-ai/desktop-host/shell/shell-staleness'
apps/desktop/src/stage-payload-run.ts:18  './shell-staleness.ts' -> '@jini-ai/desktop-host/shell/shell-staleness'
apps/desktop/src/main/index.ts:167  '../spellcheck-menu.ts' -> '@jini-ai/desktop-host/shell/spellcheck-menu'
apps/desktop/src/main/windows/sites-home-window.test.ts:12  '../../spellcheck-menu.ts' -> '@jini-ai/desktop-host/shell/spellcheck-menu'
apps/desktop/src/main/windows/sites-home-window.ts:14  '../../spellcheck-menu.ts' -> '@jini-ai/desktop-host/shell/spellcheck-menu'
apps/desktop/src/native-listener-disposal.test.ts:8  './spellcheck-menu.ts' -> '@jini-ai/desktop-host/shell/spellcheck-menu'
apps/desktop/src/native-listener-disposal.test.ts:9  './spellcheck-menu.ts' -> '@jini-ai/desktop-host/shell/spellcheck-menu'
apps/desktop/src/main/updates/desktop-updater.test.ts:14  '../../auto-update-controller.ts' -> '@jini-ai/desktop-host/shell/auto-update-controller'
apps/desktop/src/main/updates/desktop-updater.ts:7  '../../auto-update-controller.ts' -> '@jini-ai/desktop-host/shell/auto-update-controller'
apps/desktop/src/main/updates/desktop-updater.ts:9  '../../auto-update-controller.ts' -> '@jini-ai/desktop-host/shell/auto-update-controller'
apps/desktop/src/main/index.ts:137  '../speech/speech-ipc.ts' -> '@jini-ai/desktop-host/shell/speech/speech-ipc'
apps/desktop/src/preload/preload.test.ts:13  '../speech/speech-ipc.ts' -> '@jini-ai/desktop-host/shell/speech/speech-ipc'
apps/desktop/src/speech/preload-speech.test.ts:15  './speech-ipc.ts' -> '@jini-ai/desktop-host/shell/speech/speech-ipc'
```

## Tovu tests that must stay green (7; import lines are repointed above, assertions untouched)
- `apps/desktop/src/find-menu.test.ts`
- `apps/desktop/src/main/updates/desktop-updater.test.ts`
- `apps/desktop/src/main/windows/sites-home-window.test.ts`
- `apps/desktop/src/native-listener-disposal.test.ts`
- `apps/desktop/src/preload/preload-staleness.test.ts`
- `apps/desktop/src/preload/preload.test.ts`
- `apps/desktop/src/speech/preload-speech.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/desktop/src/find-menu.ts` (2)
- `apps/desktop/src/instance-presence.ts` (2)
- `apps/desktop/src/node-toolchain.ts` (6)
- `apps/desktop/src/speech/mac-on-device-transcriber.ts` (8)
- `apps/desktop/src/speech/transcription-port.ts` (3)
- `apps/desktop/src/spellcheck-menu.ts` (1)
- `apps/desktop/src/auto-update-controller.ts` (2)
- `apps/desktop/src/speech/speech-ipc.ts` (7)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/desktop/src/js-backslide-guard.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/desktop/src/shell-staleness.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/desktop/src/node-toolchain.ts:29: const GENERATED_COMMENT = "# Generated by Tovu Desktop — rewritten on every launch. Do not edit.";
apps/desktop/src/node-toolchain.ts:68: return buildEnvironment({ ...input, toolchainEnvName: "TOVU_NODE_TOOLCHAIN_DIR", npmRootEnvName: "TOVU_BUNDLED_NPM_ROOT" });
apps/desktop/src/speech/mac-on-device-transcriber.ts:47: export const DEFAULT_BINARY_PATH = path.join(dirname, ".build", "jini-v1", "tovu-speech-helper");
apps/desktop/src/speech/mac-on-device-transcriber.ts:51: invalidOutput: ({ stdout }) => `tovu speech: helper printed non-JSON output: ${stdout}`,
apps/desktop/src/speech/mac-on-device-transcriber.ts:52: cannotTranscribe: ({ reason }) => `tovu speech: cannot transcribe (${reason})`,
apps/desktop/src/speech/mac-on-device-transcriber.ts:53: recognitionFailed: ({ reason }) => `tovu speech: recognition failed (${reason})`,
apps/desktop/src/speech/mac-on-device-transcriber.ts:78: tempFilePath: () => path.join(os.tmpdir(), `tovu-speech-${crypto.randomUUID()}.wav`),
apps/desktop/src/speech/transcription-port.ts:17: unavailable: ({ reason }) => `tovu speech: transcription unavailable (${reason})`,
apps/desktop/src/speech/speech-ipc.ts:28: const channels = speechChannels({ channelNamespace: "tovu:speech" });
apps/desktop/src/speech/speech-ipc.ts:32: senderRefused: "tovu:speech: refused — the sender is not a page this app serves.",
apps/desktop/src/speech/speech-ipc.ts:33: invalidRate: "tovu:speech:transcribe: sampleRate must be a whole number of Hz from 8000 to 192000.",
apps/desktop/src/speech/speech-ipc.ts:34: invalidSamples: "tovu:speech:transcribe: samples must be a Float32Array or an array of finite numbers.",
apps/desktop/src/speech/speech-ipc.ts:36: tooManySamples: ({ maxSamples }) => `tovu:speech:transcribe: at most ${maxSamples} samples per recording.`,
apps/desktop/src/speech/speech-ipc.ts:56: channelNamespace: "tovu:speech", messages,
```

## Named mutation
in the Jini copy of `spellcheck-menu.ts`, negate the first `if (` condition of its first exported function; `spellcheck-menu.test.ts` must go red, then revert
