import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import type { ChatMessage } from '@jini-ai/chat/core';
import type { ChatPaneAgentToolAction } from '@jini-ai/chat/react';
/** Thin Tovu host over Jini's shared frontend bridge and DOM driver. Both widgets use this. */
import { PAGE_CAPABILITIES } from '@jini-ai/agentic';
import { createDomPageDriver, createDriverPagePort } from '@jini-ai/agentic/dom';
import type { DomPageDriverPage } from "@jini-ai/core/contracts/site/agentic-dom";
import type { PagePublication } from '@jini-ai/agentic';
import { createFrontendSessionBridge, openFetchFrontendStream, type FrontendSessionBridgeOptions } from '@jini-ai/chat/browser/frontend-session-bridge';
import { allowsVisitorPath } from './visitor-site-path';

type Submission = () => Promise<void>;
/** The navigation/submission hand-off between the bridge hooks and `finish`, shared by reference. */
interface ControlState {
  acceptedPath: string | undefined;
  terminal: boolean;
  terminalMessages: ChatMessage[] | undefined;
  deferredSubmission: Submission | undefined;
  acceptedSubmission: Submission | undefined;
}
type PagePlan = { revision: string; approved: boolean; path?: string; pages: { id: string; label: string }[] };

function preparePageInput(
  { action, publication, pages, state }: { action: { input: Record<string, unknown> }; publication: PagePublication; pages: Record<string, DomPageDriverPage>; state: ControlState },
  _options = {},
) {
  state.deferredSubmission = undefined;
  const { __visitorPage, ...input } = structuredClone(action.input);
  const plan = __visitorPage as PagePlan;
  if (!plan || plan.revision !== publication.revision || plan.approved !== true) throw new Error('Page action unavailable');
  for (const key of Object.keys(pages)) delete pages[key];
  if (plan.path && !allowsVisitorPath({ path: plan.path })) throw new Error('Unpublished navigation path');
  for (const page of plan.pages) {
    pages[page.id] = { label: page.label, navigate: () => {
      if (page.id !== input.page || !plan.path) throw new Error('Navigation target changed');
      return { path: plan.path };
    } };
  }
  return input;
}

function createResponseHooks(
  { state, beforeNavigate, navigateWhenReady }: { state: ControlState; beforeNavigate: (args: { messages?: ChatMessage[] }) => void; navigateWhenReady: () => void },
  _options = {},
): Pick<FrontendSessionBridgeOptions, 'onBeforeResponse' | 'onAfterResponse'> {
  return {
    onBeforeResponse({ action }) {
      if (state.deferredSubmission) { beforeNavigate({}); return { accepted: true, terminalSubmission: true }; }
      if (action.capabilityId === 'page.navigate') beforeNavigate({});
      return undefined;
    },
    onAfterResponse({ action, output }) {
      if (state.deferredSubmission) { state.acceptedSubmission = state.deferredSubmission; state.deferredSubmission = undefined; navigateWhenReady(); return; }
      if (action.capabilityId !== 'page.navigate') return;
      const path = (output as { path?: unknown }).path;
      if (typeof path !== 'string' || !allowsVisitorPath({ path })) return;
      state.acceptedPath = path; navigateWhenReady();
    },
  };
}

function flushTerminalNavigation(
  { state, beforeNavigate, assign, close }: { state: ControlState; beforeNavigate: (args: { messages?: ChatMessage[] }) => void; assign: (args: { path: string }) => void; close: () => void },
  _options = {},
) {
  if (!state.terminal) return;
  if (!state.acceptedPath && !state.acceptedSubmission) return;
  // Flush synchronously before the browser tears down this document. Rehydrating a transcript
  // must never repeat the old effect (the former directive replay caused an infinite reload).
  beforeNavigate({ messages: state.terminalMessages });
  const path = state.acceptedPath; state.acceptedPath = undefined;
  const submit = state.acceptedSubmission; state.acceptedSubmission = undefined;
  close();
  if (path) assign({ path });
  else void submit?.().catch((error: unknown) => console.error("[site-chat] Could not submit the page form", describeErrorForLog({ err: error })));
}

