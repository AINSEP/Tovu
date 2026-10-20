import type { FormDeliveryJobStatus } from "@jini-ai/cms/forms";

/**
 * @file The read port `forms_delivery_status` uses to report durable form delivery. Declared here,
 * structurally, so the forms feature never imports the database layer; the site composition binds
 * `SqlFormDeliveryRepo`, whose status comes only from each delivery job's outbox row.
 */

/** One binding's delivery of one submission: status derived from its outbox job, nothing else. */
export type FormDeliveryStatusView = {
  readonly bindingId: string;
  readonly adapterId: string;
  readonly formId: string;
  readonly submissionId: string;
} & FormDeliveryJobStatus;

/** Read side of durable form delivery (`SqlFormDeliveryRepo`); both reads are scoped to `workspaceId`. */
export interface FormDeliveryStatusPort {
  forSubmission(required: { workspaceId: string; submissionId: string }, optional?: Record<string, never>): Promise<readonly FormDeliveryStatusView[]>;
  recentUnfinished(required: { workspaceId: string }, optional?: { limit?: number }): Promise<readonly FormDeliveryStatusView[]>;
}
