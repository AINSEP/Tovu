import type { MembersProps } from "@jini-ai/user-management/react";
import { ServerLabel } from "@/components/status-labels";
import { useWiredMembers } from "./hooks/members-controller.hooks";
import { defaultMembersPort } from "./hooks/members-dependencies.hooks";

/**
 * The host collaborators the render site hands to the shared Members screen: the wired hook (live
 * port, locale, agent refresh), the host's `ServerLabel`, and the product copy. `translate` is
 * required by Jini's props but only feeds its default `useMembers`, which `useMembersHook`
 * replaces; `String` is the identity on a string key, so no never-called arrow is defined here.
 */
export const membersScreenProps: MembersProps = {
  port: defaultMembersPort,
  translate: String,
  useMembersHook: useWiredMembers,
  description: "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.",
  emptyDescription: "Registered site visitors will show up here.",
  renderServerLabel: ({ value }) => <ServerLabel value={value} />,
};