/** Rejects once the first attachment has not completed within 10 s, closing the half-open bridge. */
function bridgeReadyWithin10s({ bridge }: { bridge: { ready: Promise<unknown>; close: () => void } }, _options = {}) {
  return Promise.race([bridge.ready, new Promise((_, reject) => {
    const timer = setTimeout(() => { bridge.close(); reject(new Error('Page attachment expired')); }, 10_000);
    void bridge.ready.then(() => clearTimeout(timer), () => clearTimeout(timer));
  })]);
}

/** One live attachment of this document: its credentials, its claim request and its bridge. */
interface PageBinding {
  /** All-or-nothing: the tab credential, publication revision and the bind token live right now. */
  headers(): Record<string, string>;
  rebind(): Promise<{ sessionId: string }>;
  accept(required: { runId: string; action: ChatPaneAgentToolAction }): void;
  close(): void;
}

/**
 * Claims one run-delivered invocation with the original attachment's credentials, before the driver
 * runs. Only an explicit `{ begun: true }` is a claim; a refusal, an error or any other body is not.
 */
async function beginInvocation(
  { send, sessionId, headers, runId, invocationId, signal }: { send: typeof fetch; sessionId: () => string | undefined; headers: () => Record<string, string>; runId: string; invocationId: string; signal: AbortSignal },
  _options = {},
): Promise<boolean> {
  const session = sessionId();
  if (!session) return false;
  const response = await send(`/api/site-assistant/frontend-sessions/${encodeURIComponent(session)}/begin`, {
    method: 'POST', mode: 'same-origin', redirect: 'error', credentials: 'same-origin', signal,
    headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session, runId, invocationId }),
  });
  if (!response.ok) return false;
  const body = await response.json().catch(() => null) as { begun?: unknown } | null;
  return body?.begun === true;
}

type AttachArgs = { document: Document; send: typeof fetch; signal: AbortSignal; state: ControlState; beforeNavigate: (args: { messages?: ChatMessage[] }) => void; navigateWhenReady: () => void };

