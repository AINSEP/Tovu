/**
 * @file Spanish dictionary for the Comments feature. Covers `rules.ts`'s moderation-queue
 * row-menu labels (`commentRowMenuItems`: Approve/Spam/Trash/Restore/Purge) as well as the
 * hook-level notice/error strings from `use-comment-queue.hooks.ts` and
 * `use-comment-settings.hooks.ts` (`describeApiError` fallbacks, `setNotice` copy) — those never
 * got translated during the JSX-only pass since they live in `.hooks.ts` files, not component
 * markup. `Comments.tsx`'s own markup was not part of the earlier admin i18n pass and stays
 * English for now (see `redirects-i18n.tsx`/`integrations-i18n.tsx`/`recovery-i18n.tsx`'s matching
 * "rules.ts labels not translated" notes, now being closed feature-by-feature).
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const COMMENTS_DICT: Record<string, Record<string, string>> = {
  es: {
    Approve: "Aprobar",
    // Kept as "Spam" in Spanish too, deliberately — the loanword is what Spanish-language
    // moderation UIs use for this exact one-word label (e.g. Gmail's own Spanish interface), not an
    // untranslated leftover.
    Spam: "Spam",
    // "Trash" itself now falls through to the shared `COMMON_I18N` entry (same value as
    // `lib/admin-nav-i18n.ts`'s "Trash" nav entry, `widgets-i18n.ts`'s Trash tab).
    Restore: "Restaurar",
    // Reuses the phrase already established for the same underlying action under a different
    // English source string (`media-i18n.ts`/`widgets-i18n.ts`'s "Delete permanently") rather than
    // inventing a literal "Purgar".
    Purge: "Eliminar permanentemente",

    // use-comment-queue.hooks.ts / use-comment-settings.hooks.ts (hook-level notice/error strings)
    "failed to load the moderation queue": "no se pudo cargar la cola de moderación",
    "Failed to purge comment.": "No se pudo purgar el comentario.",
    "failed to load Comments settings": "no se pudo cargar la configuración de comentarios",
    "failed to save Comments settings": "no se pudo guardar la configuración de comentarios",
  },
  id: {
    Approve: "Setujui",
    Spam: "Spam",
    Restore: "Pulihkan",
    Purge: "Hapus permanen",
    "failed to load the moderation queue": "gagal memuat antrean moderasi",
    "Failed to purge comment.": "Gagal menghapus komentar secara permanen.",
    "failed to load Comments settings": "gagal memuat pengaturan Komentar",
    "failed to save Comments settings": "gagal menyimpan pengaturan Komentar",
  },
  de: {
    Approve: "Genehmigen",
    Spam: "Spam",
    Restore: "Wiederherstellen",
    Purge: "Endgültig löschen",
    "failed to load the moderation queue": "Moderationswarteschlange konnte nicht geladen werden",
    "Failed to purge comment.": "Kommentar konnte nicht endgültig gelöscht werden.",
    "failed to load Comments settings": "Kommentareinstellungen konnten nicht geladen werden",
    "failed to save Comments settings": "Kommentareinstellungen konnten nicht gespeichert werden",
  },
  "zh-CN": {
    Approve: "批准",
    // Native term, not the "Spam" loanword — WordPress and most mainland Chinese moderation UIs
    // render this as 垃圾评论 ("junk comment"), not the bare English word.
    Spam: "垃圾评论",
    Restore: "恢复",
    Purge: "永久删除",
    "failed to load the moderation queue": "无法加载审核队列",
    "Failed to purge comment.": "无法永久删除评论。",
    "failed to load Comments settings": "无法加载评论设置",
    "failed to save Comments settings": "无法保存评论设置",
  },
  "zh-TW": {
    Approve: "核准",
    // Same reasoning as zh-CN — Taiwan's own moderation-UI convention is 垃圾留言, not "Spam".
    Spam: "垃圾留言",
    Restore: "還原",
    Purge: "永久刪除",
    "failed to load the moderation queue": "無法載入審核佇列",
    "Failed to purge comment.": "無法永久刪除留言。",
    "failed to load Comments settings": "無法載入留言設定",
    "failed to save Comments settings": "無法儲存留言設定",
  },
  "pt-BR": {
    Approve: "Aprovar",
    Spam: "Spam",
    Restore: "Restaurar",
    Purge: "Excluir permanentemente",
    "failed to load the moderation queue": "falha ao carregar a fila de moderação",
    "Failed to purge comment.": "Falha ao excluir permanentemente o comentário.",
    "failed to load Comments settings": "falha ao carregar as configurações de Comentários",
    "failed to save Comments settings": "falha ao salvar as configurações de Comentários",
  },
  ru: {
    Approve: "Одобрить",
    // Transliterated into Cyrillic ("Спам") rather than left in Latin script — that is how Russian
    // moderation UIs (Gmail included) render this word; the bare Latin "Spam" would read as a typo.
    Spam: "Спам",
    Restore: "Восстановить",
    Purge: "Удалить навсегда",
    "failed to load the moderation queue": "не удалось загрузить очередь модерации",
    "Failed to purge comment.": "Не удалось удалить комментарий навсегда.",
    "failed to load Comments settings": "не удалось загрузить настройки комментариев",
    "failed to save Comments settings": "не удалось сохранить настройки комментариев",
  },
  fa: {
    Approve: "تأیید",
    // Native term — Persian moderation UIs (Gmail Persian included) use هرزنامه, not a transliterated
    // loanword.
    Spam: "هرزنامه",
    Restore: "بازیابی",
    Purge: "حذف دائمی",
    "failed to load the moderation queue": "بارگذاری صف نظارت ناموفق بود",
    "Failed to purge comment.": "حذف دائمی نظر ناموفق بود.",
    "failed to load Comments settings": "بارگذاری تنظیمات نظرات ناموفق بود",
    "failed to save Comments settings": "ذخیره تنظیمات نظرات ناموفق بود",
  },
  ar: {
    Approve: "موافقة",
    // Short native adjective rather than the multi-word "بريد إلكتروني مزعج" — reads naturally as a
    // one-word row-menu label alongside Approve/Trash/Restore/Purge.
    Spam: "مزعج",
    Restore: "استعادة",
    Purge: "حذف نهائي",
    "failed to load the moderation queue": "تعذّر تحميل قائمة انتظار المراجعة",
    "Failed to purge comment.": "تعذّر حذف التعليق نهائيًا.",
    "failed to load Comments settings": "تعذّر تحميل إعدادات التعليقات",
    "failed to save Comments settings": "تعذّر حفظ إعدادات التعليقات",
  },
  ja: {
    Approve: "承認",
    // "迷惑コメント" (nuisance comment) — the term Japanese CMSes use for comment-spam specifically,
    // distinct from 迷惑メール (email spam).
    Spam: "迷惑コメント",
    Restore: "復元",
    Purge: "完全に削除",
    "failed to load the moderation queue": "モデレーションキューを読み込めませんでした",
    "Failed to purge comment.": "コメントを完全に削除できませんでした。",
    "failed to load Comments settings": "コメント設定を読み込めませんでした",
    "failed to save Comments settings": "コメント設定を保存できませんでした",
  },
  ko: {
    Approve: "승인",
    Spam: "스팸",
    Restore: "복원",
    Purge: "영구 삭제",
    "failed to load the moderation queue": "검토 대기열을 불러오지 못했습니다",
    "Failed to purge comment.": "댓글을 완전히 삭제하지 못했습니다.",
    "failed to load Comments settings": "댓글 설정을 불러오지 못했습니다",
    "failed to save Comments settings": "댓글 설정을 저장하지 못했습니다",
  },
  pl: {
    Approve: "Zatwierdź",
    Spam: "Spam",
    Restore: "Przywróć",
    Purge: "Usuń trwale",
    "failed to load the moderation queue": "nie udało się wczytać kolejki moderacji",
    "Failed to purge comment.": "Nie udało się trwale usunąć komentarza.",
    "failed to load Comments settings": "nie udało się wczytać ustawień komentarzy",
    "failed to save Comments settings": "nie udało się zapisać ustawień komentarzy",
  },
  hu: {
    Approve: "Jóváhagyás",
    Spam: "Spam",
    Restore: "Visszaállítás",
    Purge: "Végleges törlés",
    "failed to load the moderation queue": "a moderálási várólista betöltése sikertelen",
    "Failed to purge comment.": "A hozzászólás végleges törlése sikertelen.",
    "failed to load Comments settings": "a Hozzászólások beállításainak betöltése sikertelen",
    "failed to save Comments settings": "a Hozzászólások beállításainak mentése sikertelen",
  },
  fr: {
    Approve: "Approuver",
    Spam: "Spam",
    Restore: "Restaurer",
    Purge: "Supprimer définitivement",
    "failed to load the moderation queue": "échec du chargement de la file de modération",
    "Failed to purge comment.": "Échec de la suppression définitive du commentaire.",
    "failed to load Comments settings": "échec du chargement des paramètres des commentaires",
    "failed to save Comments settings": "échec de l'enregistrement des paramètres des commentaires",
  },
  uk: {
    Approve: "Схвалити",
    // Transliterated into Cyrillic ("Спам"), same reasoning as ru.
    Spam: "Спам",
    Restore: "Відновити",
    Purge: "Видалити назавжди",
    "failed to load the moderation queue": "не вдалося завантажити чергу модерації",
    "Failed to purge comment.": "Не вдалося видалити коментар назавжди.",
    "failed to load Comments settings": "не вдалося завантажити налаштування коментарів",
    "failed to save Comments settings": "не вдалося зберегти налаштування коментарів",
  },
  tr: {
    Approve: "Onayla",
    Spam: "Spam",
    Restore: "Geri yükle",
    Purge: "Kalıcı olarak sil",
    "failed to load the moderation queue": "moderasyon kuyruğu yüklenemedi",
    "Failed to purge comment.": "Yorum kalıcı olarak silinemedi.",
    "failed to load Comments settings": "Yorumlar ayarları yüklenemedi",
    "failed to save Comments settings": "Yorumlar ayarları kaydedilemedi",
  },
  th: {
    Approve: "อนุมัติ",
    // Native term — Gmail's own Thai interface renders its Spam folder as สแปม (transliterated),
    // not the bare Latin word.
    Spam: "สแปม",
    Restore: "กู้คืน",
    Purge: "ลบอย่างถาวร",
    "failed to load the moderation queue": "โหลดคิวการตรวจสอบไม่สำเร็จ",
    "Failed to purge comment.": "ลบความคิดเห็นอย่างถาวรไม่สำเร็จ",
    "failed to load Comments settings": "โหลดการตั้งค่าความคิดเห็นไม่สำเร็จ",
    "failed to save Comments settings": "บันทึกการตั้งค่าความคิดเห็นไม่สำเร็จ",
  },
  it: {
    Approve: "Approva",
    Spam: "Spam",
    Restore: "Ripristina",
    Purge: "Elimina definitivamente",
    "failed to load the moderation queue": "impossibile caricare la coda di moderazione",
    "Failed to purge comment.": "Impossibile eliminare definitivamente il commento.",
    "failed to load Comments settings": "impossibile caricare le impostazioni dei Commenti",
    "failed to save Comments settings": "impossibile salvare le impostazioni dei Commenti",
  },
};

export const t = createDictionaryTranslator(COMMENTS_DICT);
