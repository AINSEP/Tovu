/**
 * @file Spanish translation for the Themes screen (`Themes.tsx`) — this feature's
 * own dictionary, not the shared `lib/admin-nav-i18n.ts` one, so parallel translation passes over
 * other admin sections can't collide on the same file. Same two-step fallback every other `t()` in
 * this app uses: translated value, else the English source string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const THEMES_DICT: Record<string, Record<string, string>> = {
  es: {
    "← All themes": "← Todos los temas",
    Download: "Descargar",
    "Downloading…": "Descargando…",
    Declarative: "Declarativo",
    Templated: "Basado en plantillas",
    Static: "Estático",
    Code: "Código",
    Studio: "Estudio",
    Themes: "Temas",
    "The active theme controls what visitors see across the entire public site.":
      "El tema activo controla lo que ven los visitantes en todo el sitio público.",
    "View site ↗": "Ver sitio ↗",
    Explore: "Explorar",
    Modified: "Modificado",
    "Modified from the original": "Modificado respecto al original",
    "Rescan themes": "Volver a escanear temas",
    "Rescanning…": "Escaneando…",
    "Loading themes…": "Cargando temas…",
    Active: "Activo",
    "Activating…": "Activando…",
    Activate: "Activar",
    "The official explainer — a landing page that documents Tovu itself.":
      "El explicador oficial: una página de inicio que documenta Tovu.",
    "A reading-first literary theme — serif type in a single column.":
      "Un tema literario enfocado en la lectura, con tipografía serif en una sola columna.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "Un blog de producto luminoso, con cabecera color cobalto y una cuadrícula de tarjetas redondeadas.",
    Publish: "Publicar",
    "Always published — theme home page": "Siempre publicada — página de inicio del tema",
    "Always published — error page": "Siempre publicada — página de error",
    "Not a standalone page — used as a content template":
      "No es una página independiente — se usa como plantilla de contenido",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "Indica si esta página tiene su propia URL activa en tu sitio. Las páginas del tema empiezan desactivadas, porque un tema incluye contenido genérico de ejemplo y no el tuyo. Activa una cuando la hayas hecho tuya.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "Un registro de contenido comparte la URL de esta página: {title}. Cuál de los dos gana depende del estado de publicación de esta página y de la opción de anulación de ese registro, no solo de este interruptor.",
    "Open {title}": "Abrir {title}",
  },
  id: {
    "← All themes": "← Semua tema",
    Download: "Unduh",
    "Downloading…": "Mengunduh…",
    Declarative: "Deklaratif",
    Templated: "Berbasis templat",
    Static: "Statis",
    Code: "Kode",
    Studio: "Studio",
    Themes: "Tema",
    "The active theme controls what visitors see across the entire public site.":
      "Tema aktif mengontrol apa yang dilihat pengunjung di seluruh situs publik.",
    "View site ↗": "Lihat situs ↗",
    Explore: "Jelajahi",
    Modified: "Diubah",
    "Modified from the original": "Diubah dari aslinya",
    "Rescan themes": "Pindai ulang tema",
    "Rescanning…": "Memindai…",
    "Loading themes…": "Memuat tema…",
    Active: "Aktif",
    "Activating…": "Mengaktifkan…",
    Activate: "Aktifkan",
    "The official explainer — a landing page that documents Tovu itself.":
      "Penjelas resmi — halaman landas yang mendokumentasikan Tovu itu sendiri.",
    "A reading-first literary theme — serif type in a single column.":
      "Tema sastra yang mengutamakan pembacaan — tipografi serif dalam satu kolom.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "Blog produk yang cerah — header berwarna kobalt dan tata letak kartu bersudut membulat.",
    Publish: "Terbitkan",
    "Always published — theme home page": "Selalu diterbitkan — halaman beranda tema",
    "Always published — error page": "Selalu diterbitkan — halaman error",
    "Not a standalone page — used as a content template":
      "Bukan halaman mandiri — digunakan sebagai templat konten",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "Menunjukkan apakah halaman ini memiliki URL publik sendiri di situs Anda. Halaman tema dimulai dalam keadaan nonaktif, karena tema berisi konten contoh yang umum, bukan milik Anda. Aktifkan setelah Anda menjadikannya milik Anda.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "Sebuah catatan konten berbagi URL halaman ini: {title}. Mana yang menang bergantung pada status penerbitan halaman ini dan pilihan penggantian (override) milik catatan itu sendiri, bukan hanya oleh sakelar ini.",
    "Open {title}": "Buka {title}",
  },
  de: {
    "← All themes": "← Alle Designs",
    Download: "Herunterladen",
    "Downloading…": "Wird heruntergeladen…",
    Declarative: "Deklarativ",
    Templated: "Vorlagenbasiert",
    Static: "Statisch",
    Code: "Code",
    Studio: "Studio",
    Themes: "Designs",
    "The active theme controls what visitors see across the entire public site.":
      "Das aktive Design bestimmt, was Besucher auf der gesamten öffentlichen Website sehen.",
    "View site ↗": "Website ansehen ↗",
    Explore: "Erkunden",
    Modified: "Geändert",
    "Modified from the original": "Gegenüber dem Original geändert",
    "Rescan themes": "Themes neu einlesen",
    "Rescanning…": "Wird eingelesen…",
    "Loading themes…": "Designs werden geladen…",
    Active: "Aktiv",
    "Activating…": "Wird aktiviert…",
    Activate: "Aktivieren",
    "The official explainer — a landing page that documents Tovu itself.":
      "Der offizielle Erklärer — eine Landingpage, die Tovu selbst dokumentiert.",
    "A reading-first literary theme — serif type in a single column.":
      "Ein leseorientiertes literarisches Design — Serifenschrift in einer einzigen Spalte.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "Ein helles Produkt-Blog — kobaltblaue Kopfzeile und ein Raster mit abgerundeten Karten.",
    Publish: "Veröffentlichen",
    "Always published — theme home page": "Immer veröffentlicht — Startseite des Designs",
    "Always published — error page": "Immer veröffentlicht — Fehlerseite",
    "Not a standalone page — used as a content template":
      "Keine eigenständige Seite — wird als Inhaltsvorlage verwendet",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "Ob diese Seite eine eigene öffentliche URL auf deiner Website hat. Theme-Seiten sind zunächst deaktiviert, da ein Theme allgemeine Platzhalterinhalte mitbringt und nicht deine. Aktiviere eine, sobald du sie zu deiner gemacht hast.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "Ein Content-Eintrag teilt sich die URL dieser Seite: {title}. Welcher davon gewinnt, hängt vom Veröffentlichungsstatus dieser Seite und der eigenen Override-Entscheidung dieses Eintrags ab, nicht allein von diesem Schalter.",
    "Open {title}": "{title} öffnen",
  },
  "zh-CN": {
    "← All themes": "← 所有主题",
    Download: "下载",
    "Downloading…": "正在下载…",
    Declarative: "声明式",
    Templated: "模板式",
    Static: "静态",
    Code: "代码",
    Studio: "工作室",
    Themes: "主题",
    "The active theme controls what visitors see across the entire public site.":
      "当前启用的主题决定访问者在整个公开网站上看到的内容。",
    "View site ↗": "查看网站 ↗",
    Explore: "浏览",
    Modified: "已修改",
    "Modified from the original": "与原始文件不同",
    "Rescan themes": "重新扫描主题",
    "Rescanning…": "正在扫描…",
    "Loading themes…": "正在加载主题…",
    Active: "已启用",
    "Activating…": "正在启用…",
    Activate: "启用",
    "The official explainer — a landing page that documents Tovu itself.":
      "官方说明主题——记录 Tovu 本身的着陆页。",
    "A reading-first literary theme — serif type in a single column.":
      "以阅读为先的文学主题——单栏衬线字体排版。",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "明亮的产品博客主题——钴蓝色页眉搭配圆角卡片网格。",
    Publish: "发布",
    "Always published — theme home page": "始终发布——主题首页",
    "Always published — error page": "始终发布——错误页面",
    "Not a standalone page — used as a content template": "非独立页面——用作内容模板",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "此页面是否在你的网站上拥有自己的公开网址。主题页面默认关闭，因为主题自带的是通用占位内容，而不是你的内容。当你把它改成自己的内容后再开启。",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "有一条内容记录与此页面共用同一个网址：{title}。最终由哪一个胜出，取决于此页面的发布状态和该记录自身的覆盖选择，而不仅仅是这个开关。",
    "Open {title}": "打开 {title}",
  },
  "zh-TW": {
    "← All themes": "← 所有佈景主題",
    Download: "下載",
    "Downloading…": "正在下載…",
    Declarative: "宣告式",
    Templated: "範本式",
    Static: "靜態",
    Code: "程式碼",
    Studio: "工作室",
    Themes: "佈景主題",
    "The active theme controls what visitors see across the entire public site.":
      "現行的佈景主題會決定訪客在整個公開網站上看到的內容。",
    "View site ↗": "檢視網站 ↗",
    Explore: "瀏覽",
    Modified: "已修改",
    "Modified from the original": "與原始檔案不同",
    "Rescan themes": "重新掃描佈景主題",
    "Rescanning…": "正在掃描…",
    "Loading themes…": "正在載入佈景主題…",
    Active: "已啟用",
    "Activating…": "正在啟用…",
    Activate: "啟用",
    "The official explainer — a landing page that documents Tovu itself.":
      "官方說明主題 — 記錄 Tovu 本身的到達頁面。",
    "A reading-first literary theme — serif type in a single column.":
      "以閱讀為優先的文學佈景主題 — 單欄襯線字型排版。",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "明亮的產品部落格佈景主題 — 鈷藍色頁首搭配圓角卡片網格。",
    Publish: "發布",
    "Always published — theme home page": "永遠發布 — 佈景主題首頁",
    "Always published — error page": "永遠發布 — 錯誤頁面",
    "Not a standalone page — used as a content template": "非獨立頁面 — 用作內容範本",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "此頁面是否在你的網站上擁有自己的公開網址。佈景主題頁面預設為關閉，因為佈景主題附帶的是通用預留內容，而不是你的內容。當你把它改成自己的內容後再開啟。",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "有一筆內容記錄與此頁面共用同一個網址：{title}。最終由哪一個勝出，取決於此頁面的發布狀態和該記錄自身的覆寫選擇，而不只是這個開關。",
    "Open {title}": "開啟 {title}",
  },
  "pt-BR": {
    "← All themes": "← Todos os temas",
    Download: "Baixar",
    "Downloading…": "Baixando…",
    Declarative: "Declarativo",
    Templated: "Baseado em modelo",
    Static: "Estático",
    Code: "Código",
    Studio: "Estúdio",
    Themes: "Temas",
    "The active theme controls what visitors see across the entire public site.":
      "O tema ativo controla o que os visitantes veem em todo o site público.",
    "View site ↗": "Ver site ↗",
    Explore: "Explorar",
    Modified: "Modificado",
    "Modified from the original": "Modificado em relação ao original",
    "Rescan themes": "Reexaminar temas",
    "Rescanning…": "Examinando…",
    "Loading themes…": "Carregando temas…",
    Active: "Ativo",
    "Activating…": "Ativando…",
    Activate: "Ativar",
    "The official explainer — a landing page that documents Tovu itself.":
      "O explicador oficial — uma landing page que documenta o próprio Tovu.",
    "A reading-first literary theme — serif type in a single column.":
      "Um tema literário focado na leitura — tipografia serifada em uma única coluna.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "Um blog de produto vibrante — cabeçalho azul-cobalto e uma grade de cartões arredondados.",
    Publish: "Publicar",
    "Always published — theme home page": "Sempre publicada — página inicial do tema",
    "Always published — error page": "Sempre publicada — página de erro",
    "Not a standalone page — used as a content template":
      "Não é uma página independente — usada como modelo de conteúdo",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "Se esta página tem a própria URL pública no seu site. As páginas do tema começam desativadas, porque um tema traz conteúdo genérico de exemplo, não o seu. Ative uma quando ela já for sua.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "Um registro de conteúdo compartilha a URL desta página: {title}. Qual dos dois vence depende do estado de publicação desta página e da própria escolha de substituição desse registro, não apenas deste botão.",
    "Open {title}": "Abrir {title}",
  },
  ru: {
    "← All themes": "← Все темы",
    Download: "Скачать",
    "Downloading…": "Скачивание…",
    Declarative: "Декларативный",
    Templated: "На основе шаблонов",
    Static: "Статический",
    Code: "Код",
    Studio: "Студия",
    Themes: "Темы",
    "The active theme controls what visitors see across the entire public site.":
      "Активная тема определяет, что посетители видят на всём публичном сайте.",
    "View site ↗": "Открыть сайт ↗",
    Explore: "Обзор",
    Modified: "Изменён",
    "Modified from the original": "Изменён по сравнению с оригиналом",
    "Rescan themes": "Пересканировать темы",
    "Rescanning…": "Сканирование…",
    "Loading themes…": "Загрузка тем…",
    Active: "Активна",
    "Activating…": "Активация…",
    Activate: "Активировать",
    "The official explainer — a landing page that documents Tovu itself.":
      "Официальный разъясняющий сайт — целевая страница, описывающая сам Tovu.",
    "A reading-first literary theme — serif type in a single column.":
      "Литературная тема, ориентированная на чтение — шрифт с засечками в одну колонку.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "Яркий блог о продукте — кобальтовая шапка и сетка карточек со скруглёнными углами.",
    Publish: "Публикация",
    "Always published — theme home page": "Всегда опубликована — главная страница темы",
    "Always published — error page": "Всегда опубликована — страница ошибки",
    "Not a standalone page — used as a content template":
      "Не отдельная страница — используется как шаблон контента",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "Есть ли у этой страницы собственный публичный URL на вашем сайте. Страницы темы по умолчанию отключены, поскольку тема содержит универсальный демонстрационный контент, а не ваш. Включите страницу, когда наполните её своим содержимым.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "Запись контента использует тот же URL, что и эта страница: {title}. Какая из них победит, зависит от статуса публикации этой страницы и собственного выбора переопределения этой записи, а не только от этого переключателя.",
    "Open {title}": "Открыть {title}",
  },
  fa: {
    "← All themes": "← همه پوسته‌ها",
    Download: "دانلود",
    "Downloading…": "در حال دانلود…",
    Declarative: "اعلانی",
    Templated: "مبتنی بر قالب",
    Static: "ایستا",
    Code: "کد",
    Studio: "استودیو",
    Themes: "پوسته‌ها",
    "The active theme controls what visitors see across the entire public site.":
      "پوسته فعال، آنچه بازدیدکنندگان در سراسر سایت عمومی می‌بینند را کنترل می‌کند.",
    "View site ↗": "مشاهده سایت ↗",
    Explore: "کاوش",
    Modified: "تغییریافته",
    "Modified from the original": "نسبت به نسخه اصلی تغییر کرده",
    "Rescan themes": "بازبینی پوسته‌ها",
    "Rescanning…": "در حال بررسی…",
    "Loading themes…": "در حال بارگذاری پوسته‌ها…",
    Active: "فعال",
    "Activating…": "در حال فعال‌سازی…",
    Activate: "فعال‌سازی",
    "The official explainer — a landing page that documents Tovu itself.":
      "توضیح‌دهنده رسمی — یک صفحه فرود که خود Tovu را مستند می‌کند.",
    "A reading-first literary theme — serif type in a single column.":
      "پوسته‌ای ادبی با اولویت خوانش — تایپوگرافی سریف در یک ستون.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "یک وبلاگ محصول روشن — سربرگ آبی کبالتی و شبکه‌ای از کارت‌های گردگوشه.",
    Publish: "انتشار",
    "Always published — theme home page": "همیشه منتشر شده — صفحه اصلی پوسته",
    "Always published — error page": "همیشه منتشر شده — صفحه خطا",
    "Not a standalone page — used as a content template":
      "صفحه‌ای مستقل نیست — به‌عنوان قالب محتوا استفاده می‌شود",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "اینکه آیا این صفحه نشانی اینترنتی زنده‌ی خودش را در سایت شما دارد. صفحه‌های پوسته به‌طور پیش‌فرض خاموش هستند، چون پوسته محتوای نمونه‌ی عمومی دارد نه محتوای شما. پس از آنکه صفحه را از آنِ خود کردید، آن را روشن کنید.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "یک رکورد محتوا همین نشانی این صفحه را دارد: {title}. اینکه کدام‌یک برنده می‌شود به وضعیت انتشار این صفحه و انتخاب لغو (override) خودِ آن رکورد بستگی دارد، نه فقط این کلید.",
    "Open {title}": "باز کردن {title}",
  },
  ar: {
    "← All themes": "← جميع القوالب",
    Download: "تنزيل",
    "Downloading…": "جارٍ التنزيل…",
    Declarative: "تصريحي",
    Templated: "قائم على القوالب",
    Static: "ثابت",
    Code: "كود",
    Studio: "الاستوديو",
    Themes: "القوالب",
    "The active theme controls what visitors see across the entire public site.":
      "يتحكم القالب النشط في ما يراه الزوار في جميع أنحاء الموقع العام.",
    "View site ↗": "عرض الموقع ↗",
    Explore: "استكشاف",
    Modified: "معدَّل",
    "Modified from the original": "معدَّل عن النسخة الأصلية",
    "Rescan themes": "إعادة فحص السمات",
    "Rescanning…": "جارٍ الفحص…",
    "Loading themes…": "جارٍ تحميل القوالب…",
    Active: "نشط",
    "Activating…": "جارٍ التفعيل…",
    Activate: "تفعيل",
    "The official explainer — a landing page that documents Tovu itself.":
      "الشارح الرسمي — صفحة هبوط توثّق Tovu نفسها.",
    "A reading-first literary theme — serif type in a single column.":
      "قالب أدبي يُعطي الأولوية للقراءة — خط ذو زوائد (serif) في عمود واحد.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "مدونة منتج مشرقة — رأس صفحة بلون الكوبالت وشبكة بطاقات بزوايا مستديرة.",
    Publish: "نشر",
    "Always published — theme home page": "منشورة دائمًا — الصفحة الرئيسية للقالب",
    "Always published — error page": "منشورة دائمًا — صفحة الخطأ",
    "Not a standalone page — used as a content template":
      "ليست صفحة مستقلة — تُستخدم كقالب محتوى",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "ما إذا كانت هذه الصفحة تملك عنوان URL مباشرًا خاصًا بها على موقعك. صفحات القالب تبدأ متوقفة، لأن القالب يأتي بمحتوى عام مؤقت وليس محتواك. فعّلها بعد أن تجعلها خاصة بك.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "يشارك سجل محتوى نفس عنوان URL الخاص بهذه الصفحة: {title}. من يفوز يعتمد على حالة نشر هذه الصفحة وخيار التجاوز الخاص بذلك السجل، وليس على هذا المفتاح وحده.",
    "Open {title}": "فتح {title}",
  },
  ja: {
    "← All themes": "← すべてのテーマ",
    Download: "ダウンロード",
    "Downloading…": "ダウンロード中…",
    Explore: "閲覧",
    Modified: "変更済み",
    "Modified from the original": "元のファイルから変更されています",
    Declarative: "宣言的",
    Templated: "テンプレート",
    Static: "静的",
    Code: "コード",
    Studio: "スタジオ",
    Themes: "テーマ",
    "The active theme controls what visitors see across the entire public site.":
      "有効なテーマが、公開サイト全体で訪問者に表示される内容を決定します。",
    "View site ↗": "サイトを表示 ↗",
    "Loading themes…": "テーマを読み込み中…",
    Active: "有効",
    "Activating…": "有効化中…",
    Activate: "有効化",
    "The official explainer — a landing page that documents Tovu itself.":
      "公式解説サイト — Tovu自体を紹介するランディングページです。",
    "A reading-first literary theme — serif type in a single column.":
      "読書を重視した文芸系テーマ — シングルカラムのセリフ書体を採用しています。",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "明るいプロダクトブログ系テーマ — コバルトブルーのヘッダーと角丸カードのグリッドが特徴です。",
    Publish: "公開",
    "Always published — theme home page": "常に公開 — テーマのホームページ",
    "Always published — error page": "常に公開 — エラーページ",
    "Not a standalone page — used as a content template":
      "独立したページではありません — コンテンツテンプレートとして使用されます",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "このページがサイト上に独自の公開URLを持つかどうか。テーマのページは既定でオフです。テーマにはあなたの内容ではなく汎用のサンプル内容が入っているためです。自分の内容にしてからオンにしてください。",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "コンテンツレコード「{title}」がこのページと同じURLを共有しています。どちらが実際に表示されるかは、このページの公開状態とそのレコード自身の上書き設定によって決まり、このスイッチだけでは決まりません。",
    "Open {title}": "{title} を開く",
  },
  ko: {
    "← All themes": "← 모든 테마",
    Download: "다운로드",
    "Downloading…": "다운로드 중…",
    Explore: "둘러보기",
    Modified: "수정됨",
    "Modified from the original": "원본에서 수정됨",
    Declarative: "선언형",
    Templated: "템플릿 기반",
    Static: "정적",
    Code: "코드",
    Studio: "스튜디오",
    Themes: "테마",
    "The active theme controls what visitors see across the entire public site.":
      "활성 테마가 전체 공개 사이트에서 방문자에게 표시되는 내용을 제어합니다.",
    "View site ↗": "사이트 보기 ↗",
    "Loading themes…": "테마를 불러오는 중…",
    Active: "활성",
    "Activating…": "활성화 중…",
    Activate: "활성화",
    "The official explainer — a landing page that documents Tovu itself.":
      "공식 소개 테마 — Tovu 자체를 소개하는 랜딩 페이지입니다.",
    "A reading-first literary theme — serif type in a single column.":
      "읽기를 우선하는 문학적 테마 — 단일 칼럼의 세리프 서체를 사용합니다.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "밝은 프로덕트 블로그 테마 — 코발트블루 헤더와 둥근 카드 그리드가 특징입니다.",
    Publish: "게시",
    "Always published — theme home page": "항상 게시됨 — 테마 홈페이지",
    "Always published — error page": "항상 게시됨 — 오류 페이지",
    "Not a standalone page — used as a content template":
      "독립된 페이지가 아님 — 콘텐츠 템플릿으로 사용됨",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "이 페이지가 사이트에서 자체 공개 URL을 갖는지 여부입니다. 테마 페이지는 기본적으로 꺼져 있습니다. 테마에는 내 콘텐츠가 아니라 일반적인 예시 콘텐츠가 들어 있기 때문입니다. 내 콘텐츠로 바꾼 뒤에 켜세요.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "콘텐츠 레코드 “{title}”이(가) 이 페이지와 동일한 URL을 공유합니다. 어느 쪽이 실제로 표시되는지는 이 페이지의 게시 상태와 해당 레코드 자체의 재정의 선택에 따라 달라지며, 이 스위치만으로 결정되지 않습니다.",
    "Open {title}": "{title} 열기",
  },
  pl: {
    "← All themes": "← Wszystkie motywy",
    Download: "Pobierz",
    "Downloading…": "Pobieranie…",
    Explore: "Przeglądaj",
    Modified: "Zmodyfikowany",
    "Modified from the original": "Zmodyfikowany względem oryginału",
    Declarative: "Deklaratywny",
    Templated: "Oparty na szablonach",
    Static: "Statyczny",
    Code: "Kod",
    Studio: "Studio",
    Themes: "Motywy",
    "The active theme controls what visitors see across the entire public site.":
      "Aktywny motyw decyduje o tym, co widzą odwiedzający w całej publicznej witrynie.",
    "View site ↗": "Zobacz witrynę ↗",
    "Loading themes…": "Wczytywanie motywów…",
    Active: "Aktywny",
    "Activating…": "Aktywowanie…",
    Activate: "Aktywuj",
    "The official explainer — a landing page that documents Tovu itself.":
      "Oficjalna strona objaśniająca — strona docelowa dokumentująca samo Tovu.",
    "A reading-first literary theme — serif type in a single column.":
      "Motyw literacki nastawiony na czytanie — krój szeryfowy w jednej kolumnie.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "Jasny blog produktowy — kobaltowy nagłówek i siatka zaokrąglonych kart.",
    Publish: "Publikuj",
    "Always published — theme home page": "Zawsze opublikowana — strona główna motywu",
    "Always published — error page": "Zawsze opublikowana — strona błędu",
    "Not a standalone page — used as a content template":
      "Nie jest samodzielną stroną — używana jako szablon treści",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "Czy ta strona ma własny publiczny adres URL w Twojej witrynie. Strony motywu są domyślnie wyłączone, ponieważ motyw zawiera ogólną treść zastępczą, a nie Twoją. Włącz stronę, gdy stanie się już Twoja.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "Rekord treści współdzieli adres URL z tą stroną: {title}. To, który z nich wygrywa, zależy od stanu publikacji tej strony oraz własnego wyboru zastąpienia tego rekordu, a nie tylko od tego przełącznika.",
    "Open {title}": "Otwórz {title}",
  },
  hu: {
    "← All themes": "← Összes téma",
    Download: "Letöltés",
    "Downloading…": "Letöltés…",
    Explore: "Böngészés",
    Modified: "Módosítva",
    "Modified from the original": "Az eredetihez képest módosítva",
    Declarative: "Deklaratív",
    Templated: "Sablonalapú",
    Static: "Statikus",
    Code: "Kód",
    Studio: "Stúdió",
    Themes: "Témák",
    "The active theme controls what visitors see across the entire public site.":
      "Az aktív téma határozza meg, mit látnak a látogatók a teljes nyilvános webhelyen.",
    "View site ↗": "Webhely megtekintése ↗",
    "Loading themes…": "Témák betöltése…",
    Active: "Aktív",
    "Activating…": "Aktiválás…",
    Activate: "Aktiválás",
    "The official explainer — a landing page that documents Tovu itself.":
      "A hivatalos bemutatóoldal — egy céloldal, amely magát a Tovut mutatja be.",
    "A reading-first literary theme — serif type in a single column.":
      "Olvasásközpontú irodalmi téma — talpas betűtípus egyetlen oszlopban.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "Egy világos, termékbemutató blog téma — kobaltkék fejléc és lekerekített kártyarács.",
    Publish: "Közzététel",
    "Always published — theme home page": "Mindig közzétéve — a téma kezdőlapja",
    "Always published — error page": "Mindig közzétéve — hibaoldal",
    "Not a standalone page — used as a content template":
      "Nem önálló oldal — tartalomsablonként használva",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "Van-e ennek az oldalnak saját élő URL-je a webhelyeden. A sablon oldalai alapértelmezés szerint ki vannak kapcsolva, mert a sablon általános helykitöltő tartalmat hoz magával, nem a tiédet. Kapcsold be, ha már a sajátoddá tetted.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "Egy tartalomrekord osztozik ennek az oldalnak az URL-jén: {title}. Hogy melyik nyer, az az oldal közzétételi állapotától és a rekord saját felülbírálási választásától függ, nem csak ettől a kapcsolótól.",
    "Open {title}": "{title} megnyitása",
  },
  fr: {
    "← All themes": "← Tous les thèmes",
    Download: "Télécharger",
    "Downloading…": "Téléchargement…",
    Explore: "Explorer",
    Modified: "Modifié",
    "Modified from the original": "Modifié par rapport à l'original",
    Declarative: "Déclaratif",
    Templated: "Basé sur des modèles",
    Static: "Statique",
    Code: "Code",
    Studio: "Studio",
    Themes: "Thèmes",
    "The active theme controls what visitors see across the entire public site.":
      "Le thème actif détermine ce que les visiteurs voient sur l'ensemble du site public.",
    "View site ↗": "Voir le site ↗",
    "Loading themes…": "Chargement des thèmes…",
    Active: "Actif",
    "Activating…": "Activation…",
    Activate: "Activer",
    "The official explainer — a landing page that documents Tovu itself.":
      "L'explicatif officiel — une page d'atterrissage qui documente Tovu lui-même.",
    "A reading-first literary theme — serif type in a single column.":
      "Un thème littéraire axé sur la lecture — police à empattements sur une seule colonne.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "Un blog produit lumineux — bandeau bleu cobalt et une grille de cartes aux coins arrondis.",
    Publish: "Publier",
    "Always published — theme home page": "Toujours publiée — page d'accueil du thème",
    "Always published — error page": "Toujours publiée — page d'erreur",
    "Not a standalone page — used as a content template":
      "Pas une page autonome — utilisée comme modèle de contenu",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "Indique si cette page possède sa propre URL publique sur votre site. Les pages du thème sont désactivées par défaut, car un thème fournit un contenu générique d'exemple et non le vôtre. Activez-en une une fois que vous l'avez faite vôtre.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "Un contenu partage l'URL de cette page : {title}. Celui qui l'emporte dépend de l'état de publication de cette page et du choix de remplacement propre à ce contenu, pas uniquement de cet interrupteur.",
    "Open {title}": "Ouvrir {title}",
  },
  uk: {
    "← All themes": "← Усі теми",
    Download: "Завантажити",
    "Downloading…": "Завантаження…",
    Explore: "Огляд",
    Modified: "Змінено",
    "Modified from the original": "Змінено порівняно з оригіналом",
    Declarative: "Декларативний",
    Templated: "На основі шаблонів",
    Static: "Статичний",
    Code: "Код",
    Studio: "Студія",
    Themes: "Теми",
    "The active theme controls what visitors see across the entire public site.":
      "Активна тема визначає, що бачать відвідувачі на всьому публічному сайті.",
    "View site ↗": "Переглянути сайт ↗",
    "Loading themes…": "Завантаження тем…",
    Active: "Активна",
    "Activating…": "Активація…",
    Activate: "Активувати",
    "The official explainer — a landing page that documents Tovu itself.":
      "Офіційна пояснювальна тема — цільова сторінка, що описує сам Tovu.",
    "A reading-first literary theme — serif type in a single column.":
      "Літературна тема, орієнтована на читання — шрифт із засічками в одній колонці.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "Яскравий блог про продукт — кобальтовий заголовок і сітка карток із заокругленими кутами.",
    Publish: "Публікація",
    "Always published — theme home page": "Завжди опублікована — головна сторінка теми",
    "Always published — error page": "Завжди опублікована — сторінка помилки",
    "Not a standalone page — used as a content template":
      "Не окрема сторінка — використовується як шаблон контенту",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "Чи має ця сторінка власну публічну URL-адресу на вашому сайті. Сторінки теми типово вимкнені, бо тема містить загальний демонстраційний вміст, а не ваш. Увімкніть сторінку, коли наповните її своїм вмістом.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "Запис контенту використовує ту саму URL-адресу, що й ця сторінка: {title}. Хто з них переможе, залежить від стану публікації цієї сторінки та власного вибору перевизначення цього запису, а не лише від цього перемикача.",
    "Open {title}": "Відкрити {title}",
  },
  tr: {
    "← All themes": "← Tüm temalar",
    Download: "İndir",
    "Downloading…": "İndiriliyor…",
    Explore: "Keşfet",
    Modified: "Değiştirildi",
    "Modified from the original": "Orijinalinden değiştirildi",
    Declarative: "Bildirimsel",
    Templated: "Şablon tabanlı",
    Static: "Statik",
    Code: "Kod",
    Studio: "Stüdyo",
    Themes: "Temalar",
    "The active theme controls what visitors see across the entire public site.":
      "Etkin tema, ziyaretçilerin genel sitenin tamamında gördüklerini belirler.",
    "View site ↗": "Siteyi görüntüle ↗",
    "Loading themes…": "Temalar yükleniyor…",
    Active: "Etkin",
    "Activating…": "Etkinleştiriliyor…",
    Activate: "Etkinleştir",
    "The official explainer — a landing page that documents Tovu itself.":
      "Resmi tanıtım teması — Tovu'nun kendisini anlatan bir açılış sayfası.",
    "A reading-first literary theme — serif type in a single column.":
      "Okumaya öncelik veren edebi bir tema — tek sütunda serif yazı tipi.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "Canlı bir ürün blogu teması — kobalt renkli üst bilgi ve yuvarlatılmış kart ızgarası.",
    Publish: "Yayınla",
    "Always published — theme home page": "Her zaman yayında — tema ana sayfası",
    "Always published — error page": "Her zaman yayında — hata sayfası",
    "Not a standalone page — used as a content template":
      "Bağımsız bir sayfa değil — içerik şablonu olarak kullanılıyor",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "Bu sayfanın sitenizde kendi yayında URL'si olup olmadığı. Tema sayfaları varsayılan olarak kapalıdır, çünkü tema sizin içeriğinizi değil genel örnek içerik getirir. Kendinize ait hale getirdikten sonra açın.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "Bir içerik kaydı bu sayfayla aynı URL'yi paylaşıyor: {title}. Hangisinin kazanacağı, bu sayfanın yayın durumuna ve o kaydın kendi geçersiz kılma seçimine bağlıdır, yalnızca bu anahtara değil.",
    "Open {title}": "{title} öğesini aç",
  },
  th: {
    "← All themes": "← ธีมทั้งหมด",
    Download: "ดาวน์โหลด",
    "Downloading…": "กำลังดาวน์โหลด…",
    Explore: "สำรวจ",
    Modified: "แก้ไขแล้ว",
    "Modified from the original": "แก้ไขแล้วจากต้นฉบับ",
    Declarative: "เชิงประกาศ",
    Templated: "อิงเทมเพลต",
    Static: "แบบคงที่",
    Code: "โค้ด",
    Studio: "สตูดิโอ",
    Themes: "ธีม",
    "The active theme controls what visitors see across the entire public site.":
      "ธีมที่ใช้งานอยู่จะกำหนดสิ่งที่ผู้เยี่ยมชมเห็นทั่วทั้งเว็บไซต์สาธารณะ",
    "View site ↗": "ดูเว็บไซต์ ↗",
    "Loading themes…": "กำลังโหลดธีม…",
    Active: "ใช้งานอยู่",
    "Activating…": "กำลังเปิดใช้งาน…",
    Activate: "เปิดใช้งาน",
    "The official explainer — a landing page that documents Tovu itself.":
      "ธีมอธิบายอย่างเป็นทางการ — แลนดิงเพจที่อธิบาย Tovu เอง",
    "A reading-first literary theme — serif type in a single column.":
      "ธีมวรรณกรรมที่เน้นการอ่าน — ตัวอักษรเซอริฟในคอลัมน์เดียว",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "ธีมบล็อกผลิตภัณฑ์ที่สดใส — ส่วนหัวสีโคบอลต์และตารางการ์ดมุมโค้ง",
    Publish: "เผยแพร่",
    "Always published — theme home page": "เผยแพร่เสมอ — หน้าแรกของธีม",
    "Always published — error page": "เผยแพร่เสมอ — หน้าข้อผิดพลาด",
    "Not a standalone page — used as a content template":
      "ไม่ใช่หน้าอิสระ — ใช้เป็นเทมเพลตเนื้อหา",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "หน้านี้มี URL สาธารณะของตัวเองบนเว็บไซต์ของคุณหรือไม่ หน้าของธีมจะปิดไว้ตั้งแต่แรก เพราะธีมมาพร้อมเนื้อหาตัวอย่างทั่วไป ไม่ใช่เนื้อหาของคุณ เปิดใช้งานเมื่อคุณทำให้เป็นของคุณแล้ว",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "มีระเบียนเนื้อหาใช้ URL เดียวกันกับหน้านี้: {title} ฝ่ายใดจะเป็นฝ่ายที่แสดงจริงขึ้นอยู่กับสถานะการเผยแพร่ของหน้านี้และตัวเลือกการแทนที่ของระเบียนนั้นเอง ไม่ใช่แค่สวิตช์นี้เพียงอย่างเดียว",
    "Open {title}": "เปิด {title}",
  },
  it: {
    "← All themes": "← Tutti i temi",
    Download: "Scarica",
    "Downloading…": "Download in corso…",
    Explore: "Esplora",
    Modified: "Modificato",
    "Modified from the original": "Modificato rispetto all'originale",
    Declarative: "Dichiarativo",
    Templated: "Basato su modelli",
    Static: "Statico",
    Code: "Codice",
    Studio: "Studio",
    Themes: "Temi",
    "The active theme controls what visitors see across the entire public site.":
      "Il tema attivo controlla ciò che i visitatori vedono in tutto il sito pubblico.",
    "View site ↗": "Visualizza sito ↗",
    "Loading themes…": "Caricamento temi…",
    Active: "Attivo",
    "Activating…": "Attivazione…",
    Activate: "Attiva",
    "The official explainer — a landing page that documents Tovu itself.":
      "Il tema esplicativo ufficiale — una landing page che documenta Tovu stesso.",
    "A reading-first literary theme — serif type in a single column.":
      "Un tema letterario incentrato sulla lettura — carattere serif su una singola colonna.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "Un blog di prodotto luminoso — intestazione blu cobalto e una griglia di card con angoli arrotondati.",
    Publish: "Pubblica",
    "Always published — theme home page": "Sempre pubblicata — home page del tema",
    "Always published — error page": "Sempre pubblicata — pagina di errore",
    "Not a standalone page — used as a content template":
      "Non è una pagina autonoma — usata come modello di contenuto",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "Indica se questa pagina ha un proprio URL pubblico sul tuo sito. Le pagine del tema partono disattivate, perché un tema include contenuti generici di esempio e non i tuoi. Attivane una quando l'hai resa tua.",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "Un record di contenuto condivide l'URL di questa pagina: {title}. Chi prevale dipende dallo stato di pubblicazione di questa pagina e dalla scelta di sostituzione propria di quel record, non solo da questo interruttore.",
    "Open {title}": "Apri {title}",
  },
  hi: {
    "← All themes": "← सभी थीम",
    Download: "डाउनलोड करें",
    "Downloading…": "डाउनलोड हो रहा है…",
    Explore: "एक्सप्लोर करें",
    Modified: "संशोधित",
    "Modified from the original": "मूल से संशोधित",
    Declarative: "घोषणात्मक",
    Templated: "टेम्पलेट-आधारित",
    Static: "स्थिर",
    Code: "कोड",
    Studio: "स्टूडियो",
    Themes: "थीम",
    "The active theme controls what visitors see across the entire public site.":
      "सक्रिय थीम यह नियंत्रित करती है कि विज़िटर्स को पूरी सार्वजनिक साइट पर क्या दिखाई देता है।",
    "View site ↗": "साइट देखें ↗",
    "Loading themes…": "थीम लोड हो रही हैं…",
    Active: "सक्रिय",
    "Activating…": "सक्रिय किया जा रहा है…",
    Activate: "सक्रिय करें",
    "The official explainer — a landing page that documents Tovu itself.":
      "आधिकारिक व्याख्याता — एक लैंडिंग पेज जो स्वयं Tovu का दस्तावेज़ीकरण करता है।",
    "A reading-first literary theme — serif type in a single column.":
      "पठन-प्रधान साहित्यिक थीम — एक ही कॉलम में सेरिफ़ टाइप।",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "एक जीवंत प्रोडक्ट-ब्लॉग — कोबाल्ट रंग का मास्टहेड और गोल कोनों वाला कार्ड ग्रिड।",
    Publish: "प्रकाशित करें",
    "Always published — theme home page": "हमेशा प्रकाशित — थीम का होम पेज",
    "Always published — error page": "हमेशा प्रकाशित — एरर पेज",
    "Not a standalone page — used as a content template":
      "स्वतंत्र पेज नहीं — कंटेंट टेम्पलेट के रूप में उपयोग किया जाता है",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "क्या इस पृष्ठ का आपकी साइट पर अपना लाइव URL है। थीम के पृष्ठ डिफ़ॉल्ट रूप से बंद रहते हैं, क्योंकि थीम में आपकी नहीं, बल्कि सामान्य नमूना सामग्री होती है। जब आप इसे अपना बना लें, तब इसे चालू करें।",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "एक कंटेंट रिकॉर्ड इस पेज के समान URL साझा करता है: {title}। कौन जीतता है यह इस पेज की प्रकाशन स्थिति और उस रिकॉर्ड की अपनी ओवरराइड पसंद पर निर्भर करता है, केवल इस स्विच पर नहीं।",
    "Open {title}": "{title} खोलें",
  },
  ur: {
    "← All themes": "← تمام تھیمز",
    Download: "ڈاؤن لوڈ کریں",
    "Downloading…": "ڈاؤن لوڈ ہو رہا ہے…",
    Explore: "دریافت کریں",
    Modified: "ترمیم شدہ",
    "Modified from the original": "اصل سے ترمیم شدہ",
    Declarative: "اعلانی",
    Templated: "ٹیمپلیٹ پر مبنی",
    Static: "جامد",
    Code: "کوڈ",
    Studio: "اسٹوڈیو",
    Themes: "تھیمز",
    "The active theme controls what visitors see across the entire public site.":
      "فعال تھیم یہ طے کرتی ہے کہ زائرین پوری عوامی سائٹ پر کیا دیکھتے ہیں۔",
    "View site ↗": "سائٹ دیکھیں ↗",
    "Loading themes…": "تھیمز لوڈ ہو رہی ہیں…",
    Active: "فعال",
    "Activating…": "فعال کیا جا رہا ہے…",
    Activate: "فعال کریں",
    "The official explainer — a landing page that documents Tovu itself.":
      "سرکاری وضاحتی تھیم — ایک لینڈنگ پیج جو خود Tovu کو دستاویزی شکل دیتا ہے۔",
    "A reading-first literary theme — serif type in a single column.":
      "مطالعے کو ترجیح دینے والی ادبی تھیم — ایک ہی کالم میں سیرف ٹائپ۔",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "ایک روشن پروڈکٹ بلاگ — کوبالٹ رنگ کا ہیڈر اور گول کونوں والے کارڈز کا گرڈ۔",
    Publish: "شائع کریں",
    "Always published — theme home page": "ہمیشہ شائع شدہ — تھیم کا ہوم پیج",
    "Always published — error page": "ہمیشہ شائع شدہ — ایرر پیج",
    "Not a standalone page — used as a content template":
      "ایک آزاد صفحہ نہیں — مواد کے ٹیمپلیٹ کے طور پر استعمال ہوتا ہے",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "آیا اس صفحے کا آپ کی سائٹ پر اپنا لائیو URL ہے۔ تھیم کے صفحات بطور طے شدہ بند ہوتے ہیں، کیونکہ تھیم میں آپ کا نہیں بلکہ عام نمونہ مواد ہوتا ہے۔ جب آپ اسے اپنا بنا لیں تو اسے آن کریں۔",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "ایک کنٹینٹ ریکارڈ اس صفحے کے ساتھ وہی URL شیئر کرتا ہے: {title}۔ کون سا حاوی ہوتا ہے یہ اس صفحے کی اشاعت کی حالت اور اس ریکارڈ کے اپنے اوور رائیڈ انتخاب پر منحصر ہے، صرف اس سوئچ پر نہیں۔",
    "Open {title}": "{title} کھولیں",
  },
  bn: {
    "← All themes": "← সব থিম",
    Download: "ডাউনলোড করুন",
    "Downloading…": "ডাউনলোড হচ্ছে…",
    Explore: "অন্বেষণ করুন",
    Modified: "পরিবর্তিত",
    "Modified from the original": "মূল থেকে পরিবর্তিত",
    Declarative: "ঘোষণামূলক",
    Templated: "টেমপ্লেট-ভিত্তিক",
    Static: "স্ট্যাটিক",
    Code: "কোড",
    Studio: "স্টুডিও",
    Themes: "থিম",
    "The active theme controls what visitors see across the entire public site.":
      "সক্রিয় থিম নির্ধারণ করে যে দর্শনার্থীরা পুরো পাবলিক সাইট জুড়ে কী দেখতে পান।",
    "View site ↗": "সাইট দেখুন ↗",
    "Loading themes…": "থিম লোড হচ্ছে…",
    Active: "সক্রিয়",
    "Activating…": "সক্রিয় করা হচ্ছে…",
    Activate: "সক্রিয় করুন",
    "The official explainer — a landing page that documents Tovu itself.":
      "অফিসিয়াল ব্যাখ্যামূলক থিম — একটি ল্যান্ডিং পেজ যা নিজেই Tovu-কে নথিভুক্ত করে।",
    "A reading-first literary theme — serif type in a single column.":
      "পঠন-কেন্দ্রিক সাহিত্যিক থিম — একক কলামে সেরিফ টাইপ।",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "একটি উজ্জ্বল প্রোডাক্ট-ব্লগ — কোবাল্ট রঙের হেডার এবং গোলাকার কোণাযুক্ত কার্ড গ্রিড।",
    Publish: "প্রকাশ করুন",
    "Always published — theme home page": "সর্বদা প্রকাশিত — থিমের হোম পেজ",
    "Always published — error page": "সর্বদা প্রকাশিত — এরর পেজ",
    "Not a standalone page — used as a content template":
      "স্বতন্ত্র পেজ নয় — কন্টেন্ট টেমপ্লেট হিসেবে ব্যবহৃত হয়",
    "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.":
      "এই পৃষ্ঠাটির আপনার সাইটে নিজস্ব লাইভ URL আছে কিনা। থিমের পৃষ্ঠাগুলি ডিফল্টভাবে বন্ধ থাকে, কারণ থিমে আপনার নয়, সাধারণ নমুনা বিষয়বস্তু থাকে। নিজের মতো করে নেওয়ার পর সেটি চালু করুন।",
    "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone.":
      "একটি কনটেন্ট রেকর্ড এই পৃষ্ঠার সাথে একই URL শেয়ার করে: {title}। কোনটি জিতবে তা নির্ভর করে এই পৃষ্ঠার প্রকাশনার অবস্থা এবং সেই রেকর্ডের নিজস্ব ওভাররাইড পছন্দের উপর, শুধু এই সুইচের উপর নয়।",
    "Open {title}": "{title} খুলুন",
  },
};

export const t = createDictionaryTranslator(THEMES_DICT);
