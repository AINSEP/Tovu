/**
 * @file The self-hosted host ports for a site update: the running image tag comes from the environment, the
 * target tag is only RECORDED, and restarting onto it is the operator's job (or an injected orchestrator's).
 * Nothing here runs unless `site_update_apply` was approved on the owner's card.
 */
import type { SiteDataRestorePort } from "@jini-ai/devops/deploy";
import type { SiteUpdateHost } from "./host-runtime.js";

export interface SelfHostedHostRequired {
  /** The image tag this process was started on (`TOVU_IMAGE_TAG`). */
  runningTag: string;
  /** Records the tag the site should run next, where the operator's deploy tooling reads it. */
  recordTargetTag: (required: { tag: string }) => Promise<void>;
  /** The site's own health answer, read live (never cached): its `version` is what verification compares. */
  readHealth: () => Promise<{ ok: boolean; version?: string | undefined }>;
}

export interface SelfHostedHostOptional {
  /** Restarts the site on `tag` and resolves once it is up. Absent: the operator restarts it. */
  restart?: ((required: { tag: string }) => Promise<void>) | undefined;
  data?: SiteDataRestorePort | undefined;
  imageTagPrefix?: string | undefined;
}

/**
 * @returns A self-hosted `SiteUpdateHost`. Without `restart`, the apply step stops after recording the target tag
 *   and says so, so the update fails closed (and the record is put back) rather than claiming a restart happened.
 * @complexity O(1) per port call.
 */
export function createSelfHostedUpdateHost({ runningTag, recordTargetTag, readHealth }: SelfHostedHostRequired, { restart, data, imageTagPrefix }: SelfHostedHostOptional = {}): SiteUpdateHost {
  return {
    kind: "self-hosted", data, imageTagPrefix,
    images: {
      currentTag: async () => runningTag,
      setTag: recordTargetTag,
      redeploy: async ({ tag }) => {
        if (!restart) throw new Error(`The site cannot restart itself. The new image tag ${tag} is recorded: restart the site on it, then ask for the update again.`);
        await restart({ tag });
      },
    },
    health: {
      check: async ({ expectedVersion }) => {
        const health = await readHealth();
        if (!health.ok) return { status: "unhealthy", reason: "The site's health check is not passing." };
        return health.version === expectedVersion ? { status: "healthy" } : { status: "unhealthy", reason: `The site reports ${health.version ?? "no version"}, not ${expectedVersion}.` };
      },
    },
  };
}
