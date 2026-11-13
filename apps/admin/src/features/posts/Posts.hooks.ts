import { t as translateForPosts } from "./posts-i18n";

/** Bind this screen's copy to the current locale. */
export function createPostsTranslator({ locale }: { locale: string }, _options = {}) {
  return (key: string): string => translateForPosts({ locale, key });
}
