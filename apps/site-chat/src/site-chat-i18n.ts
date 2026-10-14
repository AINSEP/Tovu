// The same locale set as the admin, owned here so the public bundle never imports admin code.
const keys = ['Ask this site', 'Chat with this site', "Ask about this site's posts and pages…",
  'Ask about posts, pages or docs on this site.', 'What can I find on this site?', 'Show me the latest posts',
  'Close chat', 'New thread', 'Cancel', 'Discard chat?', 'Example prompts', 'Send', 'Stop run', 'Discard chat', 'Discard draft'] as const;
const rows: Record<string, readonly string[]> = {
  es: ['Pregunta a este sitio', 'Chatea con este sitio', 'Pregunta sobre las entradas y páginas de este sitio…', 'Pregunta sobre entradas, páginas o documentos de este sitio.', '¿Qué puedo encontrar en este sitio?', 'Muéstrame las últimas entradas', 'Cerrar chat', 'Nuevo hilo', 'Cancelar', '¿Descartar chat?', 'Ejemplos de preguntas', 'Enviar', 'Detener ejecución', 'Descartar chat', 'Descartar borrador'],
  id: ['Tanya situs ini', 'Mengobrol dengan situs ini', 'Tanyakan tentang postingan dan halaman situs ini…', 'Tanyakan tentang postingan, halaman, atau dokumen di situs ini.', 'Apa yang dapat saya temukan di situs ini?', 'Tampilkan postingan terbaru', 'Tutup obrolan', 'Percakapan baru', 'Batal', 'Buang obrolan?', 'Contoh pertanyaan', 'Kirim', 'Hentikan proses', 'Buang obrolan', 'Buang draf'],
  de: ['Diese Website fragen', 'Mit dieser Website chatten', 'Frage zu Beiträgen und Seiten dieser Website…', 'Frage zu Beiträgen, Seiten oder Dokumenten dieser Website.', 'Was finde ich auf dieser Website?', 'Zeige mir die neuesten Beiträge', 'Chat schließen', 'Neuer Chat', 'Abbrechen', 'Chat verwerfen?', 'Beispielfragen', 'Senden', 'Ausführung stoppen', 'Chat verwerfen', 'Entwurf verwerfen'],
  'zh-CN': ['询问本站', '与本站聊天', '询问本站的文章和页面…', '询问本站的文章、页面或文档。', '我能在本站找到什么？', '显示最新文章', '关闭聊天', '新对话', '取消', '放弃聊天？', '示例问题', '发送', '停止运行', '放弃聊天', '放弃草稿'],
  'zh-TW': ['詢問本站', '與本站聊天', '詢問本站的文章和頁面…', '詢問本站的文章、頁面或文件。', '我能在本站找到什麼？', '顯示最新文章', '關閉聊天', '新對話', '取消', '捨棄聊天？', '範例問題', '傳送', '停止執行', '捨棄聊天', '捨棄草稿'],
  'pt-BR': ['Pergunte a este site', 'Converse com este site', 'Pergunte sobre posts e páginas deste site…', 'Pergunte sobre posts, páginas ou documentos deste site.', 'O que posso encontrar neste site?', 'Mostre os posts mais recentes', 'Fechar chat', 'Nova conversa', 'Cancelar', 'Descartar chat?', 'Exemplos de perguntas', 'Enviar', 'Parar execução', 'Descartar chat', 'Descartar rascunho'],
  ru: ['Спросить об этом сайте', 'Чат с этим сайтом', 'Спросите о записях и страницах этого сайта…', 'Спросите о записях, страницах или документации этого сайта.', 'Что можно найти на этом сайте?', 'Покажи последние записи', 'Закрыть чат', 'Новая беседа', 'Отмена', 'Удалить беседу?', 'Примеры вопросов', 'Отправить', 'Остановить выполнение', 'Удалить беседу', 'Удалить черновик'],
  fa: ['از این سایت بپرسید', 'گفتگو با این سایت', 'درباره نوشته‌ها و صفحات این سایت بپرسید…', 'درباره نوشته‌ها، صفحات یا مستندات این سایت بپرسید.', 'در این سایت چه چیزی می‌توانم پیدا کنم؟', 'جدیدترین نوشته‌ها را نشان بده', 'بستن گفتگو', 'گفتگوی جدید', 'لغو', 'گفتگو حذف شود؟', 'نمونه پرسش‌ها', 'ارسال', 'توقف اجرا', 'حذف گفتگو', 'حذف پیش‌نویس'],
  ar: ['اسأل هذا الموقع', 'الدردشة مع هذا الموقع', 'اسأل عن منشورات وصفحات هذا الموقع…', 'اسأل عن منشورات أو صفحات أو مستندات هذا الموقع.', 'ماذا يمكنني أن أجد في هذا الموقع؟', 'اعرض أحدث المنشورات', 'إغلاق الدردشة', 'محادثة جديدة', 'إلغاء', 'حذف المحادثة؟', 'أمثلة للأسئلة', 'إرسال', 'إيقاف التشغيل', 'حذف المحادثة', 'حذف المسودة'],
  ja: ['このサイトに質問', 'このサイトとチャット', 'このサイトの投稿やページについて質問…', 'このサイトの投稿、ページ、ドキュメントについて質問できます。', 'このサイトでは何が見つかりますか？', '最新の投稿を見せて', 'チャットを閉じる', '新しい会話', 'キャンセル', 'チャットを破棄しますか？', '質問の例', '送信', '実行を停止', 'チャットを破棄', '下書きを破棄'],
  ko: ['이 사이트에 질문하기', '이 사이트와 채팅하기', '이 사이트의 게시물과 페이지에 대해 질문하세요…', '이 사이트의 게시물, 페이지 또는 문서에 대해 질문하세요.', '이 사이트에서 무엇을 찾을 수 있나요?', '최신 게시물을 보여 주세요', '채팅 닫기', '새 대화', '취소', '채팅을 삭제할까요?', '질문 예시', '보내기', '실행 중지', '채팅 삭제', '초안 삭제'],
  pl: ['Zapytaj tę witrynę', 'Czat z tą witryną', 'Zapytaj o wpisy i strony tej witryny…', 'Zapytaj o wpisy, strony lub dokumentację tej witryny.', 'Co mogę znaleźć w tej witrynie?', 'Pokaż najnowsze wpisy', 'Zamknij czat', 'Nowa rozmowa', 'Anuluj', 'Odrzucić czat?', 'Przykładowe pytania', 'Wyślij', 'Zatrzymaj wykonanie', 'Odrzuć czat', 'Odrzuć szkic'],
  hu: ['Kérdezz erről az oldalról', 'Csevegés ezzel az oldallal', 'Kérdezz az oldal bejegyzéseiről és lapjairól…', 'Kérdezz az oldal bejegyzéseiről, lapjairól vagy dokumentumairól.', 'Mit találhatok ezen az oldalon?', 'Mutasd a legújabb bejegyzéseket', 'Csevegés bezárása', 'Új beszélgetés', 'Mégse', 'Elveted a csevegést?', 'Mintakérdések', 'Küldés', 'Futtatás leállítása', 'Csevegés elvetése', 'Piszkozat elvetése'],
  fr: ['Interroger ce site', 'Discuter avec ce site', 'Posez une question sur les articles et pages de ce site…', 'Posez une question sur les articles, pages ou documents de ce site.', 'Que puis-je trouver sur ce site ?', 'Montre-moi les derniers articles', 'Fermer le chat', 'Nouvelle conversation', 'Annuler', 'Supprimer le chat ?', 'Exemples de questions', 'Envoyer', 'Arrêter l’exécution', 'Supprimer le chat', 'Supprimer le brouillon'],
  uk: ['Запитати про цей сайт', 'Чат із цим сайтом', 'Запитайте про дописи та сторінки цього сайту…', 'Запитайте про дописи, сторінки чи документацію цього сайту.', 'Що можна знайти на цьому сайті?', 'Покажи останні дописи', 'Закрити чат', 'Нова розмова', 'Скасувати', 'Видалити розмову?', 'Приклади запитань', 'Надіслати', 'Зупинити виконання', 'Видалити розмову', 'Видалити чернетку'],
  tr: ['Bu siteye sor', 'Bu siteyle sohbet et', 'Bu sitenin yazıları ve sayfaları hakkında sorun…', 'Bu sitenin yazıları, sayfaları veya belgeleri hakkında sorun.', 'Bu sitede ne bulabilirim?', 'En son yazıları göster', 'Sohbeti kapat', 'Yeni sohbet', 'İptal', 'Sohbet silinsin mi?', 'Örnek sorular', 'Gönder', 'Çalışmayı durdur', 'Sohbeti sil', 'Taslağı sil'],
  th: ['ถามเว็บไซต์นี้', 'แชทกับเว็บไซต์นี้', 'ถามเกี่ยวกับโพสต์และหน้าของเว็บไซต์นี้…', 'ถามเกี่ยวกับโพสต์ หน้า หรือเอกสารของเว็บไซต์นี้', 'ฉันจะพบอะไรในเว็บไซต์นี้ได้บ้าง?', 'แสดงโพสต์ล่าสุด', 'ปิดแชท', 'เริ่มบทสนทนาใหม่', 'ยกเลิก', 'ทิ้งบทสนทนาหรือไม่?', 'ตัวอย่างคำถาม', 'ส่ง', 'หยุดการทำงาน', 'ทิ้งบทสนทนา', 'ทิ้งฉบับร่าง'],
  it: ['Chiedi a questo sito', 'Chatta con questo sito', 'Chiedi informazioni sui post e sulle pagine di questo sito…', 'Chiedi informazioni su post, pagine o documenti di questo sito.', 'Cosa posso trovare su questo sito?', 'Mostrami gli ultimi post', 'Chiudi chat', 'Nuova conversazione', 'Annulla', 'Eliminare la chat?', 'Domande di esempio', 'Invia', 'Interrompi esecuzione', 'Elimina chat', 'Elimina bozza'],
  hi: ['इस साइट से पूछें', 'इस साइट से चैट करें', 'इस साइट की पोस्ट और पृष्ठों के बारे में पूछें…', 'इस साइट की पोस्ट, पृष्ठों या दस्तावेज़ों के बारे में पूछें।', 'मुझे इस साइट पर क्या मिल सकता है?', 'नवीनतम पोस्ट दिखाएँ', 'चैट बंद करें', 'नई बातचीत', 'रद्द करें', 'चैट हटाएँ?', 'उदाहरण प्रश्न', 'भेजें', 'प्रक्रिया रोकें', 'चैट हटाएँ', 'ड्राफ़्ट हटाएँ'],
  ur: ['اس سائٹ سے پوچھیں', 'اس سائٹ سے چیٹ کریں', 'اس سائٹ کی پوسٹس اور صفحات کے بارے میں پوچھیں…', 'اس سائٹ کی پوسٹس، صفحات یا دستاویزات کے بارے میں پوچھیں۔', 'مجھے اس سائٹ پر کیا مل سکتا ہے؟', 'تازہ ترین پوسٹس دکھائیں', 'چیٹ بند کریں', 'نئی گفتگو', 'منسوخ کریں', 'چیٹ حذف کریں؟', 'مثالی سوالات', 'بھیجیں', 'عمل روکیں', 'چیٹ حذف کریں', 'مسودہ حذف کریں'],
  bn: ['এই সাইটকে জিজ্ঞাসা করুন', 'এই সাইটের সাথে চ্যাট করুন', 'এই সাইটের পোস্ট ও পৃষ্ঠা সম্পর্কে জিজ্ঞাসা করুন…', 'এই সাইটের পোস্ট, পৃষ্ঠা বা নথি সম্পর্কে জিজ্ঞাসা করুন।', 'এই সাইটে আমি কী খুঁজে পাব?', 'সর্বশেষ পোস্ট দেখান', 'চ্যাট বন্ধ করুন', 'নতুন কথোপকথন', 'বাতিল', 'চ্যাট মুছে ফেলবেন?', 'উদাহরণ প্রশ্ন', 'পাঠান', 'প্রক্রিয়া বন্ধ করুন', 'চ্যাট মুছে ফেলুন', 'খসড়া মুছে ফেলুন'],
};

export const SITE_CHAT_DICTIONARY = Object.fromEntries(Object.entries(rows).map(([locale, values]) =>
  [locale, Object.fromEntries(keys.map((key, index) => [key, values[index]!]))]));
/** Bind public copy to the page language with an English fallback. O(1) dictionary lookup. */
export function createSiteChatI18n({ document }: { document: Document }, _options = {}) {
  const language = document.documentElement.lang || 'en';
  const locale = Object.keys(rows).find(key => key.toLowerCase() === language.toLowerCase()) ?? language.split('-')[0]!;
  // The panel-kit translator's barrel imports React, which this shared vanilla host cannot load.
  const dictionary = SITE_CHAT_DICTIONARY[locale] ?? {};
  // Jini's chat calls t(key, vars) for timed/named lines ("Thinking… {time}"); fill them in, keeping
  // an unknown {name} as-is the way Jini's own passthrough translator does.
  return {
    locale,
    t: (key: string, vars?: Record<string, string | number>): string => {
      const template = Object.hasOwn(dictionary, key) ? dictionary[key]! : key;
      return vars ? template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] === undefined ? match : String(vars[name])) : template;
    },
  };
}
