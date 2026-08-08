import type { I18nAdapter } from "@jini-ai/chat/react";

/**
 * @file Spanish dictionary for the assistant dock's OWN chrome — `AssistantDock.tsx`'s pane
 * header/placeholder, plus the mobile-sheet chrome and `ChatFab`'s "assistant" label that live in
 * `App.tsx` around it (ADR-049's "never touch the dock's own mount lifecycle" is why that chrome
 * sits in `App.tsx` rather than inside `AssistantDock.tsx` — see that file's own comment). One
 * shared dictionary rather than two, since both describe the same one dock. Same
 * `DICT[locale]?.[key] ?? key` shape every other `*-i18n.ts` file in this app uses.
 */
export const ASSISTANT_DOCK_DICT: Record<string, Record<string, string>> = {
  es: {
    "Workspace chat": "Chat del espacio de trabajo",
    "Tovu assistant": "Asistente de Tovu",
    "Ask the assistant to do something…": "Pídele algo al asistente…",
    assistant: "asistente",
    "Collapse assistant panel": "Contraer el panel del asistente",
    "Expand assistant panel": "Expandir el panel del asistente",
    "Close assistant": "Cerrar asistente",
  },
  id: {
    "Workspace chat": "Obrolan ruang kerja",
    "Tovu assistant": "Asisten Tovu",
    "Ask the assistant to do something…": "Minta asisten melakukan sesuatu…",
    assistant: "asisten",
    "Collapse assistant panel": "Ciutkan panel asisten",
    "Expand assistant panel": "Perluas panel asisten",
    "Close assistant": "Tutup asisten",
  },
  de: {
    "Workspace chat": "Workspace-Chat",
    "Tovu assistant": "Tovu-Assistent",
    "Ask the assistant to do something…": "Bitte den Assistenten, etwas zu tun…",
    assistant: "Assistent",
    "Collapse assistant panel": "Assistenten-Panel einklappen",
    "Expand assistant panel": "Assistenten-Panel erweitern",
    "Close assistant": "Assistent schließen",
  },
  "zh-CN": {
    "Workspace chat": "工作区聊天",
    "Tovu assistant": "Tovu 助手",
    "Ask the assistant to do something…": "让助手帮你做点什么…",
    assistant: "助手",
    "Collapse assistant panel": "收起助手面板",
    "Expand assistant panel": "展开助手面板",
    "Close assistant": "关闭助手",
  },
  "zh-TW": {
    "Workspace chat": "工作區聊天",
    "Tovu assistant": "Tovu 助理",
    "Ask the assistant to do something…": "讓助理幫你做點什麼…",
    assistant: "助理",
    "Collapse assistant panel": "收合助理面板",
    "Expand assistant panel": "展開助理面板",
    "Close assistant": "關閉助理",
  },
  "pt-BR": {
    "Workspace chat": "Chat do espaço de trabalho",
    "Tovu assistant": "Assistente Tovu",
    "Ask the assistant to do something…": "Peça ao assistente para fazer algo…",
    assistant: "assistente",
    "Collapse assistant panel": "Recolher painel do assistente",
    "Expand assistant panel": "Expandir painel do assistente",
    "Close assistant": "Fechar assistente",
  },
  ru: {
    "Workspace chat": "Чат рабочего пространства",
    "Tovu assistant": "Ассистент Tovu",
    "Ask the assistant to do something…": "Попросите ассистента что-нибудь сделать…",
    assistant: "ассистент",
    "Collapse assistant panel": "Свернуть панель ассистента",
    "Expand assistant panel": "Развернуть панель ассистента",
    "Close assistant": "Закрыть ассистента",
  },
  fa: {
    "Workspace chat": "گفتگوی فضای کاری",
    "Tovu assistant": "دستیار Tovu",
    "Ask the assistant to do something…": "از دستیار بخواهید کاری انجام دهد…",
    assistant: "دستیار",
    "Collapse assistant panel": "جمع کردن پنل دستیار",
    "Expand assistant panel": "باز کردن پنل دستیار",
    "Close assistant": "بستن دستیار",
  },
  ar: {
    "Workspace chat": "محادثة مساحة العمل",
    "Tovu assistant": "مساعد Tovu",
    "Ask the assistant to do something…": "اطلب من المساعد القيام بشيء ما…",
    assistant: "المساعد",
    "Collapse assistant panel": "طي لوحة المساعد",
    "Expand assistant panel": "توسيع لوحة المساعد",
    "Close assistant": "إغلاق المساعد",
  },
  ja: {
    "Workspace chat": "ワークスペースチャット",
    "Tovu assistant": "Tovuアシスタント",
    "Ask the assistant to do something…": "アシスタントに何かを依頼する…",
    assistant: "アシスタント",
    "Collapse assistant panel": "アシスタントパネルを折りたたむ",
    "Expand assistant panel": "アシスタントパネルを展開する",
    "Close assistant": "アシスタントを閉じる",
  },
  ko: {
    "Workspace chat": "워크스페이스 채팅",
    "Tovu assistant": "Tovu 어시스턴트",
    "Ask the assistant to do something…": "어시스턴트에게 작업을 요청하세요…",
    assistant: "어시스턴트",
    "Collapse assistant panel": "어시스턴트 패널 접기",
    "Expand assistant panel": "어시스턴트 패널 펼치기",
    "Close assistant": "어시스턴트 닫기",
  },
  pl: {
    "Workspace chat": "Czat przestrzeni roboczej",
    "Tovu assistant": "Asystent Tovu",
    "Ask the assistant to do something…": "Poproś asystenta o wykonanie czegoś…",
    assistant: "asystent",
    "Collapse assistant panel": "Zwiń panel asystenta",
    "Expand assistant panel": "Rozwiń panel asystenta",
    "Close assistant": "Zamknij asystenta",
  },
  hu: {
    "Workspace chat": "Munkaterület-csevegés",
    "Tovu assistant": "Tovu asszisztens",
    "Ask the assistant to do something…": "Kérj valamit az asszisztenstől…",
    assistant: "asszisztens",
    "Collapse assistant panel": "Asszisztens panel összecsukása",
    "Expand assistant panel": "Asszisztens panel kibontása",
    "Close assistant": "Asszisztens bezárása",
  },
  fr: {
    "Workspace chat": "Chat de l'espace de travail",
    "Tovu assistant": "Assistant Tovu",
    "Ask the assistant to do something…": "Demandez à l'assistant de faire quelque chose…",
    assistant: "assistant",
    "Collapse assistant panel": "Réduire le panneau de l'assistant",
    "Expand assistant panel": "Développer le panneau de l'assistant",
    "Close assistant": "Fermer l'assistant",
  },
  uk: {
    "Workspace chat": "Чат робочого простору",
    "Tovu assistant": "Асистент Tovu",
    "Ask the assistant to do something…": "Попросіть асистента щось зробити…",
    assistant: "асистент",
    "Collapse assistant panel": "Згорнути панель асистента",
    "Expand assistant panel": "Розгорнути панель асистента",
    "Close assistant": "Закрити асистента",
  },
  tr: {
    "Workspace chat": "Çalışma alanı sohbeti",
    "Tovu assistant": "Tovu Asistanı",
    "Ask the assistant to do something…": "Asistandan bir şey yapmasını isteyin…",
    assistant: "asistan",
    "Collapse assistant panel": "Asistan panelini daralt",
    "Expand assistant panel": "Asistan panelini genişlet",
    "Close assistant": "Asistanı kapat",
  },
  th: {
    "Workspace chat": "แชทพื้นที่ทำงาน",
    "Tovu assistant": "ผู้ช่วย Tovu",
    "Ask the assistant to do something…": "ขอให้ผู้ช่วยทำบางอย่าง…",
    assistant: "ผู้ช่วย",
    "Collapse assistant panel": "ย่อแผงผู้ช่วย",
    "Expand assistant panel": "ขยายแผงผู้ช่วย",
    "Close assistant": "ปิดผู้ช่วย",
  },
  it: {
    "Workspace chat": "Chat dell'area di lavoro",
    "Tovu assistant": "Assistente Tovu",
    "Ask the assistant to do something…": "Chiedi all'assistente di fare qualcosa…",
    assistant: "assistente",
    "Collapse assistant panel": "Comprimi il pannello dell'assistente",
    "Expand assistant panel": "Espandi il pannello dell'assistente",
    "Close assistant": "Chiudi assistente",
  },
};

