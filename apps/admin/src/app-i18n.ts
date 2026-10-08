import { COMMON_I18N } from "./lib/i18n-common";
import { createDictionaryTranslator } from "@jini-ai/ui/panel-kit";

/**
 * @file Translations for `App.tsx`'s own shell-level copy — currently just the "are you sure you
 * want to log out?" confirmation dialog (owner-requested, 2026-08-31: a misclick on the sidebar's
 * logout button used to sign the operator out with no chance to back out).
 *
 * Kept separate from `lib/admin-nav-i18n.ts` on purpose — that file's own header scopes itself to
 * "nav only" (group headings, item labels, the "Soon" badge) and explicitly calls every other
 * screen's copy "a separate... translation surface, not covered here". This dialog's copy is `App`
 * shell chrome, not a nav label, so it gets its own file rather than stretching that one's scope.
 * The confirm BUTTON's own label reuses `admin-nav-i18n.ts`'s existing "Log out" translation
 * directly (same exact English string, already translated in all 21 locales below) rather than
 * duplicating it here — see `App.tsx`'s call site.
 *
 * Also the no-access state `App.tsx`'s `NoAccess` shows for a section the operator holds no
 * permission for (`lib/panel-access.ts`).
 *
 * Same 21-locale set and order as `admin-nav-i18n.ts`/every feature `*-i18n.ts` file in this app.
 */

