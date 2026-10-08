import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** content-read registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  // The collapsed cards dispatch the original, independently classified read handlers.
  "content_read.backup_restore_point": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.collection_content_type": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.collection_entry": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.comment_moderation_queue": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.content_post": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.custom_credential": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.database_pending_migration": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.database_restore_point": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.external_mcp": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.form_definition": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.identity_policy": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.identity_role": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.identity_user": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.media_asset": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.member": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.menu": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.newsletter_campaign": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.newsletter_list": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.plugin": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.post": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.redirect": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.seo_entry_meta": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.setting_definition": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.taxonomy": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.theme": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.webhook_subscription": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.widget_instance": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.widget_region": {
    approval: { class: 'read', confirmation: 'direct' },
  },
  "content_read.workspace": {
    approval: { class: 'read', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
