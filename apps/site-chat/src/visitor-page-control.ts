import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import type { ChatMessage } from '@jini-ai/chat/core';
/** Thin Tovu host over Jini's shared frontend bridge and DOM driver. Both widgets use this. */
import { PAGE_CAPABILITIES } from '@jini-ai/agentic';
import { pagePortFromDriver } from './jini-page-port';
import { createDomPageDriver, type DomPageDriverPage } from '@jini-ai/agentic/dom';
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

/** Per-document credential in memory only; neither transcript nor session storage carries it. */
export function createVisitorPageControl({ document, beforeNavigate }: { document: Document; beforeNavigate: (args: { messages?: ChatMessage[] }) => void },
  { assign = ({ path }: { path: string }) => window.location.assign(path), fetch: send = globalThis.fetch }: { assign?: (args: { path: string }) => void; fetch?: typeof fetch } = {}) {
  let close = () => {};
  let disposed = false;
  const attachAbort = new AbortController();
  let token: () => string | undefined = () => undefined;
  let readHeaders: () => Record<string, string> = () => ({});
  let rebind: () => Promise<unknown> = async () => {};
  const state: ControlState = { acceptedPath: undefined, terminal: false, terminalMessages: undefined, deferredSubmission: undefined, acceptedSubmission: undefined };
  const navigateWhenReady = () => flushTerminalNavigation({ state, beforeNavigate, assign, close: () => close() });
  let ready: Promise<void> | undefined;
  const ensureAttached = () => ready ??= attach().catch(error => {
    ready = undefined;
    close();
    throw error;
  });
  async function attach(): Promise<void> {
    const config = document.getElementById('tovu-visitor-publication');
    const root = document.querySelector<HTMLElement>('[data-visitor-page-root]');
    if (!config || !root) return;
    const publication = JSON.parse(config.textContent ?? '') as PagePublication;
    if (disposed) return;
    const response = await send('/api/site-assistant/frontend-sessions/credentials', { method: 'POST', mode: 'same-origin', redirect: 'error', credentials: 'same-origin', signal: AbortSignal.any([attachAbort.signal, AbortSignal.timeout(10_000)]) });
    if (!response.ok || disposed) return;
    const { tabCredential } = await response.json();
    if (typeof tabCredential !== 'string') return;
    const headers = () => ({ 'x-frontend-tab': tabCredential, 'x-visitor-publication': publication.revision });
    const pages: Record<string, DomPageDriverPage> = {};
    const driver = createDomPageDriver({ root, pages }, { publication, deferSubmit: ({ execute }) => { state.deferredSubmission = execute; } });
    const bridge = createFrontendSessionBridge({ baseUrl: '', endpointPrefix: '/api/site-assistant/frontend-sessions', fetch: send,
      headers, openStream: ({ url }) => openFetchFrontendStream({ url, headers }, { fetch: send }) }, {
      maxResponseBytes: 96_000, page: pagePortFromDriver({ driver }), capabilityIds: PAGE_CAPABILITIES.map(capability => capability.id),
      preparePageInput: ({ action }) => preparePageInput({ action, publication, pages, state }),
      ...createResponseHooks({ state, beforeNavigate, navigateWhenReady }),
    });
    close = () => bridge.close(); token = bridge.bindToken;
    // ready records only the first attachment. A disconnected/parked stream needs a fresh bind
    // before a later send can give the run authority to execute page actions in this document.
    rebind = () => bridge.rebind({ signal: AbortSignal.any([attachAbort.signal, AbortSignal.timeout(10_000)]) });
    readHeaders = () => ({ ...headers(), 'x-frontend-bind-token': token() ?? '' });
    await bridgeReadyWithin10s({ bridge });
  }
  return { get ready() { return ensureAttached(); },
    async headers(_required = {}, _options = {}) { await ensureAttached(); await rebind(); state.terminal = false; state.terminalMessages = undefined; state.acceptedPath = undefined; state.acceptedSubmission = undefined; state.deferredSubmission = undefined; return readHeaders(); },
    currentHeaders(_required = {}, _options = {}) { return readHeaders(); },
    finish({ navigation, messages }: { navigation: boolean; messages?: ChatMessage[] }, _options = {}) { if (navigation) { state.terminalMessages = messages; state.terminal = true; navigateWhenReady(); } },
    close(_required = {}, _options = {}) { disposed = true; attachAbort.abort(); close(); readHeaders = () => ({}); },
  };
}