const APP_DICT: Record<string, Record<string, string>> = {
  es: {
    Assistant: "Asistente", "Loading Tovu…": "Cargando Tovu…", "Skip to content": "Saltar al contenido", "Close navigation": "Cerrar navegación", "Open navigation": "Abrir navegación",
    "Log out?": "¿Cerrar sesión?",
    "Are you sure you want to log out?": "¿Seguro que quieres cerrar sesión?",
    "You don't have access to this": "No tienes acceso a esto",
    "Ask the site owner if you need this section.": "Pide acceso al propietario del sitio si necesitas esta sección.",
  },
  id: {
    Assistant: "Asisten", "Loading Tovu…": "Memuat Tovu…", "Skip to content": "Lewati ke konten", "Close navigation": "Tutup navigasi", "Open navigation": "Buka navigasi",
    "Log out?": "Keluar?",
    "Are you sure you want to log out?": "Yakin ingin keluar?",
    "You don't have access to this": "Anda tidak memiliki akses ke ini",
    "Ask the site owner if you need this section.": "Minta akses kepada pemilik situs jika Anda memerlukan bagian ini.",
  },
  de: {
    Assistant: "Assistent", "Loading Tovu…": "Tovu wird geladen…", "Skip to content": "Zum Inhalt springen", "Close navigation": "Navigation schließen", "Open navigation": "Navigation öffnen",
    "Log out?": "Abmelden?",
    "Are you sure you want to log out?": "Möchten Sie sich wirklich abmelden?",
    "You don't have access to this": "Sie haben keinen Zugriff darauf",
    "Ask the site owner if you need this section.": "Bitten Sie den Websiteinhaber um Zugriff, wenn Sie diesen Bereich benötigen.",
  },
  "zh-CN": {
    Assistant: "助手", "Loading Tovu…": "正在加载 Tovu…", "Skip to content": "跳到内容", "Close navigation": "关闭导航", "Open navigation": "打开导航",
    "Log out?": "退出登录?",
    "Are you sure you want to log out?": "确定要退出登录吗?",
    "You don't have access to this": "您无权访问此内容",
    "Ask the site owner if you need this section.": "如需使用此部分，请联系网站所有者。",
  },
  "zh-TW": {
    Assistant: "助理", "Loading Tovu…": "正在載入 Tovu…", "Skip to content": "跳至內容", "Close navigation": "關閉導覽", "Open navigation": "開啟導覽",
    "Log out?": "登出?",
    "Are you sure you want to log out?": "確定要登出嗎?",
    "You don't have access to this": "您無權存取此內容",
    "Ask the site owner if you need this section.": "如需使用此區段，請聯絡網站擁有者。",
  },
  "pt-BR": {
    Assistant: "Assistente", "Loading Tovu…": "Carregando Tovu…", "Skip to content": "Ir para o conteúdo", "Close navigation": "Fechar navegação", "Open navigation": "Abrir navegação",
    "Log out?": "Sair?",
    "Are you sure you want to log out?": "Tem certeza de que deseja sair?",
    "You don't have access to this": "Você não tem acesso a isto",
    "Ask the site owner if you need this section.": "Peça acesso ao proprietário do site se precisar desta seção.",
  },
  ru: {
    Assistant: "Помощник", "Loading Tovu…": "Загрузка Tovu…", "Skip to content": "Перейти к содержимому", "Close navigation": "Закрыть навигацию", "Open navigation": "Открыть навигацию",
    "Log out?": "Выйти?",
    "Are you sure you want to log out?": "Вы уверены, что хотите выйти?",
    "You don't have access to this": "У вас нет доступа к этому разделу",
    "Ask the site owner if you need this section.": "Если вам нужен этот раздел, обратитесь к владельцу сайта.",
  },
  fa: {
    Assistant: "دستیار", "Loading Tovu…": "در حال بارگیری Tovu…", "Skip to content": "پرش به محتوا", "Close navigation": "بستن ناوبری", "Open navigation": "باز کردن ناوبری",
    "Log out?": "خروج؟",
    "Are you sure you want to log out?": "آیا مطمئن هستید که می‌خواهید خارج شوید؟",
    "You don't have access to this": "شما به این بخش دسترسی ندارید",
    "Ask the site owner if you need this section.": "اگر به این بخش نیاز دارید، از مالک سایت دسترسی بخواهید.",
  },
  ar: {
    Assistant: "المساعد", "Loading Tovu…": "جارٍ تحميل Tovu…", "Skip to content": "انتقل إلى المحتوى", "Close navigation": "إغلاق التنقل", "Open navigation": "فتح التنقل",
    "Log out?": "تسجيل الخروج؟",
    "Are you sure you want to log out?": "هل أنت متأكد أنك تريد تسجيل الخروج؟",
    "You don't have access to this": "ليس لديك صلاحية الوصول إلى هذا",
    "Ask the site owner if you need this section.": "اطلب الوصول من مالك الموقع إذا كنت بحاجة إلى هذا القسم.",
  },
  ja: {
    Assistant: "アシスタント", "Loading Tovu…": "Tovu を読み込んでいます…", "Skip to content": "コンテンツに移動", "Close navigation": "ナビゲーションを閉じる", "Open navigation": "ナビゲーションを開く",
    "Log out?": "ログアウトしますか?",
    "Are you sure you want to log out?": "本当にログアウトしますか?",
    "You don't have access to this": "このページにアクセスする権限がありません",
    "Ask the site owner if you need this section.": "このセクションが必要な場合は、サイトのオーナーに依頼してください。",
  },
  ko: {
    Assistant: "도우미", "Loading Tovu…": "Tovu를 불러오는 중…", "Skip to content": "콘텐츠로 건너뛰기", "Close navigation": "탐색 닫기", "Open navigation": "탐색 열기",
    "Log out?": "로그아웃하시겠습니까?",
    "Are you sure you want to log out?": "정말로 로그아웃하시겠습니까?",
    "You don't have access to this": "이 항목에 접근할 권한이 없습니다",
    "Ask the site owner if you need this section.": "이 섹션이 필요하면 사이트 소유자에게 요청하세요.",
  },
  pl: {
    Assistant: "Asystent", "Loading Tovu…": "Ładowanie Tovu…", "Skip to content": "Przejdź do treści", "Close navigation": "Zamknij nawigację", "Open navigation": "Otwórz nawigację",
    "Log out?": "Wylogować się?",
    "Are you sure you want to log out?": "Czy na pewno chcesz się wylogować?",
    "You don't have access to this": "Nie masz dostępu do tej sekcji",
    "Ask the site owner if you need this section.": "Jeśli potrzebujesz tej sekcji, poproś o dostęp właściciela witryny.",
  },
  hu: {
    Assistant: "Asszisztens", "Loading Tovu…": "Tovu betöltése…", "Skip to content": "Ugrás a tartalomhoz", "Close navigation": "Navigáció bezárása", "Open navigation": "Navigáció megnyitása",
    "Log out?": "Kijelentkezés?",
    "Are you sure you want to log out?": "Biztosan ki szeretne jelentkezni?",
    "You don't have access to this": "Ehhez nincs hozzáférésed",
    "Ask the site owner if you need this section.": "Ha szükséged van erre a részre, kérj hozzáférést a webhely tulajdonosától.",
  },
  fr: {
    Assistant: "Assistant IA", "Loading Tovu…": "Chargement de Tovu…", "Skip to content": "Aller au contenu", "Close navigation": "Fermer la navigation", "Open navigation": "Ouvrir la navigation",
    "Log out?": "Se déconnecter ?",
    "Are you sure you want to log out?": "Voulez-vous vraiment vous déconnecter ?",
    "You don't have access to this": "Vous n'avez pas accès à cette section",
    "Ask the site owner if you need this section.": "Demandez l'accès au propriétaire du site si vous avez besoin de cette section.",
  },
  uk: {
    Assistant: "Помічник", "Loading Tovu…": "Завантаження Tovu…", "Skip to content": "Перейти до вмісту", "Close navigation": "Закрити навігацію", "Open navigation": "Відкрити навігацію",
    "Log out?": "Вийти?",
    "Are you sure you want to log out?": "Ви впевнені, що хочете вийти?",
    "You don't have access to this": "У вас немає доступу до цього розділу",
    "Ask the site owner if you need this section.": "Якщо вам потрібен цей розділ, зверніться до власника сайту.",
  },
  tr: {
    Assistant: "Asistan", "Loading Tovu…": "Tovu yükleniyor…", "Skip to content": "İçeriğe geç", "Close navigation": "Gezinmeyi kapat", "Open navigation": "Gezinmeyi aç",
    "Log out?": "Çıkış yapılsın mı?",
    "Are you sure you want to log out?": "Çıkış yapmak istediğinizden emin misiniz?",
    "You don't have access to this": "Buraya erişiminiz yok",
    "Ask the site owner if you need this section.": "Bu bölüme ihtiyacınız varsa site sahibinden erişim isteyin.",
  },
  th: {
    Assistant: "ผู้ช่วย", "Loading Tovu…": "กำลังโหลด Tovu…", "Skip to content": "ข้ามไปยังเนื้อหา", "Close navigation": "ปิดการนำทาง", "Open navigation": "เปิดการนำทาง",
    "Log out?": "ออกจากระบบ?",
    "Are you sure you want to log out?": "คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?",
    "You don't have access to this": "คุณไม่มีสิทธิ์เข้าถึงส่วนนี้",
    "Ask the site owner if you need this section.": "หากต้องการใช้ส่วนนี้ โปรดขอสิทธิ์จากเจ้าของเว็บไซต์",
  },
  it: {
    Assistant: "Assistente", "Loading Tovu…": "Caricamento di Tovu…", "Skip to content": "Vai al contenuto", "Close navigation": "Chiudi navigazione", "Open navigation": "Apri navigazione",
    "Log out?": "Uscire?",
    "Are you sure you want to log out?": "Sei sicuro di voler uscire?",
    "You don't have access to this": "Non hai accesso a questa sezione",
    "Ask the site owner if you need this section.": "Chiedi l'accesso al proprietario del sito se ti serve questa sezione.",
  },
  hi: {
    Assistant: "सहायक", "Loading Tovu…": "Tovu लोड हो रहा है…", "Skip to content": "सामग्री पर जाएँ", "Close navigation": "नेविगेशन बंद करें", "Open navigation": "नेविगेशन खोलें",
    "Log out?": "लॉग आउट करें?",
    "Are you sure you want to log out?": "क्या आप वाकई लॉग आउट करना चाहते हैं?",
    "You don't have access to this": "आपके पास इसकी पहुँच नहीं है",
    "Ask the site owner if you need this section.": "यदि आपको इस अनुभाग की आवश्यकता है, तो साइट के स्वामी से पहुँच माँगें।",
  },
  ur: {
    Assistant: "معاون", "Loading Tovu…": "Tovu لوڈ ہو رہا ہے…", "Skip to content": "مواد پر جائیں", "Close navigation": "نیویگیشن بند کریں", "Open navigation": "نیویگیشن کھولیں",
    "Log out?": "لاگ آؤٹ کریں؟",
    "Are you sure you want to log out?": "کیا آپ واقعی لاگ آؤٹ کرنا چاہتے ہیں؟",
    "You don't have access to this": "آپ کو اس تک رسائی حاصل نہیں ہے",
    "Ask the site owner if you need this section.": "اگر آپ کو اس حصے کی ضرورت ہے تو سائٹ کے مالک سے رسائی مانگیں۔",
  },
  bn: {
    Assistant: "সহকারী", "Loading Tovu…": "Tovu লোড হচ্ছে…", "Skip to content": "বিষয়বস্তুতে যান", "Close navigation": "নেভিগেশন বন্ধ করুন", "Open navigation": "নেভিগেশন খুলুন",
    "Log out?": "লগ আউট করবেন?",
    "Are you sure you want to log out?": "আপনি কি নিশ্চিতভাবে লগ আউট করতে চান?",
    "You don't have access to this": "এতে আপনার অ্যাক্সেস নেই",
    "Ask the site owner if you need this section.": "এই বিভাগটি প্রয়োজন হলে সাইটের মালিকের কাছে অ্যাক্সেস চান।",
  },
};

export const t = createDictionaryTranslator({ featureDictionary: APP_DICT }, { commonDictionary: COMMON_I18N });