/**
 * @file Spanish dictionary backing `@jini-ai/chat/react`'s OWN `I18nAdapter` contract
 * (`JiniChatProvider`'s `i18n` prop — see `slots.ts`'s own doc: "the English string itself is the
 * key"). Scoped to exactly the strings `ConversationList` renders, since that is the one
 * always-visible piece of chat-package chrome the dock's own header mounts
 * (`AssistantDock.tsx`'s `header` — the conversation switcher). The rest of the chat package's
 * ~260 translation keys (composer, attachment tray, tool-call cards, runtime picker, …) have no
 * Spanish dictionary anywhere upstream yet — that is a much larger, separate undertaking, not
 * attempted here; see this dispatch's own report for the full account. `createChatI18nAdapter`'s
 * fallback (`key` itself) leaves every one of those untouched exactly as it already renders today.
 */
const CHAT_PANE_I18N_DICT: Record<string, Record<string, string>> = {
  es: {
    Conversations: "Conversaciones",
    New: "Nueva",
    "Search conversations": "Buscar conversaciones",
    "No conversations yet": "Aún no hay conversaciones",
    "No conversations match": "Ninguna conversación coincide",
    "Double-click to rename": "Doble clic para cambiar el nombre",
    "Delete conversation": "Eliminar conversación",
    Untitled: "Sin título",
    'Delete "{title}"? This cannot be undone.': '¿Eliminar "{title}"? Esta acción no se puede deshacer.',
  },
  id: {
    Conversations: "Percakapan",
    New: "Baru",
    "Search conversations": "Cari percakapan",
    "No conversations yet": "Belum ada percakapan",
    "No conversations match": "Tidak ada percakapan yang cocok",
    "Double-click to rename": "Klik dua kali untuk mengganti nama",
    "Delete conversation": "Hapus percakapan",
    Untitled: "Tanpa judul",
    'Delete "{title}"? This cannot be undone.': 'Hapus "{title}"? Tindakan ini tidak dapat dibatalkan.',
  },
  de: {
    Conversations: "Unterhaltungen",
    New: "Neu",
    "Search conversations": "Unterhaltungen durchsuchen",
    "No conversations yet": "Noch keine Unterhaltungen",
    "No conversations match": "Keine passenden Unterhaltungen",
    "Double-click to rename": "Doppelklicken zum Umbenennen",
    "Delete conversation": "Unterhaltung löschen",
    Untitled: "Unbenannt",
    'Delete "{title}"? This cannot be undone.': '„{title}“ löschen? Dies kann nicht rückgängig gemacht werden.',
  },
  "zh-CN": {
    Conversations: "对话",
    New: "新建",
    "Search conversations": "搜索对话",
    "No conversations yet": "暂无对话",
    "No conversations match": "没有匹配的对话",
    "Double-click to rename": "双击以重命名",
    "Delete conversation": "删除对话",
    Untitled: "无标题",
    'Delete "{title}"? This cannot be undone.': '删除“{title}”？此操作无法撤销。',
  },
  "zh-TW": {
    Conversations: "對話",
    New: "新增",
    "Search conversations": "搜尋對話",
    "No conversations yet": "尚無對話",
    "No conversations match": "沒有符合的對話",
    "Double-click to rename": "按兩下以重新命名",
    "Delete conversation": "刪除對話",
    Untitled: "無標題",
    'Delete "{title}"? This cannot be undone.': '刪除「{title}」？此操作無法復原。',
  },
  "pt-BR": {
    Conversations: "Conversas",
    New: "Nova",
    "Search conversations": "Buscar conversas",
    "No conversations yet": "Ainda não há conversas",
    "No conversations match": "Nenhuma conversa corresponde",
    "Double-click to rename": "Clique duas vezes para renomear",
    "Delete conversation": "Excluir conversa",
    Untitled: "Sem título",
    'Delete "{title}"? This cannot be undone.': 'Excluir "{title}"? Isso não pode ser desfeito.',
  },
  ru: {
    Conversations: "Беседы",
    New: "Новая",
    "Search conversations": "Поиск бесед",
    "No conversations yet": "Пока нет бесед",
    "No conversations match": "Нет подходящих бесед",
    "Double-click to rename": "Дважды щёлкните, чтобы переименовать",
    "Delete conversation": "Удалить беседу",
    Untitled: "Без названия",
    'Delete "{title}"? This cannot be undone.': 'Удалить «{title}»? Это действие нельзя отменить.',
  },
  fa: {
    Conversations: "گفتگوها",
    New: "جدید",
    "Search conversations": "جستجوی گفتگوها",
    "No conversations yet": "هنوز گفتگویی وجود ندارد",
    "No conversations match": "هیچ گفتگویی مطابقت ندارد",
    "Double-click to rename": "برای تغییر نام دوبار کلیک کنید",
    "Delete conversation": "حذف گفتگو",
    Untitled: "بدون عنوان",
    'Delete "{title}"? This cannot be undone.': '«{title}» حذف شود؟ این کار قابل بازگشت نیست.',
  },
  ar: {
    Conversations: "المحادثات",
    New: "جديد",
    "Search conversations": "البحث في المحادثات",
    "No conversations yet": "لا توجد محادثات بعد",
    "No conversations match": "لا توجد محادثات مطابقة",
    "Double-click to rename": "انقر نقرًا مزدوجًا لإعادة التسمية",
    "Delete conversation": "حذف المحادثة",
    Untitled: "بلا عنوان",
    'Delete "{title}"? This cannot be undone.': 'هل تريد حذف "{title}"؟ لا يمكن التراجع عن هذا الإجراء.',
  },
  ja: {
    Conversations: "会話",
    New: "新規",
    "Search conversations": "会話を検索",
    "No conversations yet": "まだ会話はありません",
    "No conversations match": "一致する会話がありません",
    "Double-click to rename": "ダブルクリックで名前を変更",
    "Delete conversation": "会話を削除",
    Untitled: "無題",
    'Delete "{title}"? This cannot be undone.': '「{title}」を削除しますか？ この操作は元に戻せません。',
  },
  ko: {
    Conversations: "대화",
    New: "새로 만들기",
    "Search conversations": "대화 검색",
    "No conversations yet": "아직 대화가 없습니다",
    "No conversations match": "일치하는 대화가 없습니다",
    "Double-click to rename": "더블클릭하여 이름 바꾸기",
    "Delete conversation": "대화 삭제",
    Untitled: "제목 없음",
    'Delete "{title}"? This cannot be undone.': '"{title}"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
  },
  pl: {
    Conversations: "Rozmowy",
    New: "Nowa",
    "Search conversations": "Szukaj rozmów",
    "No conversations yet": "Brak rozmów",
    "No conversations match": "Brak pasujących rozmów",
    "Double-click to rename": "Kliknij dwukrotnie, aby zmienić nazwę",
    "Delete conversation": "Usuń rozmowę",
    Untitled: "Bez tytułu",
    'Delete "{title}"? This cannot be undone.': 'Usunąć „{title}”? Tej operacji nie można cofnąć.',
  },
  hu: {
    Conversations: "Beszélgetések",
    New: "Új",
    "Search conversations": "Beszélgetések keresése",
    "No conversations yet": "Még nincs beszélgetés",
    "No conversations match": "Nincs egyező beszélgetés",
    "Double-click to rename": "Dupla kattintás az átnevezéshez",
    "Delete conversation": "Beszélgetés törlése",
    Untitled: "Névtelen",
    'Delete "{title}"? This cannot be undone.': '„{title}” törlése? Ez nem vonható vissza.',
  },
  fr: {
    Conversations: "Conversations",
    New: "Nouvelle",
    "Search conversations": "Rechercher des conversations",
    "No conversations yet": "Pas encore de conversations",
    "No conversations match": "Aucune conversation ne correspond",
    "Double-click to rename": "Double-cliquez pour renommer",
    "Delete conversation": "Supprimer la conversation",
    Untitled: "Sans titre",
    'Delete "{title}"? This cannot be undone.': 'Supprimer « {title} » ? Cette action est irréversible.',
  },
  uk: {
    Conversations: "Розмови",
    New: "Нова",
    "Search conversations": "Пошук розмов",
    "No conversations yet": "Ще немає розмов",
    "No conversations match": "Немає відповідних розмов",
    "Double-click to rename": "Двічі клацніть, щоб перейменувати",
    "Delete conversation": "Видалити розмову",
    Untitled: "Без назви",
    'Delete "{title}"? This cannot be undone.': 'Видалити «{title}»? Цю дію не можна скасувати.',
  },
  tr: {
    Conversations: "Konuşmalar",
    New: "Yeni",
    "Search conversations": "Konuşmalarda ara",
    "No conversations yet": "Henüz konuşma yok",
    "No conversations match": "Eşleşen konuşma yok",
    "Double-click to rename": "Yeniden adlandırmak için çift tıklayın",
    "Delete conversation": "Konuşmayı sil",
    Untitled: "Adsız",
    'Delete "{title}"? This cannot be undone.': '"{title}" silinsin mi? Bu işlem geri alınamaz.',
  },
  th: {
    Conversations: "การสนทนา",
    New: "ใหม่",
    "Search conversations": "ค้นหาการสนทนา",
    "No conversations yet": "ยังไม่มีการสนทนา",
    "No conversations match": "ไม่มีการสนทนาที่ตรงกัน",
    "Double-click to rename": "ดับเบิลคลิกเพื่อเปลี่ยนชื่อ",
    "Delete conversation": "ลบการสนทนา",
    Untitled: "ไม่มีชื่อ",
    'Delete "{title}"? This cannot be undone.': 'ลบ "{title}" ใช่หรือไม่ การดำเนินการนี้ไม่สามารถย้อนกลับได้',
  },
  it: {
    Conversations: "Conversazioni",
    New: "Nuova",
    "Search conversations": "Cerca conversazioni",
    "No conversations yet": "Ancora nessuna conversazione",
    "No conversations match": "Nessuna conversazione corrispondente",
    "Double-click to rename": "Fai doppio clic per rinominare",
    "Delete conversation": "Elimina conversazione",
    Untitled: "Senza titolo",
    'Delete "{title}"? This cannot be undone.': 'Eliminare "{title}"? Questa azione non può essere annullata.',
  },
};

/** Same `{token}` substitution `@jini-ai/chat/react`'s own `PASSTHROUGH_I18N` uses
 *  (`hooks/context.ts`) — matched here so a translated template interpolates exactly like the
 *  package's default does, and an unknown `{token}` is left visible rather than silently dropped. */
function interpolate(template: string, vars: Record<string, string | number> | undefined): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = vars[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}

/**
 * Builds the `I18nAdapter` `AssistantDock.tsx` passes to `<JiniChatProvider i18n={...}>`.
 *
 * @param locale - `useAdminLocale()`'s current value.
 * @returns An adapter whose `t()` translates the bounded `CHAT_PANE_I18N_DICT` key set and passes
 *   every other key through unchanged — identical to the package's own default passthrough for any
 *   key this dictionary does not cover.
 * @complexity O(1) per `t()` call — a single object lookup plus regex interpolation over the
 *   (short, fixed-shape) template string.
 * @overallScore 100 — no branches beyond the dictionary-miss fallback, no I/O, no state.
 */
export function createChatI18nAdapter(locale: string): I18nAdapter {
  return {
    locale,
    t: (key, vars) => interpolate(CHAT_PANE_I18N_DICT[locale]?.[key] ?? key, vars),
  };
}
