import { agentHandle } from "@jini-ai/core/agent-handles";

import { type PublishSectionId } from "@tovu/publish-content-ui";

import { usePublishSectionButton } from "./hooks/use-publish-section-button.hooks";

import { PublishSectionButton as JiniPublishSectionButton, type PublishSectionButtonProps as JiniPublishSectionButtonProps } from "@jini-ai/cms/react/publish-content/PublishSectionButton";

function useHostPublishSectionButton({ section }: { section: PublishSectionId }, _optional = {}) {
  return usePublishSectionButton(section);
}

export interface PublishSectionButtonProps {
  /** Which publishable section (`PUBLISH_SECTIONS`) this button opens the dialog scoped to. */
  section: PublishSectionId;
  /** Button variant class; `.btn-secondary` unless the host screen says otherwise (Themes uses
   *  `.btn-primary`, owner 2026-10-11). */
  className?: string;
  usePublishSectionButtonHook?: JiniPublishSectionButtonProps<PublishSectionId>["usePublishSectionButtonHook"];
}

export function PublishSectionButton({ section, className, usePublishSectionButtonHook = useHostPublishSectionButton }: PublishSectionButtonProps) {
  return (
    <JiniPublishSectionButton
      section={section}
      className={className}
      usePublishSectionButtonHook={usePublishSectionButtonHook}
      agentHandle={agentHandle}
      agentLabel={`Publish ${section} to the live site`}
    />
  );
}
