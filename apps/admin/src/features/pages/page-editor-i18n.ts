/**
 * @file Spanish dictionary for `use-page-editor.hooks.ts`'s own notice/error strings
 * (`setMessage`/`setError` fallbacks) — NOT `PageEditor.tsx`'s JSX markup, which `pages-i18n.ts`'s
 * own header notes was deliberately left out of scope by the earlier `.tsx`-only translation pass.
 * This file exists because that scope boundary was JSX vs. hooks, not "this feature's editor is
 * untranslated" — the hook's hardcoded English strings still surface directly in the UI (the same
 * gap `comments-i18n.ts` closes for `use-comment-queue.hooks.ts`/`use-comment-settings.hooks.ts`).
 * Same two-step fallback every other `t()` in this app uses: translated value, else the English
 * source string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";
import { t as postT } from "../posts/posts-i18n";

/**
 * Page-editor-only copy. The shared editor vocabulary is inherited from the Posts editor's
 * complete locale set below; it is deliberately merged into this feature's dictionary before
 * translation, so the Page editor still has one locale-aware translator at its call sites.
 */
const pageEditorMarkupTranslations: Record<string, Record<string, string>> = {
  es: { "Ask the assistant to build this page, or edit the HTML directly.": "Pide al asistente que cree esta página o edita el HTML directamente.", "Load latest": "Cargar la última versión", "Keep my edits": "Conservar mis ediciones", "Preview width": "Ancho de vista previa", "Page title": "Título de la página", Untitled: "Sin título", "Editor view": "Vista del editor", "Page HTML": "HTML de la página", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "Esta página aún no tiene HTML. Pide al asistente que lo cree o escribe algo aquí.", "Loading the theme's styles…": "Cargando los estilos del tema…", "Page preview": "Vista previa de la página", "Loading pages…": "Cargando páginas…" },
  de: { "Ask the assistant to build this page, or edit the HTML directly.": "Bitte den Assistenten, diese Seite zu erstellen, oder bearbeite das HTML direkt.", "Load latest": "Neueste Version laden", "Keep my edits": "Meine Änderungen behalten", "Preview width": "Vorschaubreite", "Page title": "Seitentitel", Untitled: "Ohne Titel", "Editor view": "Editoransicht", "Page HTML": "Seiten-HTML", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "Diese Seite hat noch kein HTML. Bitte den Assistenten, es zu erstellen, oder schreibe hier etwas.", "Loading the theme's styles…": "Design-Stile werden geladen…", "Page preview": "Seitenvorschau", "Loading pages…": "Seiten werden geladen…" },
  it: { "Ask the assistant to build this page, or edit the HTML directly.": "Chiedi all'assistente di creare questa pagina oppure modifica direttamente l'HTML.", "Load latest": "Carica l'ultima versione", "Keep my edits": "Mantieni le mie modifiche", "Preview width": "Larghezza dell'anteprima", "Page title": "Titolo della pagina", Untitled: "Senza titolo", "Editor view": "Vista dell'editor", "Page HTML": "HTML della pagina", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "Questa pagina non ha ancora HTML. Chiedi all'assistente di crearlo oppure scrivine qui.", "Loading the theme's styles…": "Caricamento degli stili del tema…", "Page preview": "Anteprima della pagina", "Loading pages…": "Caricamento pagine…" },
  "zh-CN": { "Ask the assistant to build this page, or edit the HTML directly.": "让助手创建此页面，或直接编辑 HTML。", "Load latest": "加载最新版本", "Keep my edits": "保留我的编辑", "Preview width": "预览宽度", "Page title": "页面标题", Untitled: "未命名", "Editor view": "编辑器视图", "Page HTML": "页面 HTML", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "此页面尚无 HTML。请让助手创建它，或在此处编写一些内容。", "Loading the theme's styles…": "正在加载主题样式…", "Page preview": "页面预览", "Loading pages…": "正在加载页面…" },
  "zh-TW": { "Ask the assistant to build this page, or edit the HTML directly.": "請讓助理建立此頁面，或直接編輯 HTML。", "Load latest": "載入最新版本", "Keep my edits": "保留我的編輯", "Preview width": "預覽寬度", "Page title": "頁面標題", Untitled: "未命名", "Editor view": "編輯器檢視", "Page HTML": "頁面 HTML", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "此頁面尚無 HTML。請讓助理建立它，或在此處撰寫一些內容。", "Loading the theme's styles…": "正在載入主題樣式…", "Page preview": "頁面預覽", "Loading pages…": "正在載入頁面…" },
  ar: { "Ask the assistant to build this page, or edit the HTML directly.": "اطلب من المساعد إنشاء هذه الصفحة، أو حرّر HTML مباشرةً.", "Load latest": "تحميل الأحدث", "Keep my edits": "الاحتفاظ بتعديلاتي", "Preview width": "عرض المعاينة", "Page title": "عنوان الصفحة", Untitled: "بلا عنوان", "Editor view": "عرض المحرر", "Page HTML": "HTML الصفحة", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "لا تحتوي هذه الصفحة على HTML بعد. اطلب من المساعد إنشاؤه، أو اكتب بعضه هنا.", "Loading the theme's styles…": "جارٍ تحميل أنماط القالب…", "Page preview": "معاينة الصفحة", "Loading pages…": "جارٍ تحميل الصفحات…" },
  fa: { "Ask the assistant to build this page, or edit the HTML directly.": "از دستیار بخواهید این صفحه را بسازد، یا HTML را مستقیماً ویرایش کنید.", "Load latest": "بارگذاری آخرین نسخه", "Keep my edits": "ویرایش‌های من را نگه دار", "Preview width": "عرض پیش‌نمایش", "Page title": "عنوان صفحه", Untitled: "بدون عنوان", "Editor view": "نمای ویرایشگر", "Page HTML": "HTML صفحه", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "این صفحه هنوز HTML ندارد. از دستیار بخواهید آن را بسازد، یا چیزی اینجا بنویسید.", "Loading the theme's styles…": "در حال بارگذاری سبک‌های پوسته…", "Page preview": "پیش‌نمایش صفحه", "Loading pages…": "در حال بارگذاری صفحه‌ها…" },
  ru: { "Ask the assistant to build this page, or edit the HTML directly.": "Попросите помощника создать эту страницу или отредактируйте HTML напрямую.", "Load latest": "Загрузить последнюю версию", "Keep my edits": "Сохранить мои изменения", "Preview width": "Ширина предпросмотра", "Page title": "Заголовок страницы", Untitled: "Без названия", "Editor view": "Вид редактора", "Page HTML": "HTML страницы", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "У этой страницы пока нет HTML. Попросите помощника создать его или напишите что-нибудь здесь.", "Loading the theme's styles…": "Загрузка стилей темы…", "Page preview": "Предпросмотр страницы", "Loading pages…": "Загрузка страниц…" },
  ja: { "Ask the assistant to build this page, or edit the HTML directly.": "アシスタントにこのページを作成してもらうか、HTML を直接編集してください。", "Load latest": "最新を読み込む", "Keep my edits": "編集内容を保持", "Preview width": "プレビューの幅", "Page title": "ページタイトル", Untitled: "無題", "Editor view": "エディター表示", "Page HTML": "ページ HTML", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "このページにはまだ HTML がありません。アシスタントに作成を依頼するか、ここに入力してください。", "Loading the theme's styles…": "テーマのスタイルを読み込み中…", "Page preview": "ページプレビュー", "Loading pages…": "ページを読み込み中…" },
  id: { "Ask the assistant to build this page, or edit the HTML directly.": "Minta asisten membuat halaman ini, atau edit HTML secara langsung.", "Load latest": "Muat versi terbaru", "Keep my edits": "Pertahankan editan saya", "Preview width": "Lebar pratinjau", "Page title": "Judul halaman", Untitled: "Tanpa judul", "Editor view": "Tampilan editor", "Page HTML": "HTML halaman", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "Halaman ini belum memiliki HTML. Minta asisten membuatnya, atau tulis sesuatu di sini.", "Loading the theme's styles…": "Memuat gaya tema…", "Page preview": "Pratinjau halaman", "Loading pages…": "Memuat halaman…" },
  "pt-BR": { "Ask the assistant to build this page, or edit the HTML directly.": "Peça ao assistente para criar esta página ou edite o HTML diretamente.", "Load latest": "Carregar a versão mais recente", "Keep my edits": "Manter minhas edições", "Preview width": "Largura da visualização", "Page title": "Título da página", Untitled: "Sem título", "Editor view": "Visualização do editor", "Page HTML": "HTML da página", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "Esta página ainda não tem HTML. Peça ao assistente para criá-lo ou escreva algo aqui.", "Loading the theme's styles…": "Carregando os estilos do tema…", "Page preview": "Visualização da página", "Loading pages…": "Carregando páginas…" },
  ko: { "Ask the assistant to build this page, or edit the HTML directly.": "도우미에게 이 페이지를 만들도록 요청하거나 HTML을 직접 편집하세요.", "Load latest": "최신 버전 불러오기", "Keep my edits": "내 편집 내용 유지", "Preview width": "미리 보기 너비", "Page title": "페이지 제목", Untitled: "제목 없음", "Editor view": "편집기 보기", "Page HTML": "페이지 HTML", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "이 페이지에는 아직 HTML이 없습니다. 도우미에게 만들도록 요청하거나 여기에서 직접 작성하세요.", "Loading the theme's styles…": "테마 스타일을 불러오는 중…", "Page preview": "페이지 미리 보기", "Loading pages…": "페이지를 불러오는 중…" },
  pl: { "Ask the assistant to build this page, or edit the HTML directly.": "Poproś asystenta o utworzenie tej strony albo edytuj HTML bezpośrednio.", "Load latest": "Wczytaj najnowszą wersję", "Keep my edits": "Zachowaj moje zmiany", "Preview width": "Szerokość podglądu", "Page title": "Tytuł strony", Untitled: "Bez tytułu", "Editor view": "Widok edytora", "Page HTML": "HTML strony", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "Ta strona nie ma jeszcze HTML. Poproś asystenta o jego utworzenie albo napisz coś tutaj.", "Loading the theme's styles…": "Wczytywanie stylów motywu…", "Page preview": "Podgląd strony", "Loading pages…": "Wczytywanie stron…" },
  hu: { "Ask the assistant to build this page, or edit the HTML directly.": "Kérje meg az asszisztenst az oldal elkészítésére, vagy szerkessze közvetlenül a HTML-t.", "Load latest": "Legújabb verzió betöltése", "Keep my edits": "Szerkesztéseim megtartása", "Preview width": "Előnézet szélessége", "Page title": "Oldal címe", Untitled: "Névtelen", "Editor view": "Szerkesztőnézet", "Page HTML": "Oldal HTML-je", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "Ennek az oldalnak még nincs HTML-je. Kérje meg az asszisztenst az elkészítésére, vagy írjon ide valamit.", "Loading the theme's styles…": "Téma stílusainak betöltése…", "Page preview": "Oldal előnézete", "Loading pages…": "Oldalak betöltése…" },
  fr: { "Ask the assistant to build this page, or edit the HTML directly.": "Demandez à l'assistant de créer cette page, ou modifiez directement le HTML.", "Load latest": "Charger la dernière version", "Keep my edits": "Conserver mes modifications", "Preview width": "Largeur de l'aperçu", "Page title": "Titre de la page", Untitled: "Sans titre", "Editor view": "Vue de l'éditeur", "Page HTML": "HTML de la page", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "Cette page n'a pas encore de HTML. Demandez à l'assistant de le créer ou écrivez-en ici.", "Loading the theme's styles…": "Chargement des styles du thème…", "Page preview": "Aperçu de la page", "Loading pages…": "Chargement des pages…" },
  uk: { "Ask the assistant to build this page, or edit the HTML directly.": "Попросіть помічника створити цю сторінку або відредагуйте HTML безпосередньо.", "Load latest": "Завантажити останню версію", "Keep my edits": "Зберегти мої зміни", "Preview width": "Ширина попереднього перегляду", "Page title": "Заголовок сторінки", Untitled: "Без назви", "Editor view": "Вигляд редактора", "Page HTML": "HTML сторінки", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "Ця сторінка ще не має HTML. Попросіть помічника створити його або напишіть щось тут.", "Loading the theme's styles…": "Завантаження стилів теми…", "Page preview": "Попередній перегляд сторінки", "Loading pages…": "Завантаження сторінок…" },
  tr: { "Ask the assistant to build this page, or edit the HTML directly.": "Asistandan bu sayfayı oluşturmasını isteyin veya HTML'yi doğrudan düzenleyin.", "Load latest": "En son sürümü yükle", "Keep my edits": "Düzenlemelerimi koru", "Preview width": "Önizleme genişliği", "Page title": "Sayfa başlığı", Untitled: "Başlıksız", "Editor view": "Düzenleyici görünümü", "Page HTML": "Sayfa HTML'si", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "Bu sayfanın henüz HTML'si yok. Asistandan oluşturmasını isteyin veya buraya bir şey yazın.", "Loading the theme's styles…": "Tema stilleri yükleniyor…", "Page preview": "Sayfa önizlemesi", "Loading pages…": "Sayfalar yükleniyor…" },
  th: { "Ask the assistant to build this page, or edit the HTML directly.": "ขอให้ผู้ช่วยสร้างหน้านี้ หรือแก้ไข HTML โดยตรง", "Load latest": "โหลดเวอร์ชันล่าสุด", "Keep my edits": "เก็บการแก้ไขของฉัน", "Preview width": "ความกว้างตัวอย่าง", "Page title": "ชื่อหน้า", Untitled: "ไม่มีชื่อ", "Editor view": "มุมมองตัวแก้ไข", "Page HTML": "HTML ของหน้า", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "หน้านี้ยังไม่มี HTML ขอให้ผู้ช่วยสร้าง หรือเขียนบางอย่างที่นี่", "Loading the theme's styles…": "กำลังโหลดสไตล์ของธีม…", "Page preview": "ตัวอย่างหน้า", "Loading pages…": "กำลังโหลดหน้า…" },
  hi: { "Ask the assistant to build this page, or edit the HTML directly.": "सहायक से यह पेज बनाने को कहें, या HTML को सीधे संपादित करें।", "Load latest": "नवीनतम लोड करें", "Keep my edits": "मेरे संपादन रखें", "Preview width": "पूर्वावलोकन की चौड़ाई", "Page title": "पेज शीर्षक", Untitled: "शीर्षकहीन", "Editor view": "संपादक दृश्य", "Page HTML": "पेज HTML", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "इस पेज में अभी HTML नहीं है। सहायक से इसे बनाने को कहें, या यहाँ कुछ लिखें।", "Loading the theme's styles…": "थीम की शैलियाँ लोड हो रही हैं…", "Page preview": "पेज पूर्वावलोकन", "Loading pages…": "पेज लोड हो रहे हैं…" },
  ur: { "Ask the assistant to build this page, or edit the HTML directly.": "اس صفحے کو بنانے کے لیے معاون سے کہیں، یا HTML کو براہِ راست ترمیم کریں۔", "Load latest": "تازہ ترین لوڈ کریں", "Keep my edits": "میری ترامیم رکھیں", "Preview width": "پیش نظارے کی چوڑائی", "Page title": "صفحے کا عنوان", Untitled: "بلا عنوان", "Editor view": "ایڈیٹر منظر", "Page HTML": "صفحے کا HTML", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "اس صفحے میں ابھی HTML نہیں ہے۔ معاون سے اسے بنانے کو کہیں، یا یہاں کچھ لکھیں۔", "Loading the theme's styles…": "تھیم کے انداز لوڈ ہو رہے ہیں…", "Page preview": "صفحے کا پیش نظارہ", "Loading pages…": "صفحات لوڈ ہو رہے ہیں…" },
  bn: { "Ask the assistant to build this page, or edit the HTML directly.": "সহকারীকে এই পেজটি তৈরি করতে বলুন, বা সরাসরি HTML সম্পাদনা করুন।", "Load latest": "সর্বশেষ সংস্করণ লোড করুন", "Keep my edits": "আমার সম্পাদনা রাখুন", "Preview width": "প্রিভিউ প্রস্থ", "Page title": "পেজের শিরোনাম", Untitled: "শিরোনামহীন", "Editor view": "সম্পাদনা দৃশ্য", "Page HTML": "পেজ HTML", "This page has no HTML yet. Ask the assistant to build it, or write some here.": "এই পেজে এখনও HTML নেই। সহকারীকে এটি তৈরি করতে বলুন, বা এখানে কিছু লিখুন।", "Loading the theme's styles…": "থিমের শৈলী লোড হচ্ছে…", "Page preview": "পেজ প্রিভিউ", "Loading pages…": "পেজ লোড হচ্ছে…" },
};

