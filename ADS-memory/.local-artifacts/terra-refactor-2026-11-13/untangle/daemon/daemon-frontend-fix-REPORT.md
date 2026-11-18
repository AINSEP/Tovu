# daemon-frontend-fix: report (2026-11-18)

Plan-edit run. No product code changed. Facts read on `origin/wave2/daemon-r7`: Jini `7d74131e`, Tovu `6e7c0df6`. Unattended, no subagents.

## Result

**Executable.** `R7-ROUTES.md` gets revision 3: a new §12 plus row edits in §1.2 (rows 18, 24), §1.4 (cookie and host-hook rows), §3.5 (owner and cookie rows), §5 (G2 and G3 rows), §8 (the STOP rule that fired), §11.15 (two new gate rows, cookie row), §11.17 (order). Nothing is marked BLOCKED. One named difference (D-FS1) needs the owner's confirmation; it does not touch the address, trust or owner answers.

## What the STOP was about, re-derived from the code

| Fact | Today's producer | Why a web `Request` + `client` cannot give it |
|---|---|---|
| Visitor quota address | `resolveClientIp(req)` with no proxy list, so the answer is Express `req.ip` (under the serving app's `trust proxy`, `trust-proxy.ts:51`), else the socket peer, else `unknown` | the bridge's `client.address` is the raw socket peer; behind a platform edge every visitor would share one quota |
| Serving protocol for the visitor origin check | `resolveProtocol(req)`: first `X-Forwarded-Proto` hop when exactly http/https (no trust check), else `req.protocol` | `req.protocol` depends on the trust setting and TLS socket |
| Cookie `Secure` | `req.secure` (= `req.protocol === 'https'`) | same; and it is a **different fact** from the line above (probed: trust 1 + `X-Forwarded-Proto: HTTPS,http` → `secure false`, `resolveProtocol 'https'`) |
| Admin `tabId` | `req.query.tabId` from the admin app's `qs` | `URLSearchParams` accepts `?tabId=a&tabId=b`, `?tabId[x]=a` and a `tabId` after 1000 parameters; `qs` refuses all three |

Two smaller Express-only reads found on the way, both kept: `req.get('referer')` returns the `Referrer` header first; an absent `Host` prints as `undefined` in the origin template.

## Decision written into the plan (§12.2)

- Jini declares only `FrontendHookInput = { request: Pick<Request, 'method' | 'headers'>, locals }`. Hooks never get `client`. No Express, no proxy vocabulary in Jini.
- Tovu computes `TovuRequestFacts { clientAddress, servingProtocol, secure, query }` with the existing functions, called unchanged, so the answers are the same code. Domain reader in `contracts/core/request-facts.ts` (throws when absent: no default address that would fail open). Express capture in `server/inbound/shared/request-facts.ts`.
- They reach the hooks through `locals`: `mountJiniRoutes` seeds them on every dispatch at the mount line. Not once at the top of the server, because `req.ip`/`req.secure` read the trust setting of `req.app`, the app whose layer is running. Tovu's own Express routes that call the guest scope build the same input with `requestHookInput({ req })`.
- Jini exports the bridge's header loop as `nodeRequestHeaders`, so a header reads the same whether it arrived through the bridge or a Tovu Express route.

## Pins that fail if the answer changes (§12.5)

A1-A3: quota address (trusted proxy splits clients; no trust → spoofed `X-Forwarded-For` shares one quota; hop count takes the rightmost address). A4: facts table over trust × XFF × XFP. A5: cookie bytes and `Secure` per row, body stays `{"tabCredential":…}`. A6: `Referrer` alias and absent `Host`. A7: admin `tabId` shapes. A8: principal header written by the auth middleware above the mount. A9: the mount adapter fills and overwrites the facts key. A10: Jini hooks get `locals` and headers, no `client`. A11: missing facts → 500/403 + one report, 0 sessions (fails if a default address is added). A12: `capability` query shapes. Each names the one-line break that must turn it red.

## Steps (§12.6), replacing the stopped G2/G3 entries

F0 pins (no source change) → F1 Jini `nodeRequestHeaders` → F2a pair: guest scope + Tovu request facts (moved from G3 to G2: the session hooks call the scope, so they cannot change type in different pairs without an adapter) → F2b pair: `frontend-sessions` + `frontend-control` → F3 pair: `frontend-request-route`. F4 `surface-*`: **not blocked by this STOP** (no host hook, Express `res` only); §11.7 design unchanged; can run any time after P1.

STOP checks are fenced commands in §12.7. Each was run on a planted case in this run and fired: express-type grep, raw-peer-address grep, why-comment diff. The trust/address pin command selects tests by name; F0 requires the names it selects.

## For the owner

- **D-FS1 (new, confirm or reject).** The daemon reads `?capability=` itself (it cannot use a host's `qs`). `capability[]=a`, `capability[0]=a` and `capability[25]=a` are accepted as `['a']` today and become the existing "invalid capability" error event. A `capability` after 1000 other parameters is ignored today and counted after. No client sends either form: the only client builds `capability=<id>&…`. The change goes towards refusal, not a wider grant. Rec: accept. If rejected, the alternative is to copy `qs`'s bracket rules into the daemon reader (not recommended).
- Already decided and only applied here: DM-ETAG (the `Forbidden`/`Too Many Requests` text answers lose Express's ETag), O-15 (`setTimer` dep), O-4.
- No owner call is needed on the address, trust, protocol, `Secure` or owner answers: they come from the same Tovu functions as today, and pins A1-A11 check that.

## Estimates (context, executor)

F0 ~25k, F1 ~8k, F2a ~45k, F2b ~70k, F3 ~35k, F4 ~35k (§11.7). The frontend part of R7-G2/G3 grows by about 40k over INDEX's figures (F0 pins, F1, the Tovu facts files). INDEX.md was not edited in this run.

## Not done

- No gates run: plan documents only, no product code changed, so there was no build to check.
- INDEX.md cost rows not updated (above).
- The parser limit the visitor responses path gets from `parsePublicJsonBody` was not read. F2b reads it and records it in its commit message, with a T4 limit ± 1 pin.
