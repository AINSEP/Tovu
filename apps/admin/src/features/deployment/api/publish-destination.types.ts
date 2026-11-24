import type { AdminStaticPublishTargetId } from "@jini-ai/admin/deployment/api/deployment-api.types";

/** One place this site was published or deployed to before, as `GET .../system/publish/destinations`
 *  lists it (`static-publish/publish-history.ts`'s `PublishDestination`), newest first. Labels and
 *  target ids are the server's; no secret is ever in a row (`credentialId` names a saved connection). */
export type AdminPublishDestination =
  | {
      id: string;
      kind: "static";
      lastPublishedAt: string;
      label: string;
      url: string;
      target: AdminStaticPublishTargetId;
      projectName: string;
      credentialId?: string;
      configFields: Readonly<Record<string, string>>;
    }
  | { id: string; kind: "tovu-peer"; peerId: string; label: string; url: string; lastPublishedAt: string }
  | {
      id: string;
      kind: "deploy";
      /** `started` = the host accepted the deploy but nothing confirmed it landed. */
      status: "started" | "confirmed";
      statusMessage?: string;
      target: string;
      label: string;
      url: string;
      lastPublishedAt: string;
      /** The saved Tovu peer at this deploy's address, when there is one: content publishes there. */
      linkedPeerId?: string;
    };