const postEditorKeys = new Set([
  "Pages", "Content", "Edit page", "Draft", "Published", "Publish", "Restore", "Discard",
  "Save anyway", "Keep editing", "Template", "No template chosen", "No templates for this theme",
  "Loading editor…", "URL slug", "view ↗", "Move to trash?", "Move to trash",
  "to trash? It will disappear from the site and from this list.", "Exit full screen (Esc)",
  "Show full screen", "Exit full screen",
] as const);

const pageEditorControlTranslations: Record<string, Record<string, string>> = {
  es: { Move: "Mover", Desktop: "Escritorio", Tablet: "Tableta", Mobile: "Móvil", Interactive: "Interactivo", Preview: "Vista previa" }, de: { Move: "Verschiebe", Desktop: "Desktop", Tablet: "Tablet", Mobile: "Mobil", Interactive: "Interaktiv", Preview: "Vorschau" }, it: { Move: "Sposta", Desktop: "Desktop", Tablet: "Tablet", Mobile: "Cellulare", Interactive: "Interattivo", Preview: "Anteprima" }, "zh-CN": { Move: "将", Desktop: "桌面", Tablet: "平板电脑", Mobile: "手机", Interactive: "交互式", Preview: "预览" }, "zh-TW": { Move: "將", Desktop: "桌面", Tablet: "平板電腦", Mobile: "手機", Interactive: "互動式", Preview: "預覽" }, ar: { Move: "انقل", Desktop: "سطح المكتب", Tablet: "جهاز لوحي", Mobile: "الهاتف", Interactive: "تفاعلي", Preview: "معاينة" }, fa: { Move: "انتقال", Desktop: "رومیزی", Tablet: "تبلت", Mobile: "موبایل", Interactive: "تعاملی", Preview: "پیش‌نمایش" }, ru: { Move: "Переместить", Desktop: "Компьютер", Tablet: "Планшет", Mobile: "Телефон", Interactive: "Интерактивный", Preview: "Предпросмотр" }, ja: { Move: "移動", Desktop: "デスクトップ", Tablet: "タブレット", Mobile: "モバイル", Interactive: "インタラクティブ", Preview: "プレビュー" }, id: { Move: "Pindahkan", Desktop: "Desktop", Tablet: "Tablet", Mobile: "Seluler", Interactive: "Interaktif", Preview: "Pratinjau" }, "pt-BR": { Move: "Mover", Desktop: "Computador", Tablet: "Tablet", Mobile: "Celular", Interactive: "Interativo", Preview: "Visualização" }, ko: { Move: "이동", Desktop: "데스크톱", Tablet: "태블릿", Mobile: "모바일", Interactive: "대화형", Preview: "미리 보기" }, pl: { Move: "Przenieś", Desktop: "Komputer", Tablet: "Tablet", Mobile: "Telefon", Interactive: "Interaktywny", Preview: "Podgląd" }, hu: { Move: "Áthelyezés", Desktop: "Asztali gép", Tablet: "Táblagép", Mobile: "Mobil", Interactive: "Interaktív", Preview: "Előnézet" }, fr: { Move: "Déplacer", Desktop: "Ordinateur", Tablet: "Tablette", Mobile: "Mobile", Interactive: "Interactif", Preview: "Aperçu" }, uk: { Move: "Перемістити", Desktop: "Комп’ютер", Tablet: "Планшет", Mobile: "Телефон", Interactive: "Інтерактивний", Preview: "Попередній перегляд" }, tr: { Move: "Taşı", Desktop: "Masaüstü", Tablet: "Tablet", Mobile: "Mobil", Interactive: "Etkileşimli", Preview: "Önizleme" }, th: { Move: "ย้าย", Desktop: "เดสก์ท็อป", Tablet: "แท็บเล็ต", Mobile: "มือถือ", Interactive: "โต้ตอบได้", Preview: "ตัวอย่าง" }, hi: { Move: "स्थानांतरित करें", Desktop: "डेस्कटॉप", Tablet: "टैबलेट", Mobile: "मोबाइल", Interactive: "इंटरैक्टिव", Preview: "पूर्वावलोकन" }, ur: { Move: "منتقل کریں", Desktop: "ڈیسک ٹاپ", Tablet: "ٹیبلیٹ", Mobile: "موبائل", Interactive: "تعاملی", Preview: "پیش نظارہ" }, bn: { Move: "সরান", Desktop: "ডেস্কটপ", Tablet: "ট্যাবলেট", Mobile: "মোবাইল", Interactive: "ইন্টার‌অ্যাকটিভ", Preview: "প্রিভিউ" },
};

