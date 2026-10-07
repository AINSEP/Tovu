/**
 * @file Durable chat history for the admin assistant — `GET/POST/PATCH/DELETE /api/assistant/chats`.
 *
 * Unlike its sibling `assistant.ts`, nothing here is proxied. Run execution belongs to the agent
 * daemon because that is where run state lives; transcripts belong to `content.db` because that is
 * where Tovu's data lives and where its backup, snapshot, and workspace scoping already work.
 * Splitting them that way means the daemon can restart, crash, or be replaced without history
 * being affected.
 *
 * Authorization is structural rather than per-route. `requireAdminSession` establishes *who* the
 * caller is, and `deps.chatHistory(principal)` hands back a store that can only see that
 * principal's own conversations (`assistant/persistence/tenant-scope.ts`). No handler below holds
 * a database handle, so none of them can accidentally write a query that omits the owner — the
 * omission this design exists to prevent.
 *
 * Not mounted here, deliberately: anything for anonymous visitors. The public assistant is
 * default-off (`assistant/public-assistant-settings.ts`) and its routes will need their own
 * cookie-based principal, its own rate limiting, and its own TTL. Reusing an admin-session-gated
 * router for it by loosening this middleware would be the easiest way to hand a visitor an admin
 * scope, so the two get separate mounts.
 */
import type { Express, Request, Response } from "express";
import { readPreviousAssistantDaemon } from "../../lifecycle/assistant-daemon-registry.js";

import { deriveContentConversationTitle } from "#src/contracts/headless/content-chat-title";
import { deriveConversationTitle, redactUserMessage, redactUserText } from "@jini-ai/chat/core";
import type { ChatHistoryStore, ChatMessage } from "@jini-ai/chat/core";

