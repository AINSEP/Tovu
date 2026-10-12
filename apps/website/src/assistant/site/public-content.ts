import type { PostRecord, PostRepoPort } from "../../features/post/index.js";
import type { MemberAccessResolver, MemberContentAccess, MemberContext } from "../../features/members/index.js";

/**
 * Structural signature matching features/post's real listPublishedPosts. Injecting the function
 * instead of value-importing it avoids the assistant/post cycle: post/tool-registrations registers
 * into assistant, so assistant/site must retain only erased post type imports. Both tools and the
 * directive resolver consume this contract; production wiring still passes the real owner.
 */
export type ListPublishedPosts = (
  required: { deps: { repo: PostRepoPort }; input: { workspaceId: string } },
) => Promise<{ posts: PostRecord[] }>;

export interface AnonymousPublishedPostDeps {
  readonly postRepo: PostRepoPort;
  readonly workspaceId: string;
  /** The real publish owner, wired at server/runtime/composition/modules/site-assistant.ts.
   * This is the same live-state filter public pages call: never a status-only local copy.
   * Tests can inject the real function because test imports are outside the module-cycle graph. */
  readonly listPublishedPosts: ListPublishedPosts;
  /** Both operations belong to members. No visibility policy is reimplemented by assistant tools. */
  readonly memberAccess: {
    readonly resolvePostMemberAccess: (raw: string | null | undefined) => MemberContentAccess;
    readonly decide: MemberAccessResolver["decide"];
  };
}

/** Never resolve request cookies: the public assistant has only anonymous privileges. */
const ANONYMOUS_CONTEXT: MemberContext = { isAuthenticated: false, activeTierIds: [], isPaid: false };

/**
 * The shared read chokepoint for all visitor tools and direct target resolution. Publish state
 * belongs to post; member visibility belongs to members. Missing access is legacy public content,
 * while unknown visibility or malformed stored shapes deny, including JSON null that cannot be
 * evaluated by the members resolver. Repo failures propagate instead of masquerading as no posts.
 * @complexity O(n) local decisions after one workspace list; anonymous checks do no entitlement I/O.
 */
export async function readAnonymousPublishedPosts(
  { deps }: { deps: AnonymousPublishedPostDeps },
  _options = {},
): Promise<PostRecord[]> {
  const { posts } = await deps.listPublishedPosts({
    deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId },
  });
  return posts.filter(post => {
    const raw = post.memberAccessJson;
    if (raw != null && typeof raw !== "string") return false;
    try {
      return deps.memberAccess.decide({
        access: deps.memberAccess.resolvePostMemberAccess(raw),
        context: ANONYMOUS_CONTEXT,
      }).allowed === true;
    } catch {
      // Stored JSON can parse successfully to null or a scalar. An unevaluable gate never grants.
      return false;
    }
  });
}
