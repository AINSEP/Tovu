import type { ChatMessage } from '@jini-ai/chat/core';
/** Thin Tovu host over Jini's shared frontend bridge and DOM driver. Both widgets use this. */
import { PAGE_CAPABILITIES } from '@jini-ai/agentic';
import { createDomPageDriver, type DomPageDriverPage } from '@jini-ai/agentic/dom';
import type { PagePublication } from '@jini-ai/agentic';
import { createFrontendSessionBridge, openFetchFrontendStream } from '@jini-ai/chat/browser/frontend-session-bridge';
import { allowsVisitorPath } from './visitor-site-path';

/** Per-document credential in memory only; neither transcript nor session storage carries it. */
export function createVisitorPageControl({ document, beforeNavigate }: { document: Document; beforeNavigate: (args: { messages?: ChatMessage[] }) => void },
  { assign = ({ path }: { path: string }) => window.location.assign(path), fetch: send = globalThis.fetch }: { assign?: (args: { path: string }) => void; fetch?: typeof fetch } = {}) {
  let close = () => {};
  let disposed = false;
  const attachAbort = new AbortController();
  let token: () => string | undefined = () => undefined;
  let readHeaders: () => Record<string, string> = () => ({});
  let rebind: () => Promise<unknown> = async () => {};
  let acceptedPath: string | undefined;
  let terminal = false;
  let terminalMessages: ChatMessage[] | undefined;
  let deferredSubmission: (() => Promise<void>) | undefined;
  let acceptedSubmission: (() => Promise<void>) | undefined;
  const navigateWhenReady = () => {
    if (!terminal) return;
    if (!acceptedPath && !acceptedSubmission) return;
    // Flush synchronously before the browser tears down this document. Rehydrating a transcript
    // must never repeat the old effect (the former directive replay caused an infinite reload).
    beforeNavigate({ messages: terminalMessages });
    const path = acceptedPath; acceptedPath = undefined;
    const submit = acceptedSubmission; acceptedSubmission = undefined;
    close();
    if (path) assign({ path });
    else void submit?.().catch(() => undefined);
  };
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
    const driver = createDomPageDriver({ root, pages }, { publication, deferSubmit: ({ execute }) => { deferredSubmission = execute; } });
    const bridge = createFrontendSessionBridge({ baseUrl: '', endpointPrefix: '/api/site-assistant/frontend-sessions', fetch: send,
      headers, openStream: ({ url }) => openFetchFrontendStream({ url, headers }, { fetch: send }) }, {
      maxResponseBytes: 96_000, pageDriver: driver, capabilityIds: PAGE_CAPABILITIES.map(capability => capability.id),
      preparePageInput({ action }) {
        deferredSubmission = undefined;
        const { __visitorPage, ...input } = structuredClone(action.input);
        const plan = __visitorPage as { revision: string; approved: boolean; path?: string; pages: { id: string; label: string }[] };
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
      },
      onBeforeResponse({ action }) {
        if (deferredSubmission) { beforeNavigate({}); return { accepted: true, terminalSubmission: true }; }
        if (action.capabilityId === 'page.navigate') beforeNavigate({});
        return undefined;
      },
      onAfterResponse({ action, output }) {
        if (deferredSubmission) { acceptedSubmission = deferredSubmission; deferredSubmission = undefined; navigateWhenReady(); return; }
        if (action.capabilityId !== 'page.navigate') return;
        const path = (output as { path?: unknown }).path;
        if (typeof path !== 'string' || !allowsVisitorPath({ path })) return;
        acceptedPath = path; navigateWhenReady();
      },
    });
    close = () => bridge.close(); token = bridge.bindToken;
    // ready records only the first attachment. A disconnected/parked stream needs a fresh bind
    // before a later send can give the run authority to execute page actions in this document.
    rebind = () => bridge.rebind({ signal: AbortSignal.any([attachAbort.signal, AbortSignal.timeout(10_000)]) });
    readHeaders = () => ({ ...headers(), 'x-frontend-bind-token': token() ?? '' });
    await Promise.race([bridge.ready, new Promise((_, reject) => {
      const timer = setTimeout(() => { bridge.close(); reject(new Error('Page attachment expired')); }, 10_000);
      void bridge.ready.then(() => clearTimeout(timer), () => clearTimeout(timer));
    })]);
  }
  return { get ready() { return ensureAttached(); },
    async headers(_required = {}, _options = {}) { await ensureAttached(); await rebind(); terminal = false; terminalMessages = undefined; acceptedPath = undefined; acceptedSubmission = undefined; deferredSubmission = undefined; return readHeaders(); },
    currentHeaders(_required = {}, _options = {}) { return readHeaders(); },
    finish({ navigation, messages }: { navigation: boolean; messages?: ChatMessage[] }, _options = {}) { if (navigation) { terminalMessages = messages; terminal = true; navigateWhenReady(); } },
    close(_required = {}, _options = {}) { disposed = true; attachAbort.abort(); close(); readHeaders = () => ({}); },
  };
}
