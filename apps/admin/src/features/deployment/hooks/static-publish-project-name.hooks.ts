import { useState } from "react";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";

import type { AdminPublishDestination, AdminStaticPublishTargetId } from "@/features/deployment/api/deployment-api.types";
import type { StaticPublishPort } from "./static-publish-port.hooks";

/**
 * @file The Static Site tab's project-name field: what it shows before the owner has typed, and
 * what wins once they have. Split out of `use-static-publish.hooks.ts` so that hook's own size
 * ratchet (`development/scripts/size-debt.json`) does not grow for this rule.
 *
 * ## Why it is derived rather than copied into state once
 *
 * The field used to be `useState("")` and was never filled in, so an owner who had already published
 * as `acme` retyped `acme` on every visit although the server's publish history already held it
 * (A340). The value shown is `typed ?? lastPublishedFor(target)`: it is computed, never written back
 * into the owner's state, so a slow history response, a refetch, or a host switch can never replace
 * something the owner typed, including a field they deliberately cleared (`""` is typed, `null` is
 * not). Only the owner's own keystroke ever moves the field off the history value.
 *
 * Reading the history is a convenience, so a failed read is deliberately not surfaced: the field
 * just starts blank, as it did before, and the owner types the name.
 */
export interface StaticPublishProjectName {
  /** The owner's own text when they have typed, else the last successful static publish to the
   *  selected host's project name, else `""`. */
  projectName: string;
  setProjectName: (value: string) => void;
}

export function useStaticPublishProjectName(
  { port, target }: { port: StaticPublishPort; target: AdminStaticPublishTargetId },
  _options = {}
): StaticPublishProjectName {
  const destinationsQuery = useFetchQuery({ key: ["deployment", "publish-destinations"], fetch: () => port.listPublishDestinations() });
  const [typed, setTyped] = useState<string | null>(null);
  return {
    projectName: typed ?? lastPublishedProjectName({ destinations: destinationsQuery.data, target }),
    setProjectName: setTyped,
  };
}

/** The project name the newest static publish to `target` used, `""` when there is none. The server
 *  lists destinations newest first (see `AdminPublishDestination`), so the first match is the last
 *  publish; a peer push or deploy row names no project and a different host's name would mean
 *  something else here (a Vercel project is not a GitHub commit message). @complexity O(d). */
function lastPublishedProjectName(input: {
  destinations: readonly AdminPublishDestination[] | undefined;
  target: AdminStaticPublishTargetId;
}): string {
  for (const destination of input.destinations ?? []) {
    if (destination.kind === "static" && destination.target === input.target) return destination.projectName;
  }
  return "";
}
