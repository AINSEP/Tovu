// Verbatim copy of @jini-ai/agent-plugins dist/admin-surfaces/surface-client.js (Jini a4a354d8).
// The surface is plain static files served without credentials, so it carries its own copy of the
// self-contained protocol client instead of importing the package; refresh it when the protocol changes.
/**
 * @file The surface-side half of the admin-surface message protocol, for a plugin's own UI.
 *
 * Self-contained on purpose (no imports): a plugin's surface is plain static files, so it may import
 * this module from the package or copy the compiled file next to its entry. The constants repeat
 * `./protocol.ts`; the vertical-slice test proves the two still agree.
 *
 * Trust rules it applies: it accepts init only from its parent window (once), learns the host's
 * origin from that init and posts only to that origin (never "*"), and accepts a response only from
 * the parent, from that origin, for this mount, for a request it still has pending, in a valid shape.
 */
const PROTOCOL = 'jini.admin-surface';
const VERSION = 1;
const DEFAULT_TIMEOUT_MS = 30_000;
/** Rejection value of `call` when the host refused the action or the request timed out. */
export class AdminSurfaceCallError extends Error {
    code;
    retryable;
    constructor(required) {
        super(required.message);
        this.name = 'AdminSurfaceCallError';
        this.code = required.code;
        this.retryable = required.retryable;
    }
}
function isMessage(data, kind) {
    if (typeof data !== 'object' || data === null)
        return false;
    const message = data;
    return message.protocol === PROTOCOL && message.version === VERSION && message.kind === kind;
}
function isFailure(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const error = value;
    return typeof error.code === 'string' && typeof error.message === 'string' && typeof error.retryable === 'boolean';
}
/** A response has `ok: true` with a result, or `ok: false` with a well-formed failure. */
function isWellFormedResponse(message) {
    return message.ok === true ? Object.hasOwn(message, 'result') : message.ok === false && isFailure(message.error);
}
/**
 * Connects a surface to its host. In a browser:
 * `createAdminSurfaceClient({ parent: window.parent, listen: (h) => { addEventListener('message', h); return () => removeEventListener('message', h); } })`.
 * @param optional.timeoutMs - How long `call` waits for a response before rejecting with `timeout`.
 * @complexity O(1) per message.
 */
export function createAdminSurfaceClient(required, optional = {}) {
    const timeoutMs = optional.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const nowMs = optional.nowMs ?? Date.now;
    const pending = new Map();
    let init;
    let nextRequest = 0;
    let resolveReady = () => { };
    const ready = new Promise((resolve) => { resolveReady = resolve; });
    function onInit(event, data) {
        if (init !== undefined || typeof data.mountId !== 'string')
            return;
        init = { mountId: data.mountId, origin: event.origin, bootstrap: data.bootstrap };
        resolveReady();
    }
    function onResponse(event, data) {
        if (event.origin !== init?.origin || data.mountId !== init.mountId || typeof data.requestId !== 'string')
            return;
        const waiting = pending.get(data.requestId);
        if (waiting === undefined || !isWellFormedResponse(data))
            return;
        pending.delete(data.requestId);
        clearTimeout(waiting.timer);
        if (data.ok === true)
            waiting.resolve(data.result);
        else
            waiting.reject(new AdminSurfaceCallError(data.error));
    }
    const unsubscribe = required.listen((event) => {
        if (event.source !== required.parent)
            return;
        if (isMessage(event.data, 'init'))
            onInit(event, event.data);
        else if (isMessage(event.data, 'action-response'))
            onResponse(event, event.data);
    });
    /** Posts one request of `kind` to the host origin and waits for its `action-response`. */
    async function send(kind, fields) {
        if (init === undefined)
            await ready;
        const { mountId, origin } = init;
        nextRequest += 1;
        const requestId = `r${nextRequest}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(requestId);
                reject(new AdminSurfaceCallError({ code: 'timeout', message: 'The host did not answer in time. Try again.', retryable: true }));
            }, timeoutMs);
            pending.set(requestId, { resolve, reject, timer });
            required.parent.postMessage({ protocol: PROTOCOL, version: VERSION, kind, mountId, requestId, ...fields }, origin);
        });
    }
    /** Asks the host to run one declared action; resolves with its result. */
    function call(input) {
        return send('action-request', { action: input.action, payload: input.payload });
    }
    /** Asks the host to open `url` outside the sandbox; only https links on the surface's declared
     * `linkOrigins` open, and the host decides how (new tab, system browser). Rejects with the host's refusal. */
    async function openLink(input) {
        await send('open-link', { url: input.url });
    }
    /** The bootstrap `data` the host sent with init, or `undefined` once it has expired (or none was sent). */
    function bootstrap() {
        const envelope = init?.bootstrap;
        if (typeof envelope !== 'object' || envelope === null)
            return undefined;
        const { expiresAt, data } = envelope;
        return typeof expiresAt === 'number' && nowMs() < expiresAt ? data : undefined;
    }
    /** Stops listening and rejects every pending call. */
    function close() {
        unsubscribe();
        for (const [requestId, waiting] of pending) {
            clearTimeout(waiting.timer);
            waiting.reject(new AdminSurfaceCallError({ code: 'closed', message: 'The surface was closed before the host answered.', retryable: false }));
            pending.delete(requestId);
        }
    }
    return { ready, call, openLink, bootstrap, close };
}
