import { agentHandle } from "@jini-ai/agentic";

import {
  usePublishSectionButton,
  type PublishSectionEntityType,
} from "./hooks/use-publish-section-button.hooks";

/**
 * @file `plan-publish-sections-2026-09-25.md` §2 S3 — markup only, matching the Dashboard's own
 * "Publish all content" `.btn-secondary` (`Dashboard.tsx`), one level down: `.btn-secondary`, not
 * `.btn-primary`, because every list page this sits on already has its own primary create action
 * (New Page, New Post, Add New, etc. — plan §1's judgment call). All state and the `requestPublish`
 * call live in `use-publish-section-button.hooks.ts`.
 */
export interface PublishSectionButtonProps {
  /** Which publishable section this button opens the dialog scoped to. */
  entityType: PublishSectionEntityType;
}

export function PublishSectionButton({ entityType }: PublishSectionButtonProps) {
  const { label, onClick } = usePublishSectionButton(entityType);
  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={onClick}
      {...agentHandle(`publish-section-${entityType}`, {
        role: "button",
        label: `Publish ${entityType} to the live site`,
      })}
    >
      {label}
    </button>
  );
}
