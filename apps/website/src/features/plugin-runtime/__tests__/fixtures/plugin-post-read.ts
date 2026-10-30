import { PostNotFoundError, type PostRepoPort } from "../../../post/index.js";
import type { PluginPostReadPort } from "../../service-ports.js";

/** Adapt the existing post fakes without replacing the post owner's not-found error. */
export function requiredPostReader({ repo }: { repo: Pick<PostRepoPort, "findById"> }, _optional = {}): PluginPostReadPort {
  return {
    async readRequired(input) {
      const post = await repo.findById(input);
      if (!post) throw new PostNotFoundError(`post '${input.id}' was not found`);
      return post;
    },
  };
}
