# Spec: Tenancy And Jobs

## Goal

Define how the server resolves workspace/system context and how it initiates background jobs, scheduled work, and automation without turning request handlers into long-running workflow engines.

## Tenancy

The server must support clear scope resolution for:

- system-level requests
- workspace-level requests
- cross-workspace operations where explicitly allowed

Workspace resolution may come from:

- host/subdomain
- route/path segment
- explicit workspace identifier
- authenticated actor context

The resolution mechanism may change, but the resolved tenancy context must be explicit before domain handlers run.

## Job Initiation

The server must be able to initiate background work through:

- outbox-driven side effects
- scheduled jobs
- webhook-triggered jobs
- manual operator-triggered jobs
- content or extension event-triggered jobs

## Request/Job Boundary

The server must not keep expensive or retry-prone work inline when it belongs in a job.

Long-running operations should return an accepted or job-tracking response when appropriate instead of pretending to be synchronous.

Minimum accepted-work envelope:

```ts
type JobTrackingResponse = {
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  operation: string;
  submittedAt: string;
  requestId: string;
  scope: {
    mode: "system" | "workspace";
    workspaceId: string | null;
  };
  statusUrl: string;
  resourceId?: string | null;
};
```

Routes that intentionally hand work off to jobs should return:

- HTTP `202`
- the `JobTrackingResponse`
- correlation fields that allow operators and clients to trace the accepted work

## Job State

The platform should be able to express:

- queued
- running
- succeeded
- failed
- cancelled

with correlation back to:

- request ID
- actor
- workspace/system scope
- triggering event

Job state surfaces must also support:

- idempotent re-submission where the route family exposes retries
- retry count and last terminal error code
- dead-letter or exhausted-retry visibility when a job can no longer advance

## Acceptance Checks

- Workspace scope is resolved before protected handlers run.
- Jobs can be initiated without leaking long-running work into request handlers.
- Job execution context preserves audit and correlation data.
- Accepted async operations expose one canonical job-tracking envelope.

## Non-goals (current)

- Final scheduler implementation
- Final no-code flow builder