import { getAuthedPrincipal, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";
import { runEventsForSave } from "#src/contracts/core/assistant-run-events";
import type { ServerModuleHandle } from "./types.js";
import { assistantRunFinalizerFor, createHttpRunDaemonClient, type AssistantRunFinalizer } from "./assistant-run-finalizer.js";
import { createNoopObservabilityPort } from "#src/platform/observability/index";

/** Preserve a standalone resource name (including skill slugs) verbatim. Prose still follows
 * the shared heuristic; injected guidance never enters the stored user message. */
function deriveAssistantConversationTitle(text: string): string {
  return deriveContentConversationTitle({ prompt: text, deriveFallback: deriveConversationTitle });
}

/** Rejects a body that is not a plain object, so `req.body.title` can never be an array or null. */
function bodyOf(req: Request): Record<string, unknown> {
  const body = req.body as unknown;
  return body !== null && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

/**
 * Naming happens on append, not only at create time, because the admin dock creates the
 * conversation when "New" is clicked — before any prompt has been typed — so the create route's
 * `firstMessage` seed is never populated on that path and every admin chat stayed permanently
 * "Untitled". Deriving on append is what actually names them.
 *
 * Guarded on the title still being empty rather than on `title_source`: the store's no-clobber
 * guard only applies to `generated`, and a `fallback` rename would happily overwrite a manual one.
 * "Only name a chat that has no name" cannot do that, and it also self-limits — once a title
 * lands, this stops firing. A first prompt that yields no usable title (a bare URL, only
 * punctuation) leaves the chat unnamed and lets the next message name it, which is better than
 * locking in a blank.
 *
 * Deliberately swallows its own errors: a naming failure must never turn a successfully persisted
 * message into an error response. Only fires for a `user` message — an assistant reply is never
 * the source of a conversation's title.
 */
async function maybeNameFromFirstUserMessage(
  store: ChatHistoryStore,
  id: string,
  message: ChatMessage,
  body: Record<string, unknown>,
): Promise<void> {
  if (message.role !== "user") return;
  try {
    const conversation = await store.get({ id });
    if (!conversation || conversation.title) return;
    const derived = deriveAssistantConversationTitle(typeof body.content === "string" ? body.content : "");
    if (derived) await store.rename({ id, title: derived }, { source: "fallback" });
  } catch {
    // Leave it untitled; the next user message gets another chance.
  }
}

export interface AssistantChatsModuleOptions {
  /** Tests inject one with a fake daemon; production builds the real one over `deps.chatRunLedger`. */
  readonly finalizer?: AssistantRunFinalizer;
  /** Only the site-serving composition opts in; export apps must never repair live turns. */
  readonly recoverInterrupted?: boolean;
  readonly onBootWork?: (work: Promise<void>) => void;
}

export function createAssistantChatsModule(deps: RouteDeps, options: AssistantChatsModuleOptions = {}): ServerModuleHandle {
  const finalizer = options.finalizer ?? assistantRunFinalizerFor({
    ledger: deps.chatRunLedger, observability: deps.observability,
    ...(options.recoverInterrupted && deps.siteBinding?.dir ? {
      recoveryDaemon: createHttpRunDaemonClient({ observability: deps.observability ?? createNoopObservabilityPort({}) }, {
        previousDaemon: () => readPreviousAssistantDaemon({ siteDir: deps.siteBinding.dir }, {}),
      }),
    } : {}),
  });
  return {
    name: "assistant-chats",
    registerRoutes: (app: Express) => {
      /*
       * Serving-boot repair, before chat routes answer: a queued/running turn may still belong to
       * a live detached daemon, so dispatch each unfinished binding to the shared coordinator. It
       * reattaches live attempts, waits for uncertainty, and continues dead attempts within the
       * saved budget. Child teardown is best
       * effort, not proof of death. Route registration also happens during static exports inside the
       * daemon (and eagerly on importing app.ts); those are not restarts and must never sweep.
       */
      const reconciled = (options.recoverInterrupted ? finalizer.reconcileInterrupted({}, {}) : Promise.resolve(0)).then(
        (repaired) => {
          if (repaired > 0) console.log(`[assistant-chats] dispatched ${repaired} unfinished chat turn(s) to recovery`);
        },
        (error: unknown) => {
          // A failed repair leaves rows `running` (the pane shows them spinning); it must not keep
          // every chat route down with it.
          console.error("[assistant-chats] boot-time repair of interrupted chat turns failed", error);
        }
      );
      if (options.recoverInterrupted) options.onBootWork?.(reconciled);

      app.use("/api/assistant/chats", requireAdminSession(deps));
      // The repair is async now (storage kernel); no chat route answers until it has finished.
      app.use("/api/assistant/chats", (_req, _res, next) => {
        void reconciled.then(() => next());
      });

      /** The store for whoever is making this request, and nobody else. */
      function storeFor(res: Response) {
        const principal = getAuthedPrincipal(res);
        return deps.chatHistory({
          kind: "user",
          workspaceId: deps.workspaceId,
          userId: principal.id,
        });
      }

      app.get("/api/assistant/chats", (_req, res, next) => {
        storeFor(res)
          .list()
          .then((conversations) => res.json({ conversations }))
          .catch(next);
      });

      app.post("/api/assistant/chats", (req, res, next) => {
        const body = bodyOf(req);
        const id = typeof body.id === "string" && body.id ? body.id : crypto.randomUUID();
        // A title derived from the first prompt, when the client sends one. Local and synchronous
        // — a conversation needs a name the moment it appears in the list, and a model call to
        // produce one would put a spinner in front of every "New chat".
        const seed = typeof body.firstMessage === "string" ? deriveAssistantConversationTitle(redactUserText({ text: body.firstMessage }).text) : "";
        storeFor(res)
          .create({
            id,
            ...(seed ? { title: seed, titleSource: "fallback" as const } : {}),
          })
          .then((conversation) => res.status(201).json({ conversation }))
          .catch(next);
      });

      app.patch("/api/assistant/chats/:id", (req, res, next) => {
        const body = bodyOf(req);
        const title = typeof body.title === "string" ? body.title.trim() : "";
        if (!title) {
          res.status(400).json({ error: "'title' must be a non-empty string", code: "VALIDATION_ERROR" });
          return;
        }
        // `source` defaults to `manual` in the store. A caller may pass `generated` for an
        // agent-produced title, which the store then refuses to apply over a manual rename.
        const source = body.source === "generated" ? ("generated" as const) : ("manual" as const);
        storeFor(res)
          .rename({ id: req.params.id!, title }, { source })
          .then((conversation) =>
            // `null` means the id does not exist *or* belongs to someone else. Both answer 404, on
            // purpose: distinguishing them would confirm the existence of another admin's chat.
            conversation ? res.json({ conversation }) : res.status(404).json({ error: "not found" }),
          )
          .catch(next);
      });

      app.delete("/api/assistant/chats/:id", (req, res, next) => {
        // Cancel before deleting the binding. Once cascaded away, recovery cannot recreate it.
        const store = storeFor(res);
        store.messages({ conversationId: req.params.id! }).then(async (messages) => {
          for (const message of messages) {
            if (!message.runId || !["queued", "running"].includes(message.runStatus ?? "")) continue;
            await deps.chatRunLedger.durable?.cancel({ runId: message.runId, reason: "conversation-deleted" }, {});
            await finalizer.recover({ messageId: message.id, trigger: "browser" }, {});
          }
          await store.delete({ id: req.params.id! });
        })
          .then(() => res.status(204).end())
          .catch(next);
      });

      app.get("/api/assistant/chats/:id/messages", (req, res, next) => {
        storeFor(res)
          .messages({ conversationId: req.params.id! })
          .then((messages) => res.json({ messages }))
          .catch(next);
      });

      app.put("/api/assistant/chats/:id/messages/:messageId", (req, res, next) => {
        const body = bodyOf(req);
        if (body.role !== "user" && body.role !== "assistant") {
          res.status(400).json({ error: "'role' must be 'user' or 'assistant'", code: "VALIDATION_ERROR" });
          return;
        }
        if (typeof body.content !== "string") {
          res.status(400).json({ error: "'content' must be a string", code: "VALIDATION_ERROR" });
          return;
        }
        const sent = body as unknown as ChatMessage;
        const message: ChatMessage = redactUserMessage({ message: {
          ...sent,
          id: req.params.messageId!,
          // Streamed text deltas saved as one event per run, the same shape the server finalizer writes.
          ...(Array.isArray(sent.events) ? { events: runEventsForSave(sent.events) } : {}),
        } }).message;
        const id = req.params.id!;
        const store = storeFor(res);
        store
          .appendMessage({ conversationId: id, message })
          .then(async (saved) => {
            if (!saved) {
              res.status(404).json({ error: "not found" });
              return;
            }
            await maybeNameFromFirstUserMessage(store, id, message, body);
            // The in-flight stub of a daemon run is the one moment the server learns which row a
            // run belongs to. From here the server saves the finished turn itself, so it no longer
            // depends on this browser staying connected (`assistant-run-finalizer.ts`). A no-op for
            // anything that is not an in-flight daemon run.
            // Acceptance already starts the authoritative watch; a browser save merely returns
            // that row. Re-reading its attempt base prevents a replay from erasing prior segments.
            const durable = await deps.chatRunLedger.durable?.load({ messageId: saved.id }, {});
            finalizer.watch({ principalId: getAuthedPrincipal(res).id, conversationId: id, message: saved }, { attemptBase: [...(durable?.attemptBase ?? [])] });
            res.json({ message: saved });
          })
          .catch(next);
      });
    },
  };
}
