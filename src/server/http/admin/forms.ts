import type { Response } from "express";

import {
  FormDefinitionNotFoundError,
  FormFieldValidationError,
  FormSlugConflictError,
  FormSubmissionNotFoundError,
} from "#src/forms/errors";
import type { FormDefinitionRecord, FormSubmissionRecord } from "#src/forms/types";
import { ForbiddenError as CommandForbiddenError } from "@jini-ai/cms/core";

/**
 * @file Response DTOs for the admin `forms` HTTP surface (SPEC-010 api.spec.md §5).
 *
 * Purpose:
 * Serializes `forms` library read models into the exact `{ data: ... }` envelopes api.spec.md §5
 * defines (Forms' contract shape, unlike `menus`/`integrations`' `{ menu: ... }`-style envelopes —
 * Article VII: the spec is ground truth here, not this codebase's older per-section convention).
 */

export interface AdminFormFieldDto {
  id: string;
  label: string;
  type: string;
  required: boolean;
  maxLength?: number | null;
  className?: string;
  attributes?: Record<string, string>;
}

export interface AdminFormNotifyDto {
  enabled: boolean;
  recipients: string[];
}

export interface AdminFormDefinitionDto {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  fields: AdminFormFieldDto[];
  notify: AdminFormNotifyDto;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminFormSubmissionDto {
  id: string;
  formDefinitionId: string;
  workspaceId: string;
  data: Record<string, string | boolean>;
  sourceIp: string;
  submittedAt: string;
}

export function toAdminFormDefinitionDto(definition: FormDefinitionRecord): AdminFormDefinitionDto {
  return {
    id: definition.id,
    workspaceId: definition.workspaceId,
    name: definition.name,
    slug: definition.slug,
    fields: definition.fields.map((f) => ({ ...f })),
    notify: { enabled: definition.notify.enabled, recipients: [...definition.notify.recipients] },
    status: definition.status,
    createdAt: definition.createdAt,
    updatedAt: definition.updatedAt,
  };
}

export function toAdminFormDefinitionResponse(definition: FormDefinitionRecord): { data: AdminFormDefinitionDto } {
  return { data: toAdminFormDefinitionDto(definition) };
}

export function toAdminFormDefinitionListResponse(
  definitions: FormDefinitionRecord[]
): { data: AdminFormDefinitionDto[] } {
  return { data: definitions.map(toAdminFormDefinitionDto) };
}

export function toAdminFormSubmissionDto(submission: FormSubmissionRecord): AdminFormSubmissionDto {
  return {
    id: submission.id,
    formDefinitionId: submission.formDefinitionId,
    workspaceId: submission.workspaceId,
    data: { ...submission.data },
    sourceIp: submission.sourceIp,
    submittedAt: submission.submittedAt,
  };
}

export function toAdminFormSubmissionResponse(submission: FormSubmissionRecord): { data: AdminFormSubmissionDto } {
  return { data: toAdminFormSubmissionDto(submission) };
}

export function toAdminFormSubmissionListResponse(page: {
  items: FormSubmissionRecord[];
  nextCursor: string | null;
}): { data: AdminFormSubmissionDto[]; nextCursor: string | null } {
  return { data: page.items.map(toAdminFormSubmissionDto), nextCursor: page.nextCursor };
}

/**
 * Shared error -> HTTP mapping for every admin `forms` route (errors.spec.md §2/§6). Returns
 * `true` once it has written a response (caller should stop); `false` for an unrecognized error
 * (caller falls through to its own generic 500).
 */
export function mapFormsWriteError(err: unknown, res: Response): boolean {
  if (err instanceof CommandForbiddenError) {
    res.status(403).json({
      error: err.message,
      code: "FORBIDDEN",
      details: { permission: err.permission, reason: err.reason },
    });
    return true;
  }
  if (err instanceof FormFieldValidationError) {
    res.status(400).json({
      error: err.message,
      code: "FORMS_FIELD_VALIDATION_ERROR",
      details: { fieldErrors: err.fieldErrors },
    });
    return true;
  }
  if (err instanceof FormSlugConflictError) {
    res.status(409).json({ error: err.message, code: "FORMS_SLUG_CONFLICT", details: { slug: err.slug } });
    return true;
  }
  if (err instanceof FormDefinitionNotFoundError) {
    res.status(404).json({ error: err.message, code: "FORMS_DEFINITION_NOT_FOUND" });
    return true;
  }
  if (err instanceof FormSubmissionNotFoundError) {
    res.status(404).json({ error: err.message, code: "FORMS_SUBMISSION_NOT_FOUND" });
    return true;
  }
  return false;
}
