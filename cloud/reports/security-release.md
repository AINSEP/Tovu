# security-release — assistant release investigation

Status: blocked on packaged macOS evidence. Tovu `cloud/security-release` only; no tag, publication, deployment or main push. Jini is unchanged.

The confirmed reporting defect was that the gate discarded unexpected run-error frames and printed empty evidence on premature termination. It now retains the actual last error frame. All existing child PID, session, expected no-key refusal, concurrency, ownership, cleanup, timeout and retry requirements remain unchanged.

Four regression cases exercise the real SSE reader: end-frame and stream-close failures preserve the original error; a refusal without a child still fails; a child/session without the expected refusal still fails. Before the fix, both reporting cases failed with empty evidence. Afterward, all **7 focused reporting and release-wiring tests passed**:

```sh
source /workspace/.tovu-build/env.sh
node --import tsx --test --test-isolation=none development/scripts/__tests__/desktop-assistant-evidence.unit.test.ts development/scripts/__tests__/desktop-assistant-release-gate.unit.test.ts
```

Reviewed the startup catch and CLI launch path. The catch already logs the original exception and forwards startup stage/error to the published diagnostic path. The fixture supplies scratch HOME and prepends its executable directory to PATH; launch overrides preserve both, and the shared daemon forwards both. Its shebang is the test runner's absolute Node executable, rather than an env-based lookup. These are static observations, not proof that packaged CLI startup succeeds.

Built the real admin and desktop surfaces and started the two source journeys using the installed Electron and a temporary Xvfb display:

```sh
DISPLAY=:95 /workspace/work/security-release/desktop-gates/tools/usr/bin/tini -s -- npm run e2e:desktop -- two-sites-assistant.desktop.ts shared-agent-daemon.desktop.ts --workers=1 --retries=0
```

The execution connection failed during that run. Although cloud status later reported connected, the execution service could not attach; no journey result, fresh typecheck or final range scan could be recovered. The local probe used an uncommitted DISPLAY allowlist adjustment in the shared fixture; it is not included in the pushed diagnostic patch. The workspace could not be cleaned after detachment. No packaged-app or source-journey pass is claimed.

**CLI startup cause: unproven.** Original run 42130902278's assistant-gate job log confirms both packaged journeys failed with empty evidence and contains no startup cause. No production workaround or Jini change was made.

Needed next: run the unchanged two journeys against the macos-15 packaged arm64 app with this harness patch, preserving zero retries and existing timeouts. Retain the full failure text containing `errorFrame.payload` (especially the startup stage/cause and OS error code) and the redacted app/shared-daemon stderr with the existing trace artifact. That evidence distinguishes preparation failure from executable resolution/spawn failure before any production fix is justified.

Pushed diagnostic implementation: `7e8a361f80afad7ae9a974ada0b5fb089d843813`. The final response gives the subsequent documentation-only report SHA. Previous desktop validation and package state remain in the [prior report](https://github.com/AINSEP/Tovu/blob/4bbd0b2dfcfbf9afdb209e175c13d54cb3b36427/cloud/reports/security-release.md).