const PAGE_EDITOR_HOOK_DICT: Record<string, Record<string, string>> = {
  es: {
    "could not re-read the current version — your changes are still here, try again": "no se pudo releer la versión actual: tus cambios siguen aquí, inténtalo de nuevo",
    "failed to load page": "no se pudo cargar la página",
    Saved: "Guardado",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Se guardaron el título, el slug y el estado. El contenido de esta página usa el editor de documentos y aún no se puede editar aquí.",
    "failed to save page": "no se pudo guardar la página",
    "failed to delete page": "no se pudo eliminar la página",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Se guardaron el título, el slug y el estado, pero no el contenido de la página. Tu contenido sigue aquí — pulsa Guardar para reintentarlo.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "Otra persona guardó esto mientras editabas: trabajabas a partir de la versión {baseVersion}, así que el guardado automático se ha pausado y nada de lo que escribas ahora se está almacenando. Tus cambios NO se guardaron y siguen aquí en el editor. Recarga para obtener su versión y reanudar el guardado automático; antes, copia lo que quieras conservar.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "Otra persona guardó esto mientras editabas: trabajabas a partir de {basis}, y ahora está almacenada {current}. Tus cambios NO se guardaron y siguen aquí en el editor. Si vuelves a guardar, se reemplazará su versión.",
    "the version you loaded": "la versión que cargaste",
    "a newer version": "una versión más reciente",
    "version {version}": "la versión {version}",
  },
  id: {
    "could not re-read the current version — your changes are still here, try again": "tidak dapat membaca ulang versi saat ini — perubahan Anda masih ada di sini, coba lagi",
    "failed to load page": "gagal memuat halaman",
    Saved: "Tersimpan",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Judul, slug, dan status tersimpan. Konten halaman ini menggunakan editor dokumen dan belum bisa diedit di sini.",
    "failed to save page": "gagal menyimpan halaman",
    "failed to delete page": "gagal menghapus halaman",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Judul, slug, dan status tersimpan, tetapi konten halaman tidak. Konten Anda masih ada di sini — tekan Simpan untuk mencoba lagi.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "Orang lain menyimpan ini saat Anda sedang mengedit — Anda bekerja dari versi {baseVersion}, sehingga simpan otomatis dijeda dan apa pun yang Anda ketik sekarang tidak disimpan. Perubahan Anda BELUM disimpan, dan masih ada di editor. Muat ulang untuk mengambil versi mereka dan melanjutkan simpan otomatis; salin dulu apa pun yang ingin Anda simpan.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "Orang lain menyimpan ini saat Anda sedang mengedit — Anda bekerja dari {basis}, dan kini yang tersimpan adalah {current}. Perubahan Anda BELUM disimpan, dan masih ada di editor. Menyimpan lagi akan menggantikan versi mereka.",
    "the version you loaded": "versi yang Anda muat",
    "a newer version": "versi yang lebih baru",
    "version {version}": "versi {version}",
  },
  de: {
    "could not re-read the current version — your changes are still here, try again": "die aktuelle Version konnte nicht erneut gelesen werden — deine Änderungen sind noch hier, versuche es erneut",
    "failed to load page": "Seite konnte nicht geladen werden",
    Saved: "Gespeichert",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Titel, Slug und Status wurden gespeichert. Der Inhalt dieser Seite verwendet den Dokumenteditor und kann hier noch nicht bearbeitet werden.",
    "failed to save page": "Seite konnte nicht gespeichert werden",
    "failed to delete page": "Seite konnte nicht gelöscht werden",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Titel, Slug und Status wurden gespeichert, der Seiteninhalt jedoch nicht. Dein Inhalt ist noch hier — klicke auf Speichern, um es erneut zu versuchen.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "Jemand anderes hat dies gespeichert, während du bearbeitet hast — deine Grundlage war Version {baseVersion}, daher ist das automatische Speichern pausiert und nichts, was du jetzt tippst, wird gespeichert. Deine Änderungen wurden NICHT gespeichert und sind noch hier im Editor. Lade neu, um deren Version zu übernehmen und das automatische Speichern fortzusetzen; kopiere vorher alles, was du behalten möchtest.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "Jemand anderes hat dies gespeichert, während du bearbeitet hast — deine Grundlage war {basis}, und gespeichert ist jetzt {current}. Deine Änderungen wurden NICHT gespeichert und sind noch hier im Editor. Erneutes Speichern ersetzt deren Version.",
    "the version you loaded": "die von dir geladene Version",
    "a newer version": "eine neuere Version",
    "version {version}": "Version {version}",
  },
  "zh-CN": {
    "could not re-read the current version — your changes are still here, try again": "无法重新读取当前版本 — 你的更改仍在这里，请重试",
    "failed to load page": "页面加载失败",
    Saved: "已保存",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "标题、slug 和状态已保存。此页面的内容使用文档编辑器，目前还不能在这里编辑。",
    "failed to save page": "页面保存失败",
    "failed to delete page": "页面删除失败",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "标题、slug 和状态已保存，但页面内容未保存。你的内容仍在这里 — 请按“保存”重试。",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "在您编辑期间，其他人保存了此内容——您基于版本 {baseVersion} 进行编辑，因此自动保存已暂停，您现在输入的任何内容都不会被保存。您的更改尚未保存，仍保留在编辑器中。重新加载以获取对方的版本并恢复自动保存；请先复制您想保留的内容。",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "在您编辑期间，其他人保存了此内容——您基于{basis}进行编辑，而现在存储的是{current}。您的更改尚未保存，仍保留在编辑器中。再次保存将替换对方的版本。",
    "the version you loaded": "您加载的版本",
    "a newer version": "更新的版本",
    "version {version}": "版本 {version}",
  },
  "zh-TW": {
    "could not re-read the current version — your changes are still here, try again": "無法重新讀取目前版本 — 你的變更仍在這裡，請再試一次",
    "failed to load page": "頁面載入失敗",
    Saved: "已儲存",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "標題、slug 和狀態已儲存。此頁面的內容使用文件編輯器，目前還不能在這裡編輯。",
    "failed to save page": "頁面儲存失敗",
    "failed to delete page": "頁面刪除失敗",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "標題、slug 和狀態已儲存，但頁面內容未儲存。你的內容仍在這裡 — 請按「儲存」重試。",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "在您編輯期間，其他人儲存了此內容——您是以版本 {baseVersion} 為基礎編輯，因此自動儲存已暫停，您現在輸入的任何內容都不會被儲存。您的變更尚未儲存，仍保留在編輯器中。重新載入以取得對方的版本並恢復自動儲存；請先複製您想保留的內容。",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "在您編輯期間，其他人儲存了此內容——您是以{basis}為基礎編輯，而現在儲存的是{current}。您的變更尚未儲存，仍保留在編輯器中。再次儲存將取代對方的版本。",
    "the version you loaded": "您載入的版本",
    "a newer version": "較新的版本",
    "version {version}": "版本 {version}",
  },
  "pt-BR": {
    "could not re-read the current version — your changes are still here, try again": "não foi possível reler a versão atual — suas alterações continuam aqui, tente novamente",
    "failed to load page": "falha ao carregar a página",
    Saved: "Salvo",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Título, slug e status foram salvos. O conteúdo desta página usa o editor de documentos e ainda não pode ser editado aqui.",
    "failed to save page": "falha ao salvar a página",
    "failed to delete page": "falha ao excluir a página",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Título, slug e status foram salvos, mas o conteúdo da página não. Seu conteúdo ainda está aqui — pressione Salvar para tentar novamente.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "Outra pessoa salvou isto enquanto você editava — você estava trabalhando com a versão {baseVersion}, então o salvamento automático foi pausado e nada do que você digitar agora está sendo armazenado. Suas alterações NÃO foram salvas e continuam aqui no editor. Recarregue para obter a versão dela e retomar o salvamento automático; antes, copie o que quiser manter.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "Outra pessoa salvou isto enquanto você editava — você estava trabalhando com {basis}, e agora está armazenada {current}. Suas alterações NÃO foram salvas e continuam aqui no editor. Salvar novamente substituirá a versão dela.",
    "the version you loaded": "a versão que você carregou",
    "a newer version": "uma versão mais recente",
    "version {version}": "a versão {version}",
  },
  ru: {
    "could not re-read the current version — your changes are still here, try again": "не удалось перечитать текущую версию — ваши изменения на месте, попробуйте ещё раз",
    "failed to load page": "не удалось загрузить страницу",
    Saved: "Сохранено",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Заголовок, slug и статус сохранены. Содержимое этой страницы использует редактор документов и пока не может редактироваться здесь.",
    "failed to save page": "не удалось сохранить страницу",
    "failed to delete page": "не удалось удалить страницу",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Заголовок, slug и статус сохранены, но содержимое страницы — нет. Ваш текст всё ещё здесь — нажмите «Сохранить», чтобы повторить попытку.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "Кто-то другой сохранил это, пока вы редактировали — вы работали с версией {baseVersion}, поэтому автосохранение приостановлено и ничего из того, что вы вводите сейчас, не сохраняется. Ваши изменения НЕ сохранены и всё ещё находятся в редакторе. Перезагрузите, чтобы получить их версию и возобновить автосохранение; сначала скопируйте всё, что хотите сохранить.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "Кто-то другой сохранил это, пока вы редактировали — исходной у вас была {basis}, а сейчас сохранена {current}. Ваши изменения НЕ сохранены и всё ещё находятся в редакторе. Повторное сохранение заменит их версию.",
    "the version you loaded": "загруженная вами версия",
    "a newer version": "более новая версия",
    "version {version}": "версия {version}",
  },
  fa: {
    "could not re-read the current version — your changes are still here, try again": "نسخه فعلی دوباره خوانده نشد — تغییرات شما همچنان اینجاست، دوباره تلاش کنید",
    "failed to load page": "بارگذاری صفحه ناموفق بود",
    Saved: "ذخیره شد",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "عنوان، slug و وضعیت ذخیره شدند. محتوای این صفحه از ویرایشگر سند استفاده می‌کند و هنوز نمی‌توان آن را اینجا ویرایش کرد.",
    "failed to save page": "ذخیرهٔ صفحه ناموفق بود",
    "failed to delete page": "حذف صفحه ناموفق بود",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "عنوان، slug و وضعیت ذخیره شدند، اما محتوای صفحه ذخیره نشد. محتوای شما همچنان اینجاست — برای تلاش دوباره روی «ذخیره» بزنید.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "شخص دیگری هنگام ویرایش شما این را ذخیره کرد — شما بر اساس نسخهٔ {baseVersion} کار می‌کردید، بنابراین ذخیرهٔ خودکار متوقف شده و هر چه اکنون تایپ کنید ذخیره نمی‌شود. تغییرات شما ذخیره نشده‌اند و هنوز اینجا در ویرایشگر هستند. برای دریافت نسخهٔ آن‌ها و ازسرگیری ذخیرهٔ خودکار، صفحه را دوباره بارگذاری کنید؛ ابتدا هر چه می‌خواهید نگه دارید کپی کنید.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "شخص دیگری هنگام ویرایش شما این را ذخیره کرد — شما بر اساس {basis} کار می‌کردید و اکنون {current} ذخیره شده است. تغییرات شما ذخیره نشده‌اند و هنوز اینجا در ویرایشگر هستند. ذخیرهٔ دوباره نسخهٔ آن‌ها را جایگزین می‌کند.",
    "the version you loaded": "نسخه‌ای که بارگذاری کردید",
    "a newer version": "نسخه‌ای جدیدتر",
    "version {version}": "نسخهٔ {version}",
  },
  ar: {
    "could not re-read the current version — your changes are still here, try again": "تعذّرت إعادة قراءة الإصدار الحالي — تغييراتك لا تزال هنا، حاول مرة أخرى",
    "failed to load page": "تعذّر تحميل الصفحة",
    Saved: "تم الحفظ",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "تم حفظ العنوان والمعرف (slug) والحالة. يستخدم محتوى هذه الصفحة محرر المستندات ولا يمكن تحريره هنا بعد.",
    "failed to save page": "تعذّر حفظ الصفحة",
    "failed to delete page": "تعذّر حذف الصفحة",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "تم حفظ العنوان والمعرف (slug) والحالة، لكن لم يتم حفظ محتوى الصفحة. لا يزال المحتوى الخاص بك هنا — اضغط على حفظ لإعادة المحاولة.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "حفظ شخص آخر هذا أثناء تحريرك — كنت تعمل انطلاقًا من الإصدار {baseVersion}، لذا توقف الحفظ التلقائي ولن يُخزَّن أي شيء تكتبه الآن. لم تُحفَظ تغييراتك، وما زالت هنا في المحرر. أعد التحميل للحصول على إصدارهم واستئناف الحفظ التلقائي؛ وانسخ أولًا أي شيء تريد الاحتفاظ به.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "حفظ شخص آخر هذا أثناء تحريرك — كنت تعمل انطلاقًا من {basis}، والمخزَّن الآن هو {current}. لم تُحفَظ تغييراتك، وما زالت هنا في المحرر. الحفظ مرة أخرى سيستبدل إصدارهم.",
    "the version you loaded": "الإصدار الذي حمّلته",
    "a newer version": "إصدار أحدث",
    "version {version}": "الإصدار {version}",
  },
  ja: {
    "could not re-read the current version — your changes are still here, try again": "現在のバージョンを読み直せませんでした — 変更はまだここにあります。もう一度お試しください",
    "failed to load page": "ページを読み込めませんでした",
    Saved: "保存しました",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "タイトル、スラッグ、ステータスを保存しました。このページの内容はドキュメントエディタを使用しており、まだここでは編集できません。",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "タイトル、スラッグ、ステータスは保存されましたが、ページの内容は保存されませんでした。内容はまだここにあります — 「保存」を押してもう一度お試しください。",
    "failed to save page": "ページを保存できませんでした",
    "failed to delete page": "ページを削除できませんでした",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "編集中に他のユーザーがこれを保存しました。あなたはバージョン {baseVersion} をもとに作業していたため、自動保存は一時停止しており、今入力した内容は保存されません。変更は保存されておらず、エディターに残っています。再読み込みして相手のバージョンを取得し、自動保存を再開してください。残したい内容は先にコピーしてください。",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "編集中に他のユーザーがこれを保存しました。あなたは{basis}をもとに作業していましたが、現在は{current}が保存されています。変更は保存されておらず、エディターに残っています。もう一度保存すると相手のバージョンが置き換えられます。",
    "the version you loaded": "読み込んだバージョン",
    "a newer version": "より新しいバージョン",
    "version {version}": "バージョン {version}",
  },
  ko: {
    "could not re-read the current version — your changes are still here, try again": "현재 버전을 다시 읽지 못했습니다 — 변경 사항은 그대로 있습니다. 다시 시도하세요",
    "failed to load page": "페이지를 불러오지 못했습니다",
    Saved: "저장됨",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "제목, 슬러그, 상태가 저장되었습니다. 이 페이지의 내용은 문서 편집기를 사용하며 아직 여기서는 편집할 수 없습니다.",
    "failed to save page": "페이지를 저장하지 못했습니다",
    "failed to delete page": "페이지를 삭제하지 못했습니다",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "제목, 슬러그, 상태는 저장되었지만 페이지 내용은 저장되지 않았습니다. 작성하신 내용은 그대로 남아 있습니다 — 다시 시도하려면 저장을 누르세요.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "편집하는 동안 다른 사람이 이 항목을 저장했습니다. 버전 {baseVersion}을(를) 기준으로 작업 중이었으므로 자동 저장이 일시 중지되었고 지금 입력하는 내용은 저장되지 않습니다. 변경 사항은 저장되지 않았으며 편집기에 그대로 남아 있습니다. 다시 불러와 상대방의 버전을 가져오고 자동 저장을 재개하세요. 유지하려는 내용은 먼저 복사하세요.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "편집하는 동안 다른 사람이 이 항목을 저장했습니다. {basis}을(를) 기준으로 작업 중이었고, 현재는 {current}이(가) 저장되어 있습니다. 변경 사항은 저장되지 않았으며 편집기에 그대로 남아 있습니다. 다시 저장하면 상대방의 버전이 대체됩니다.",
    "the version you loaded": "불러온 버전",
    "a newer version": "더 새로운 버전",
    "version {version}": "버전 {version}",
  },
  pl: {
    "could not re-read the current version — your changes are still here, try again": "nie udało się ponownie odczytać bieżącej wersji — Twoje zmiany nadal tu są, spróbuj ponownie",
    "failed to load page": "nie udało się wczytać strony",
    Saved: "Zapisano",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Tytuł, slug i status zostały zapisane. Treść tej strony korzysta z edytora dokumentów i nie można jej jeszcze edytować tutaj.",
    "failed to save page": "nie udało się zapisać strony",
    "failed to delete page": "nie udało się usunąć strony",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Tytuł, slug i status zostały zapisane, ale treść strony nie. Twoja treść nadal tu jest — kliknij Zapisz, aby spróbować ponownie.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "Ktoś inny zapisał to podczas Twojej edycji — Twoja praca opierała się na wersji {baseVersion}, więc autozapis został wstrzymany i nic, co teraz wpiszesz, nie jest zapisywane. Twoje zmiany NIE zostały zapisane i nadal są tutaj w edytorze. Odśwież, aby pobrać ich wersję i wznowić autozapis; najpierw skopiuj wszystko, co chcesz zachować.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "Ktoś inny zapisał to podczas Twojej edycji — punktem wyjścia była {basis}, a teraz zapisana jest {current}. Twoje zmiany NIE zostały zapisane i nadal są tutaj w edytorze. Ponowne zapisanie zastąpi ich wersję.",
    "the version you loaded": "wczytana przez Ciebie wersja",
    "a newer version": "nowsza wersja",
    "version {version}": "wersja {version}",
  },
  hu: {
    "could not re-read the current version — your changes are still here, try again": "nem sikerült újraolvasni az aktuális verziót — a módosításai továbbra is itt vannak, próbálja újra",
    "failed to load page": "nem sikerült betölteni az oldalt",
    Saved: "Mentve",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "A cím, a slug és az állapot mentve lett. Ennek az oldalnak a tartalma a dokumentumszerkesztőt használja, és itt még nem szerkeszthető.",
    "failed to save page": "nem sikerült menteni az oldalt",
    "failed to delete page": "nem sikerült törölni az oldalt",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "A cím, a slug és az állapot mentve lett, de az oldal tartalma nem. A tartalma továbbra is itt van — az újrapróbálkozáshoz kattintson a Mentésre.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "Valaki más mentette ezt, miközben Ön szerkesztett — Ön a(z) {baseVersion}. verzióból dolgozott, ezért az automatikus mentés szünetel, és semmi, amit most begépel, nem kerül tárolásra. A módosításai NEM lettek mentve, és továbbra is itt vannak a szerkesztőben. Töltse újra az oldalt a másik verzió betöltéséhez és az automatikus mentés folytatásához; előbb másolja ki, amit meg szeretne tartani.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "Valaki más mentette ezt, miközben Ön szerkesztett — a kiindulópont ez volt: {basis}, most pedig ez van tárolva: {current}. A módosításai NEM lettek mentve, és továbbra is itt vannak a szerkesztőben. Az újbóli mentés felülírja a másik verziót.",
    "the version you loaded": "az Ön által betöltött verzió",
    "a newer version": "egy újabb verzió",
    "version {version}": "a(z) {version}. verzió",
  },
  fr: {
    "could not re-read the current version — your changes are still here, try again": "impossible de relire la version actuelle — vos modifications sont toujours là, réessayez",
    "failed to load page": "échec du chargement de la page",
    Saved: "Enregistré",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Le titre, le slug et le statut ont été enregistrés. Le contenu de cette page utilise l'éditeur de documents et ne peut pas encore être modifié ici.",
    "failed to save page": "échec de l'enregistrement de la page",
    "failed to delete page": "échec de la suppression de la page",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Le titre, le slug et le statut ont été enregistrés, mais pas le contenu de la page. Votre contenu est toujours là — cliquez sur Enregistrer pour réessayer.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "Quelqu'un d'autre a enregistré ce contenu pendant que vous le modifiiez — vous travailliez à partir de la version {baseVersion}, donc l'enregistrement automatique est suspendu et rien de ce que vous saisissez maintenant n'est stocké. Vos modifications n'ont PAS été enregistrées et sont toujours ici dans l'éditeur. Rechargez pour récupérer leur version et reprendre l'enregistrement automatique ; copiez d'abord tout ce que vous souhaitez conserver.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "Quelqu'un d'autre a enregistré ce contenu pendant que vous le modifiiez — vous travailliez à partir de {basis}, et {current} est désormais stockée. Vos modifications n'ont PAS été enregistrées et sont toujours ici dans l'éditeur. Enregistrer à nouveau remplacera leur version.",
    "the version you loaded": "la version que vous avez chargée",
    "a newer version": "une version plus récente",
    "version {version}": "la version {version}",
  },
  uk: {
    "could not re-read the current version — your changes are still here, try again": "не вдалося перечитати поточну версію — ваші зміни на місці, спробуйте ще раз",
    "failed to load page": "не вдалося завантажити сторінку",
    Saved: "Збережено",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Заголовок, slug і статус збережено. Вміст цієї сторінки використовує редактор документів і поки що не може редагуватися тут.",
    "failed to save page": "не вдалося зберегти сторінку",
    "failed to delete page": "не вдалося видалити сторінку",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Заголовок, slug і статус збережено, але вміст сторінки — ні. Ваш вміст досі тут — натисніть «Зберегти», щоб повторити спробу.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "Хтось інший зберіг це, поки ви редагували — ви працювали з версією {baseVersion}, тому автозбереження призупинено, і нічого з того, що ви вводите зараз, не зберігається. Ваші зміни НЕ збережено, і вони досі тут, у редакторі. Перезавантажте, щоб отримати їхню версію та відновити автозбереження; спершу скопіюйте все, що хочете зберегти.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "Хтось інший зберіг це, поки ви редагували — вихідною у вас була {basis}, а зараз збережено {current}. Ваші зміни НЕ збережено, і вони досі тут, у редакторі. Повторне збереження замінить їхню версію.",
    "the version you loaded": "завантажена вами версія",
    "a newer version": "новіша версія",
    "version {version}": "версія {version}",
  },
  tr: {
    "could not re-read the current version — your changes are still here, try again": "geçerli sürüm yeniden okunamadı — değişiklikleriniz hâlâ burada, tekrar deneyin",
    "failed to load page": "sayfa yüklenemedi",
    Saved: "Kaydedildi",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Başlık, slug ve durum kaydedildi. Bu sayfanın içeriği belge düzenleyicisini kullanıyor ve henüz burada düzenlenemiyor.",
    "failed to save page": "sayfa kaydedilemedi",
    "failed to delete page": "sayfa silinemedi",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Başlık, slug ve durum kaydedildi, ancak sayfa içeriği kaydedilmedi. İçeriğiniz hâlâ burada — tekrar denemek için Kaydet'e basın.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "Siz düzenlerken başka biri bunu kaydetti — {baseVersion} sürümü üzerinden çalışıyordunuz, bu yüzden otomatik kaydetme duraklatıldı ve şimdi yazdığınız hiçbir şey kaydedilmiyor. Değişiklikleriniz KAYDEDİLMEDİ ve hâlâ burada, düzenleyicide. Onların sürümünü almak ve otomatik kaydetmeyi sürdürmek için yeniden yükleyin; önce saklamak istediğiniz her şeyi kopyalayın.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "Siz düzenlerken başka biri bunu kaydetti — çıkış noktanız: {basis}; şu anda kayıtlı olan: {current}. Değişiklikleriniz KAYDEDİLMEDİ ve hâlâ burada, düzenleyicide. Yeniden kaydetmek onların sürümünün yerine geçecek.",
    "the version you loaded": "yüklediğiniz sürüm",
    "a newer version": "daha yeni bir sürüm",
    "version {version}": "{version} sürümü",
  },
  th: {
    "could not re-read the current version — your changes are still here, try again": "ไม่สามารถอ่านเวอร์ชันปัจจุบันซ้ำได้ — การเปลี่ยนแปลงของคุณยังอยู่ ลองอีกครั้ง",
    "failed to load page": "โหลดหน้าไม่สำเร็จ",
    Saved: "บันทึกแล้ว",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "บันทึกชื่อเรื่อง สลัก และสถานะแล้ว เนื้อหาของหน้านี้ใช้ตัวแก้ไขเอกสารและยังไม่สามารถแก้ไขได้ที่นี่",
    "failed to save page": "บันทึกหน้าไม่สำเร็จ",
    "failed to delete page": "ลบหน้าไม่สำเร็จ",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "บันทึกชื่อเรื่อง สลัก และสถานะแล้ว แต่เนื้อหาของหน้ายังไม่ถูกบันทึก เนื้อหาของคุณยังอยู่ที่นี่ — กด บันทึก เพื่อลองอีกครั้ง",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "มีผู้อื่นบันทึกรายการนี้ขณะที่คุณกำลังแก้ไข — คุณทำงานจากเวอร์ชัน {baseVersion} การบันทึกอัตโนมัติจึงหยุดชั่วคราว และสิ่งที่คุณพิมพ์ตอนนี้จะไม่ถูกจัดเก็บ การเปลี่ยนแปลงของคุณยังไม่ได้บันทึก และยังอยู่ในตัวแก้ไข โหลดใหม่เพื่อรับเวอร์ชันของอีกฝ่ายและกลับมาบันทึกอัตโนมัติ คัดลอกสิ่งที่คุณต้องการเก็บไว้ก่อน",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "มีผู้อื่นบันทึกรายการนี้ขณะที่คุณกำลังแก้ไข — คุณทำงานจาก{basis} และตอนนี้ที่จัดเก็บอยู่คือ{current} การเปลี่ยนแปลงของคุณยังไม่ได้บันทึก และยังอยู่ในตัวแก้ไข การบันทึกอีกครั้งจะแทนที่เวอร์ชันของอีกฝ่าย",
    "the version you loaded": "เวอร์ชันที่คุณโหลดไว้",
    "a newer version": "เวอร์ชันที่ใหม่กว่า",
    "version {version}": "เวอร์ชัน {version}",
  },
  it: {
    "could not re-read the current version — your changes are still here, try again": "impossibile rileggere la versione corrente: le tue modifiche sono ancora qui, riprova",
    "failed to load page": "impossibile caricare la pagina",
    Saved: "Salvato",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Titolo, slug e stato sono stati salvati. Il contenuto di questa pagina utilizza l'editor di documenti e non può ancora essere modificato qui.",
    "failed to save page": "impossibile salvare la pagina",
    "failed to delete page": "impossibile eliminare la pagina",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Titolo, slug e stato sono stati salvati, ma il contenuto della pagina no. Il tuo contenuto è ancora qui — premi Salva per riprovare.",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "Qualcun altro ha salvato questo contenuto mentre lo stavi modificando: stavi lavorando a partire dalla versione {baseVersion}, quindi il salvataggio automatico è in pausa e nulla di ciò che digiti ora viene memorizzato. Le tue modifiche NON sono state salvate e sono ancora qui nell'editor. Ricarica per ottenere la sua versione e riprendere il salvataggio automatico; prima copia tutto ciò che vuoi conservare.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "Qualcun altro ha salvato questo contenuto mentre lo stavi modificando: la tua base era {basis}, e ora è memorizzata {current}. Le tue modifiche NON sono state salvate e sono ancora qui nell'editor. Salvando di nuovo sostituirai la sua versione.",
    "the version you loaded": "la versione che hai caricato",
    "a newer version": "una versione più recente",
    "version {version}": "la versione {version}",
  },
  hi: {
    "could not re-read the current version — your changes are still here, try again": "मौजूदा संस्करण दोबारा नहीं पढ़ा जा सका — आपके बदलाव यहीं हैं, फिर से कोशिश करें",
    "failed to load page": "पेज लोड नहीं हो सका",
    Saved: "सहेजा गया",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "शीर्षक, स्लग और स्थिति सहेज ली गई। इस पेज की सामग्री दस्तावेज़ संपादक का उपयोग करती है और अभी यहाँ संपादित नहीं की जा सकती।",
    "failed to save page": "पेज सहेजा नहीं जा सका",
    "failed to delete page": "पेज हटाया नहीं जा सका",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "शीर्षक, स्लग और स्थिति सहेज ली गई, लेकिन पेज की सामग्री नहीं सहेजी गई। आपकी सामग्री अभी भी यहीं है — फिर से कोशिश करने के लिए सहेजें दबाएँ।",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "आपके संपादन के दौरान किसी और ने इसे सहेज लिया — आप संस्करण {baseVersion} से काम कर रहे थे, इसलिए ऑटोसेव रुक गया है और अब आप जो भी टाइप करेंगे वह संग्रहीत नहीं होगा। आपके बदलाव सहेजे नहीं गए हैं, और वे अभी भी यहीं संपादक में हैं। उनका संस्करण पाने और ऑटोसेव फिर से शुरू करने के लिए रीलोड करें; जो कुछ रखना चाहते हैं उसे पहले कॉपी कर लें।",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "आपके संपादन के दौरान किसी और ने इसे सहेज लिया — आप {basis} से काम कर रहे थे, और अब {current} संग्रहीत है। आपके बदलाव सहेजे नहीं गए हैं, और वे अभी भी यहीं संपादक में हैं। फिर से सहेजने पर उनका संस्करण बदल जाएगा।",
    "the version you loaded": "आपके द्वारा लोड किया गया संस्करण",
    "a newer version": "एक नया संस्करण",
    "version {version}": "संस्करण {version}",
  },
  ur: {
    "could not re-read the current version — your changes are still here, try again": "موجودہ ورژن دوبارہ نہیں پڑھا جا سکا — آپ کی تبدیلیاں یہیں موجود ہیں، دوبارہ کوشش کریں",
    "failed to load page": "صفحہ لوڈ نہیں ہو سکا",
    Saved: "محفوظ ہو گیا",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "عنوان، سلگ اور اسٹیٹس محفوظ ہو گئے۔ اس صفحے کا مواد دستاویز ایڈیٹر استعمال کرتا ہے اور ابھی یہاں ترمیم نہیں کی جا سکتی۔",
    "failed to save page": "صفحہ محفوظ نہیں ہو سکا",
    "failed to delete page": "صفحہ حذف نہیں ہو سکا",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "عنوان، سلگ اور اسٹیٹس محفوظ ہو گئے، لیکن صفحے کا مواد محفوظ نہیں ہوا۔ آپ کا مواد اب بھی یہیں موجود ہے — دوبارہ کوشش کرنے کے لیے محفوظ کریں دبائیں۔",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "آپ کی ترمیم کے دوران کسی اور نے اسے محفوظ کر لیا — آپ ورژن {baseVersion} سے کام کر رہے تھے، اس لیے خودکار محفوظ کاری رک گئی ہے اور اب آپ جو کچھ ٹائپ کریں گے وہ محفوظ نہیں ہو گا۔ آپ کی تبدیلیاں محفوظ نہیں ہوئیں، اور ابھی بھی یہیں ایڈیٹر میں ہیں۔ ان کا ورژن حاصل کرنے اور خودکار محفوظ کاری دوبارہ شروع کرنے کے لیے دوبارہ لوڈ کریں؛ جو کچھ رکھنا چاہتے ہیں پہلے اسے کاپی کر لیں۔",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "آپ کی ترمیم کے دوران کسی اور نے اسے محفوظ کر لیا — آپ {basis} سے کام کر رہے تھے، اور اب {current} محفوظ ہے۔ آپ کی تبدیلیاں محفوظ نہیں ہوئیں، اور ابھی بھی یہیں ایڈیٹر میں ہیں۔ دوبارہ محفوظ کرنے سے ان کا ورژن تبدیل ہو جائے گا۔",
    "the version you loaded": "آپ کا لوڈ کردہ ورژن",
    "a newer version": "ایک نیا ورژن",
    "version {version}": "ورژن {version}",
  },
  bn: {
    "could not re-read the current version — your changes are still here, try again": "বর্তমান সংস্করণ আবার পড়া যায়নি — আপনার পরিবর্তনগুলি এখানেই আছে, আবার চেষ্টা করুন",
    "failed to load page": "পেজ লোড করা যায়নি",
    Saved: "সংরক্ষিত হয়েছে",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "শিরোনাম, স্লাগ এবং স্ট্যাটাস সংরক্ষিত হয়েছে। এই পেজের বিষয়বস্তু ডকুমেন্ট এডিটর ব্যবহার করে এবং এখনও এখানে সম্পাদনা করা যায় না।",
    "failed to save page": "পেজ সংরক্ষণ করা যায়নি",
    "failed to delete page": "পেজ মুছে ফেলা যায়নি",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "শিরোনাম, স্লাগ এবং স্ট্যাটাস সংরক্ষিত হয়েছে, কিন্তু পেজের বিষয়বস্তু সংরক্ষিত হয়নি। আপনার বিষয়বস্তু এখনও এখানে আছে — আবার চেষ্টা করতে সংরক্ষণ করুন চাপুন।",
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.": "আপনি সম্পাদনা করার সময় অন্য কেউ এটি সংরক্ষণ করেছেন — আপনি সংস্করণ {baseVersion} থেকে কাজ করছিলেন, তাই স্বয়ংক্রিয় সংরক্ষণ থেমে আছে এবং এখন আপনি যা টাইপ করবেন তা সংরক্ষিত হবে না। আপনার পরিবর্তনগুলো সংরক্ষিত হয়নি, এবং এখনও এখানে সম্পাদকে আছে। তাদের সংস্করণ পেতে এবং স্বয়ংক্রিয় সংরক্ষণ আবার চালু করতে রিলোড করুন; যা রাখতে চান তা আগে কপি করে নিন।",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.": "আপনি সম্পাদনা করার সময় অন্য কেউ এটি সংরক্ষণ করেছেন — আপনি {basis} থেকে কাজ করছিলেন, এবং এখন {current} সংরক্ষিত আছে। আপনার পরিবর্তনগুলো সংরক্ষিত হয়নি, এবং এখনও এখানে সম্পাদকে আছে। আবার সংরক্ষণ করলে তাদের সংস্করণ প্রতিস্থাপিত হবে।",
    "the version you loaded": "আপনার লোড করা সংস্করণ",
    "a newer version": "একটি নতুন সংস্করণ",
    "version {version}": "সংস্করণ {version}",
  },
};

export const PAGE_EDITOR_DICT = PAGE_EDITOR_HOOK_DICT;

const hookT = createDictionaryTranslator(PAGE_EDITOR_DICT);
const markupT = createDictionaryTranslator(pageEditorMarkupTranslations);
const controlT = createDictionaryTranslator(pageEditorControlTranslations);
const markupKeys = new Set(Object.keys(pageEditorMarkupTranslations.es));

/**
 * The Page editor owns its hook/error dictionary while reusing the established Posts editor
 * translator for identical editor controls. No raw locale dictionary is read here: each source
 * dictionary is consumed only by the translator exported from its own module.
 */
export function t(locale: string, key: string): string {
  if (postEditorKeys.has(key as never)) return postT(locale, key);
  if (["Move", "Desktop", "Tablet", "Mobile", "Interactive", "Preview"].includes(key)) return controlT(locale, key);
  if (markupKeys.has(key)) return markupT(locale, key);
  return hookT(locale, key);
}
