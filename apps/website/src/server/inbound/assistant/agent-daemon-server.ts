/** One desktop-owned listener, or the same host with one standalone scope (ADR-070). */
import express from "express";
import type { SiteScopeKey } from "@tovu/contracts/site-scope-key";
import { createSupervisorRegistry, createNodeIpcChannel } from "@jini-ai/sidecar/supervisor/node";
import { createAtomicWriterPort } from "@jini-ai/node-adapters/fs";
import { createConsoleLogger } from "@jini-ai/core/primitives";
import { backupOriginalOnce, writeFileAtomicAsync, writeJsonFileAtomicAsync } from "@jini-ai/platform/fs";
import { createSiteScope } from "./agent-daemon-scope.js";
import { createAgentDaemonIdlePark } from "./agent-daemon-idle-park.js";
import { createExclusiveRunLease } from "@jini-ai/daemon/exclusive-run-lease";
import { createScopeControl, requireScopeKey } from "./agent-daemon-scope-control.js";
import { isDaemonLifecycleLogQuiet } from "../../runtime/lifecycle/daemon-lifecycle-log.js";
import { closeWithinBound, stopServingWithinGrace } from "@jini-ai/server/shutdown";
import { installUnhandledRejectionGuard } from "../../runtime/boot/process-error-guards.js";
import { installServerLogCapture } from "../../../platform/server-logs/index.js";
import { processBuildRelease, telemetryEnvironment } from "../../runtime/composition/build-release.js";
import { AGENT_DAEMON_EXIT_CODE } from "@tovu/contracts/daemon-exit-codes";
import { TOOL_EXEC_TOKEN_ENV_VAR } from "#src/assistant/daemon-access";
import { initializeStartupSecrets, startupSecretEnvironment } from '../../../platform/secrets/startup-secrets.js';
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";

const consoleLogger = createConsoleLogger({ prefix: "" });
