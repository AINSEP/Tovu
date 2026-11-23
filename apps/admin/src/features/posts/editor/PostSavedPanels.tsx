import type { AdminPost } from "@/features/posts/api/posts-api.types";
import { ContentAnalysisCard } from "@jini-ai/admin/screens/content-analysis/ContentAnalysisCard";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { contentAnalysisPort } from "@/integrations/jini-admin/content-analysis-ports";
import { TermPicker } from "../../taxonomy/TermPicker";

/* Content analysis (AW-7 Tier 2) — renders nothing unless the `content-analyzer` plugin is
    enabled. Gets the live `title`/`bodyJson` so "Analyze now" covers unsaved edits, and `post`
    so a save's freshly stored analysis replaces it. */
/* Categories & Tags — the same box the collection-entry editor mounts; it saves on its own
    button, separately from the post's Save/Publish. Both panels need a saved identity. */
export function PostSavedPanels({ post, title, bodyJson }: { post: AdminPost; title: string; bodyJson: unknown }) {
  return post.id ? (
    <>
      <ContentAnalysisCard post={post} title={title} bodyJson={bodyJson} port={contentAnalysisPort} useAdminLocale={useAdminLocale} />
      <TermPicker contentType={post.kind} contentId={post.id} />
    </>
  ) : null;
}
