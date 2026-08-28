# Spec: Protocol Surfaces

## Goal

Define how the server exposes non-HTTP-human-facing surfaces such as MCP, agent/tool protocols, webhooks, and future orchestration adapters while enforcing the same auth, permission, and audit policies as normal server routes.

## Principle

A protocol adapter is still a server surface.

It may change transport shape, but it must not bypass:

- auth
- authorization
- workspace/system scoping
- audit
- feature flags
- recovery and safe-mode policy

## Supported Surface Types

The protocol layer should be able to expose:

- MCP tools and resources
- A2A or other agent protocols
- AG-UI or streaming interaction bridges
- incoming and outgoing webhooks

## Contract Rules

- Tools and protocol actions must resolve to existing server commands or queries.
- Protocol descriptors must be declarative and auditable.
- Permission checks happen before command execution, not inside a tool adapter as an afterthought.
- Streaming or multi-step responses must still preserve request/job correlation.

Minimum protocol action descriptor fields:

- `surface`
- `actionId`
- `capabilityId`
- `requestShape`
- `responseShape`
- `resourceScope`
- `auditCategory`

Protocol surfaces use the same permission callback contract defined by `30-auth/authorization.spec.md`.

Minimum protocol response envelope:

```ts
type ProtocolResponseEnvelope = {
  requestId: string;
  correlationId: string;
  surface: string;
  operation: string;
  status: "completed" | "accepted" | "failed";
  result?: Record<string, unknown>;
  jobId?: string | null;
  error?: {
    code: string;
    message: string;
    details: Record<string, unknown>;
    requestId: string;
  };
};
```

## Webhooks

Webhook surfaces should support:

- signature verification
- replay protection where applicable
- idempotent processing
- bounded retry behavior

Minimum webhook verification fields:

- signature identifier or key identifier
- replay identifier
- received-at timestamp
- idempotency key when the sender supports one

## Acceptance Checks

- A protocol adapter cannot do more than the equivalent authenticated server route or command allows.
- Tool exposure is declarative and traceable.
- Webhook and tool actions can be audited like first-party server actions.
- Streaming or multi-step protocol responses preserve `requestId` and `jobId` across the interaction.

## Non-goals (current)

- Final protocol vendor choices
- Final streaming UX contract for every client