/** Attaches this document once; `undefined` when the page publishes nothing or the server declines. */
async function attachPage({ document, send, signal, state, beforeNavigate, navigateWhenReady }: AttachArgs, _options = {}): Promise<PageBinding | undefined> {
  const config = document.getElementById('tovu-visitor-publication');
  const root = document.querySelector<HTMLElement>('[data-visitor-page-root]');
  if (!config || !root || signal.aborted) return undefined;
  const publication = JSON.parse(config.textContent ?? '') as PagePublication;
  const response = await send('/api/site-assistant/frontend-sessions/credentials', { method: 'POST', mode: 'same-origin', redirect: 'error', credentials: 'same-origin', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
  if (!response.ok || signal.aborted) return undefined;
  const { tabCredential } = await response.json();
  if (typeof tabCredential !== 'string') return undefined;
  const credentials = () => ({ 'x-frontend-tab': tabCredential, 'x-visitor-publication': publication.revision });
  const pages: Record<string, DomPageDriverPage> = {};
  let sessionId: string | undefined;
  const driver = createDomPageDriver({ root, pages }, { publication, deferSubmit: ({ execute }) => { state.deferredSubmission = execute; } });
  const bridge = createFrontendSessionBridge({ baseUrl: '', endpointPrefix: '/api/site-assistant/frontend-sessions', fetch: send,
    headers: credentials, openStream: ({ url }) => openFetchFrontendStream({ url, headers: credentials }, { fetch: send }) }, {
    maxResponseBytes: 96_000, page: createDriverPagePort({ driver }), capabilityIds: PAGE_CAPABILITIES.map(capability => capability.id),
    preparePageInput: ({ action }) => preparePageInput({ action, publication, pages, state }),
    ...createResponseHooks({ state, beforeNavigate, navigateWhenReady }),
    runInvocations: { begin: ({ runId, invocationId, signal: claim }) => beginInvocation({ send, sessionId: () => sessionId, headers: binding.headers, runId, invocationId, signal: claim }) },
  });
  const binding: PageBinding = {
    headers: () => ({ ...credentials(), 'x-frontend-bind-token': bridge.bindToken() ?? '' }),
    // ready records only the first attachment. A disconnected/parked stream needs a fresh bind
    // before a later send can give the run authority to execute page actions in this document.
    rebind: async () => {
      const live = await bridge.rebind({ signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
      sessionId = live.sessionId;
      return live;
    },
    accept: ({ runId, action }) => bridge.acceptRunInvocation?.({ runId, action }),
    close: () => bridge.close(),
  };
  await bridgeReadyWithin10s({ bridge });
  return binding;
}

function resetTurn({ state }: { state: ControlState }, _options = {}) {
  state.terminal = false; state.terminalMessages = undefined; state.acceptedPath = undefined; state.acceptedSubmission = undefined; state.deferredSubmission = undefined;
}

/** Per-document credential in memory only; neither transcript nor session storage carries it. */
export function createVisitorPageControl({ document, beforeNavigate }: { document: Document; beforeNavigate: (args: { messages?: ChatMessage[] }) => void },
  { assign = ({ path }: { path: string }) => window.location.assign(path), fetch: send = globalThis.fetch }: { assign?: (args: { path: string }) => void; fetch?: typeof fetch } = {}) {
  const attachAbort = new AbortController();
  let binding: PageBinding | undefined;
  let attaching: Promise<PageBinding | undefined> | undefined;
  let boundRunId: string | undefined;
  const state: ControlState = { acceptedPath: undefined, terminal: false, terminalMessages: undefined, deferredSubmission: undefined, acceptedSubmission: undefined };
  const navigateWhenReady = () => flushTerminalNavigation({ state, beforeNavigate, assign, close: () => binding?.close() });
  // A failed attach or rebind closes the stale binding and forgets it, so its token never travels
  // again and the next turn starts a fresh attachment instead of waiting on a dead one.
  const invalidate = () => { attaching = undefined; boundRunId = undefined; binding?.close(); binding = undefined; };
  const ensureAttached = () => attaching ??= attachPage({ document, send, signal: attachAbort.signal, state, beforeNavigate, navigateWhenReady })
    .then(attached => {
      // A page closed mid-attach must not keep the bridge that finished attaching after it.
      if (attachAbort.signal.aborted) { attached?.close(); return undefined; }
      binding = attached; return attached;
    }, (error: unknown) => { invalidate(); throw error; });
  return { get ready() { return ensureAttached().then(() => undefined); },
    async headers({ runId }: { runId?: string; signal?: AbortSignal } = {}, _options = {}): Promise<Record<string, string>> {
      boundRunId = undefined;
      resetTurn({ state });
      try {
        const attached = await ensureAttached();
        await attached?.rebind();
      } catch (error) { invalidate(); throw error; }
      boundRunId = runId;
      return binding?.headers() ?? {};
    },
    currentHeaders(_required = {}, _options = {}) { return binding?.headers() ?? {}; },
    /**
     * The model can request an effect but cannot deliver one: only an action delivered for the run
     * this document bound for the current turn reaches the bridge, which claims it before the driver.
     * Live-only: the action is never stored, so a reload preserves chat without replaying effects.
     */
    acceptBrowserInvocation({ runId, action }: { runId: string; action: ChatPaneAgentToolAction }, _optional = {}) {
      if (!boundRunId || runId !== boundRunId) return;
      binding?.accept({ runId, action });
    },
    finish({ navigation, messages }: { navigation: boolean; messages?: ChatMessage[] }, _options = {}) { if (navigation) { state.terminalMessages = messages; state.terminal = true; navigateWhenReady(); } },
    close(_required = {}, _options = {}) { attachAbort.abort(); invalidate(); },
  };
}
