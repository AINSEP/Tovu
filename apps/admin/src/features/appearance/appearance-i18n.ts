/**
 * @file Spanish translation for the Appearance/Themes screen (`Appearance.tsx`) — this feature's
 * own dictionary, not the shared `lib/admin-nav-i18n.ts` one, so parallel translation passes over
 * other admin sections can't collide on the same file. Same two-step fallback every other `t()` in
 * this app uses: translated value, else the English source string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const APPEARANCE_DICT: Record<string, Record<string, string>> = {
  es: {
    Declarative: "Declarativo",
    Templated: "Basado en plantillas",
    Static: "Estático",
    Code: "Código",
    Studio: "Estudio",
    Themes: "Temas",
    "The active theme controls what visitors see across the entire public site.":
      "El tema activo controla lo que ven los visitantes en todo el sitio público.",
    "View site ↗": "Ver sitio ↗",
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
  },
  id: {
    Declarative: "Deklaratif",
    Templated: "Berbasis templat",
    Static: "Statis",
    Code: "Kode",
    Studio: "Studio",
    Themes: "Tema",
    "The active theme controls what visitors see across the entire public site.":
      "Tema aktif mengontrol apa yang dilihat pengunjung di seluruh situs publik.",
    "View site ↗": "Lihat situs ↗",
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
  },
  de: {
    Declarative: "Deklarativ",
    Templated: "Vorlagenbasiert",
    Static: "Statisch",
    Code: "Code",
    Studio: "Studio",
    Themes: "Designs",
    "The active theme controls what visitors see across the entire public site.":
      "Das aktive Design bestimmt, was Besucher auf der gesamten öffentlichen Website sehen.",
    "View site ↗": "Website ansehen ↗",
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
  },
  "zh-CN": {
    Declarative: "声明式",
    Templated: "模板式",
    Static: "静态",
    Code: "代码",
    Studio: "工作室",
    Themes: "主题",
    "The active theme controls what visitors see across the entire public site.":
      "当前启用的主题决定访问者在整个公开网站上看到的内容。",
    "View site ↗": "查看网站 ↗",
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
  },
  "zh-TW": {
    Declarative: "宣告式",
    Templated: "範本式",
    Static: "靜態",
    Code: "程式碼",
    Studio: "工作室",
    Themes: "佈景主題",
    "The active theme controls what visitors see across the entire public site.":
      "現行的佈景主題會決定訪客在整個公開網站上看到的內容。",
    "View site ↗": "檢視網站 ↗",
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
  },
  "pt-BR": {
    Declarative: "Declarativo",
    Templated: "Baseado em modelo",
    Static: "Estático",
    Code: "Código",
    Studio: "Estúdio",
    Themes: "Temas",
    "The active theme controls what visitors see across the entire public site.":
      "O tema ativo controla o que os visitantes veem em todo o site público.",
    "View site ↗": "Ver site ↗",
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
  },
  ru: {
    Declarative: "Декларативный",
    Templated: "На основе шаблонов",
    Static: "Статический",
    Code: "Код",
    Studio: "Студия",
    Themes: "Темы",
    "The active theme controls what visitors see across the entire public site.":
      "Активная тема определяет, что посетители видят на всём публичном сайте.",
    "View site ↗": "Открыть сайт ↗",
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
  },
  fa: {
    Declarative: "اعلانی",
    Templated: "مبتنی بر قالب",
    Static: "ایستا",
    Code: "کد",
    Studio: "استودیو",
    Themes: "پوسته‌ها",
    "The active theme controls what visitors see across the entire public site.":
      "پوسته فعال، آنچه بازدیدکنندگان در سراسر سایت عمومی می‌بینند را کنترل می‌کند.",
    "View site ↗": "مشاهده سایت ↗",
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
  },
  ar: {
    Declarative: "تصريحي",
    Templated: "قائم على القوالب",
    Static: "ثابت",
    Code: "كود",
    Studio: "الاستوديو",
    Themes: "القوالب",
    "The active theme controls what visitors see across the entire public site.":
      "يتحكم القالب النشط في ما يراه الزوار في جميع أنحاء الموقع العام.",
    "View site ↗": "عرض الموقع ↗",
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
  },
  ja: {
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
  },
  ko: {
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
  },
  pl: {
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
  },
  hu: {
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
  },
  fr: {
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
  },
  uk: {
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
  },
  tr: {
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
  },
  th: {
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
  },
  it: {
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
  },
  hi: {
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
  },
  ur: {
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
  },
  bn: {
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
  },
};

export const t = createDictionaryTranslator(APPEARANCE_DICT);
