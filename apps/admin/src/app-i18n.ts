import { SETTINGS_DIALOG_DICTIONARIES } from "@jini-ai/ui";
import { SECRET_REDACTED_NOTICE, CREDENTIAL_CARD_GUIDANCE } from "@jini-ai/chat/core";

import { COMMON_I18N } from "./lib/i18n-common";

import { createDictionaryTranslator } from '@jini-ai/core/text';
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
 * permission for (`@jini-ai/admin/core`'s `isPanelAccessible`).
 *
 * Same 21-locale set and order as `admin-nav-i18n.ts`/every feature `*-i18n.ts` file in this app.
 */

const APP_DICT: Record<string, Record<string, string>> = {
  es: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "La versión {latest} del software del sitio está disponible. Este sitio usa {runningVersion}.",
    "What changed": "Qué ha cambiado",
    "Scroll to top": "Ir al principio", "Scroll to bottom": "Ir al final",
    Dismiss: "Descartar",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "El correo no está configurado: no se envían enlaces de inicio de sesión, confirmaciones ni avisos de formularios.",
    "Set up email": "Configurar correo",
    Assistant: "Asistente", "Loading Tovu…": "Cargando Tovu…", "Skip to content": "Saltar al contenido", "Close navigation": "Cerrar navegación", "Open navigation": "Abrir navegación",
    "Log out?": "¿Cerrar sesión?",
    "Are you sure you want to log out?": "¿Seguro que quieres cerrar sesión?",
    "You don't have access to this": "No tienes acceso a esto",
    "Ask the site owner if you need this section.": "Pide acceso al propietario del sitio si necesitas esta sección.",
  },
  id: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "Versi {latest} perangkat lunak situs tersedia. Situs ini menjalankan {runningVersion}.",
    "What changed": "Yang berubah",
    "Scroll to top": "Gulir ke atas", "Scroll to bottom": "Gulir ke bawah",
    Dismiss: "Tutup",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "Email belum diatur: tautan masuk, konfirmasi, dan notifikasi formulir tidak dikirim.",
    "Set up email": "Atur email",
    Assistant: "Asisten", "Loading Tovu…": "Memuat Tovu…", "Skip to content": "Lewati ke konten", "Close navigation": "Tutup navigasi", "Open navigation": "Buka navigasi",
    "Log out?": "Keluar?",
    "Are you sure you want to log out?": "Yakin ingin keluar?",
    "You don't have access to this": "Anda tidak memiliki akses ke ini",
    "Ask the site owner if you need this section.": "Minta akses kepada pemilik situs jika Anda memerlukan bagian ini.",
  },
  de: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "Version {latest} der Website-Software ist verfügbar. Diese Website läuft mit {runningVersion}.",
    "What changed": "Was sich geändert hat",
    "Scroll to top": "Nach oben scrollen", "Scroll to bottom": "Nach unten scrollen",
    Dismiss: "Verwerfen",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "E-Mail ist nicht eingerichtet: Anmeldelinks, Bestätigungen und Formularbenachrichtigungen werden nicht gesendet.",
    "Set up email": "E-Mail einrichten",
    Assistant: "Assistent", "Loading Tovu…": "Tovu wird geladen…", "Skip to content": "Zum Inhalt springen", "Close navigation": "Navigation schließen", "Open navigation": "Navigation öffnen",
    "Log out?": "Abmelden?",
    "Are you sure you want to log out?": "Möchten Sie sich wirklich abmelden?",
    "You don't have access to this": "Sie haben keinen Zugriff darauf",
    "Ask the site owner if you need this section.": "Bitten Sie den Websiteinhaber um Zugriff, wenn Sie diesen Bereich benötigen.",
  },
  "zh-CN": {
    "Scroll to top": "滚动到顶部", "Scroll to bottom": "滚动到底部",
    Dismiss: "关闭",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "电子邮件尚未设置：不会发送登录链接、确认邮件和表单通知。",
    "Set up email": "设置电子邮件",
    Assistant: "助手", "Loading Tovu…": "正在加载 Tovu…", "Skip to content": "跳到内容", "Close navigation": "关闭导航", "Open navigation": "打开导航",
    "Log out?": "退出登录?",
    "Are you sure you want to log out?": "确定要退出登录吗?",
    "You don't have access to this": "您无权访问此内容",
    "Ask the site owner if you need this section.": "如需使用此部分，请联系网站所有者。",
  },
  "zh-TW": {
    "Scroll to top": "捲動至頂端", "Scroll to bottom": "捲動至底部",
    Dismiss: "關閉",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "電子郵件尚未設定：不會傳送登入連結、確認信和表單通知。",
    "Set up email": "設定電子郵件",
    Assistant: "助理", "Loading Tovu…": "正在載入 Tovu…", "Skip to content": "跳至內容", "Close navigation": "關閉導覽", "Open navigation": "開啟導覽",
    "Log out?": "登出?",
    "Are you sure you want to log out?": "確定要登出嗎?",
    "You don't have access to this": "您無權存取此內容",
    "Ask the site owner if you need this section.": "如需使用此區段，請聯絡網站擁有者。",
  },
  "pt-BR": {
    "Scroll to top": "Ir para o topo", "Scroll to bottom": "Ir para o final",
    Dismiss: "Dispensar",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "O e-mail não está configurado: links de login, confirmações e notificações de formulários não são enviados.",
    "Set up email": "Configurar e-mail",
    Assistant: "Assistente", "Loading Tovu…": "Carregando Tovu…", "Skip to content": "Ir para o conteúdo", "Close navigation": "Fechar navegação", "Open navigation": "Abrir navegação",
    "Log out?": "Sair?",
    "Are you sure you want to log out?": "Tem certeza de que deseja sair?",
    "You don't have access to this": "Você não tem acesso a isto",
    "Ask the site owner if you need this section.": "Peça acesso ao proprietário do site se precisar desta seção.",
  },
  ru: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "Доступна версия {latest} программного обеспечения сайта. Сайт работает на версии {runningVersion}.",
    "What changed": "Что изменилось",
    "Scroll to top": "Прокрутить вверх", "Scroll to bottom": "Прокрутить вниз",
    Dismiss: "Скрыть",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "Почта не настроена: ссылки для входа, подтверждения и уведомления форм не отправляются.",
    "Set up email": "Настроить почту",
    Assistant: "Помощник", "Loading Tovu…": "Загрузка Tovu…", "Skip to content": "Перейти к содержимому", "Close navigation": "Закрыть навигацию", "Open navigation": "Открыть навигацию",
    "Log out?": "Выйти?",
    "Are you sure you want to log out?": "Вы уверены, что хотите выйти?",
    "You don't have access to this": "У вас нет доступа к этому разделу",
    "Ask the site owner if you need this section.": "Если вам нужен этот раздел, обратитесь к владельцу сайта.",
  },
  fa: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "نسخه {latest} نرم‌افزار سایت در دسترس است. این سایت نسخه {runningVersion} را اجرا می‌کند.",
    "What changed": "چه چیزی تغییر کرده است",
    "Scroll to top": "رفتن به بالا", "Scroll to bottom": "رفتن به پایین",
    Dismiss: "نادیده گرفتن",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "ایمیل راه‌اندازی نشده است: پیوندهای ورود، تأییدیه‌ها و اعلان‌های فرم ارسال نمی‌شوند.",
    "Set up email": "راه‌اندازی ایمیل",
    Assistant: "دستیار", "Loading Tovu…": "در حال بارگیری Tovu…", "Skip to content": "پرش به محتوا", "Close navigation": "بستن ناوبری", "Open navigation": "باز کردن ناوبری",
    "Log out?": "خروج؟",
    "Are you sure you want to log out?": "آیا مطمئن هستید که می‌خواهید خارج شوید؟",
    "You don't have access to this": "شما به این بخش دسترسی ندارید",
    "Ask the site owner if you need this section.": "اگر به این بخش نیاز دارید، از مالک سایت دسترسی بخواهید.",
  },
  ar: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "الإصدار {latest} من برنامج الموقع متاح. يعمل هذا الموقع بالإصدار {runningVersion}.",
    "What changed": "ما الذي تغيّر",
    "Scroll to top": "التمرير إلى الأعلى", "Scroll to bottom": "التمرير إلى الأسفل",
    Dismiss: "تجاهل",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "البريد الإلكتروني غير مُعدّ: لا تُرسل روابط تسجيل الدخول والتأكيدات وإشعارات النماذج.",
    "Set up email": "إعداد البريد الإلكتروني",
    Assistant: "المساعد", "Loading Tovu…": "جارٍ تحميل Tovu…", "Skip to content": "انتقل إلى المحتوى", "Close navigation": "إغلاق التنقل", "Open navigation": "فتح التنقل",
    "Log out?": "تسجيل الخروج؟",
    "Are you sure you want to log out?": "هل أنت متأكد أنك تريد تسجيل الخروج؟",
    "You don't have access to this": "ليس لديك صلاحية الوصول إلى هذا",
    "Ask the site owner if you need this section.": "اطلب الوصول من مالك الموقع إذا كنت بحاجة إلى هذا القسم.",
  },
  ja: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "サイトソフトウェアのバージョン {latest} が利用できます。このサイトは {runningVersion} で動作しています。",
    "What changed": "変更内容",
    "Scroll to top": "一番上へ", "Scroll to bottom": "一番下へ",
    Dismiss: "閉じる",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "メールが未設定です：サインインリンク、確認メール、フォーム通知は送信されません。",
    "Set up email": "メールを設定",
    Assistant: "アシスタント", "Loading Tovu…": "Tovu を読み込んでいます…", "Skip to content": "コンテンツに移動", "Close navigation": "ナビゲーションを閉じる", "Open navigation": "ナビゲーションを開く",
    "Log out?": "ログアウトしますか?",
    "Are you sure you want to log out?": "本当にログアウトしますか?",
    "You don't have access to this": "このページにアクセスする権限がありません",
    "Ask the site owner if you need this section.": "このセクションが必要な場合は、サイトのオーナーに依頼してください。",
  },
  ko: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "사이트 소프트웨어 버전 {latest}을(를) 사용할 수 있습니다. 이 사이트는 {runningVersion}에서 실행 중입니다.",
    "What changed": "변경 사항",
    "Scroll to top": "맨 위로", "Scroll to bottom": "맨 아래로",
    Dismiss: "닫기",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "이메일이 설정되지 않았습니다: 로그인 링크, 확인 메일, 양식 알림이 발송되지 않습니다.",
    "Set up email": "이메일 설정",
    Assistant: "도우미", "Loading Tovu…": "Tovu를 불러오는 중…", "Skip to content": "콘텐츠로 건너뛰기", "Close navigation": "탐색 닫기", "Open navigation": "탐색 열기",
    "Log out?": "로그아웃하시겠습니까?",
    "Are you sure you want to log out?": "정말로 로그아웃하시겠습니까?",
    "You don't have access to this": "이 항목에 접근할 권한이 없습니다",
    "Ask the site owner if you need this section.": "이 섹션이 필요하면 사이트 소유자에게 요청하세요.",
  },
  pl: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "Dostępna jest wersja {latest} oprogramowania witryny. Ta witryna działa na wersji {runningVersion}.",
    "What changed": "Co się zmieniło",
    "Scroll to top": "Przewiń na górę", "Scroll to bottom": "Przewiń na dół",
    Dismiss: "Odrzuć",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "Poczta nie jest skonfigurowana: linki logowania, potwierdzenia i powiadomienia z formularzy nie są wysyłane.",
    "Set up email": "Skonfiguruj pocztę",
    Assistant: "Asystent", "Loading Tovu…": "Ładowanie Tovu…", "Skip to content": "Przejdź do treści", "Close navigation": "Zamknij nawigację", "Open navigation": "Otwórz nawigację",
    "Log out?": "Wylogować się?",
    "Are you sure you want to log out?": "Czy na pewno chcesz się wylogować?",
    "You don't have access to this": "Nie masz dostępu do tej sekcji",
    "Ask the site owner if you need this section.": "Jeśli potrzebujesz tej sekcji, poproś o dostęp właściciela witryny.",
  },
  hu: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "Elérhető a webhelyszoftver {latest} verziója. Ez a webhely a(z) {runningVersion} verziót futtatja.",
    "What changed": "Mi változott",
    "Scroll to top": "Ugrás a tetejére", "Scroll to bottom": "Ugrás az aljára",
    Dismiss: "Elvetés",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "Az e-mail nincs beállítva: a bejelentkezési linkek, megerősítések és űrlapértesítések nem kerülnek elküldésre.",
    "Set up email": "E-mail beállítása",
    Assistant: "Asszisztens", "Loading Tovu…": "Tovu betöltése…", "Skip to content": "Ugrás a tartalomhoz", "Close navigation": "Navigáció bezárása", "Open navigation": "Navigáció megnyitása",
    "Log out?": "Kijelentkezés?",
    "Are you sure you want to log out?": "Biztosan ki szeretne jelentkezni?",
    "You don't have access to this": "Ehhez nincs hozzáférésed",
    "Ask the site owner if you need this section.": "Ha szükséged van erre a részre, kérj hozzáférést a webhely tulajdonosától.",
  },
  fr: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "La version {latest} du logiciel du site est disponible. Ce site utilise la version {runningVersion}.",
    "What changed": "Ce qui a changé",
    "Scroll to top": "Aller en haut", "Scroll to bottom": "Aller en bas",
    Dismiss: "Ignorer",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "L’e-mail n’est pas configuré : les liens de connexion, les confirmations et les notifications de formulaires ne sont pas envoyés.",
    "Set up email": "Configurer l’e-mail",
    Assistant: "Assistant IA", "Loading Tovu…": "Chargement de Tovu…", "Skip to content": "Aller au contenu", "Close navigation": "Fermer la navigation", "Open navigation": "Ouvrir la navigation",
    "Log out?": "Se déconnecter ?",
    "Are you sure you want to log out?": "Voulez-vous vraiment vous déconnecter ?",
    "You don't have access to this": "Vous n'avez pas accès à cette section",
    "Ask the site owner if you need this section.": "Demandez l'accès au propriétaire du site si vous avez besoin de cette section.",
  },
  uk: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "Доступна версія {latest} програмного забезпечення сайту. Сайт працює на версії {runningVersion}.",
    "What changed": "Що змінилося",
    "Scroll to top": "Прокрутити вгору", "Scroll to bottom": "Прокрутити вниз",
    Dismiss: "Приховати",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "Пошту не налаштовано: посилання для входу, підтвердження та сповіщення форм не надсилаються.",
    "Set up email": "Налаштувати пошту",
    Assistant: "Помічник", "Loading Tovu…": "Завантаження Tovu…", "Skip to content": "Перейти до вмісту", "Close navigation": "Закрити навігацію", "Open navigation": "Відкрити навігацію",
    "Log out?": "Вийти?",
    "Are you sure you want to log out?": "Ви впевнені, що хочете вийти?",
    "You don't have access to this": "У вас немає доступу до цього розділу",
    "Ask the site owner if you need this section.": "Якщо вам потрібен цей розділ, зверніться до власника сайту.",
  },
  tr: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "Site yazılımının {latest} sürümü kullanılabilir. Bu site {runningVersion} sürümünü çalıştırıyor.",
    "What changed": "Neler değişti",
    "Scroll to top": "Başa git", "Scroll to bottom": "Sona git",
    Dismiss: "Kapat",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "E-posta kurulmadı: giriş bağlantıları, onaylar ve form bildirimleri gönderilmiyor.",
    "Set up email": "E-postayı kur",
    Assistant: "Asistan", "Loading Tovu…": "Tovu yükleniyor…", "Skip to content": "İçeriğe geç", "Close navigation": "Gezinmeyi kapat", "Open navigation": "Gezinmeyi aç",
    "Log out?": "Çıkış yapılsın mı?",
    "Are you sure you want to log out?": "Çıkış yapmak istediğinizden emin misiniz?",
    "You don't have access to this": "Buraya erişiminiz yok",
    "Ask the site owner if you need this section.": "Bu bölüme ihtiyacınız varsa site sahibinden erişim isteyin.",
  },
  th: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "ซอฟต์แวร์เว็บไซต์เวอร์ชัน {latest} พร้อมใช้งานแล้ว เว็บไซต์นี้ใช้เวอร์ชัน {runningVersion}",
    "What changed": "มีอะไรเปลี่ยนแปลง",
    "Scroll to top": "เลื่อนไปด้านบนสุด", "Scroll to bottom": "เลื่อนไปด้านล่างสุด",
    Dismiss: "ปิด",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "ยังไม่ได้ตั้งค่าอีเมล: ไม่มีการส่งลิงก์ลงชื่อเข้าใช้ การยืนยัน และการแจ้งเตือนจากแบบฟอร์ม",
    "Set up email": "ตั้งค่าอีเมล",
    Assistant: "ผู้ช่วย", "Loading Tovu…": "กำลังโหลด Tovu…", "Skip to content": "ข้ามไปยังเนื้อหา", "Close navigation": "ปิดการนำทาง", "Open navigation": "เปิดการนำทาง",
    "Log out?": "ออกจากระบบ?",
    "Are you sure you want to log out?": "คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?",
    "You don't have access to this": "คุณไม่มีสิทธิ์เข้าถึงส่วนนี้",
    "Ask the site owner if you need this section.": "หากต้องการใช้ส่วนนี้ โปรดขอสิทธิ์จากเจ้าของเว็บไซต์",
  },
  it: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "È disponibile la versione {latest} del software del sito. Questo sito usa la versione {runningVersion}.",
    "What changed": "Cosa è cambiato",
    "Scroll to top": "Torna su", "Scroll to bottom": "Vai in fondo",
    Dismiss: "Ignora",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "L’email non è configurata: link di accesso, conferme e notifiche dei moduli non vengono inviati.",
    "Set up email": "Configura email",
    Assistant: "Assistente", "Loading Tovu…": "Caricamento di Tovu…", "Skip to content": "Vai al contenuto", "Close navigation": "Chiudi navigazione", "Open navigation": "Apri navigazione",
    "Log out?": "Uscire?",
    "Are you sure you want to log out?": "Sei sicuro di voler uscire?",
    "You don't have access to this": "Non hai accesso a questa sezione",
    "Ask the site owner if you need this section.": "Chiedi l'accesso al proprietario del sito se ti serve questa sezione.",
  },
  hi: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "साइट सॉफ़्टवेयर का संस्करण {latest} उपलब्ध है। यह साइट {runningVersion} पर चल रही है।",
    "What changed": "क्या बदला",
    "Scroll to top": "ऊपर जाएँ", "Scroll to bottom": "नीचे जाएँ",
    Dismiss: "खारिज करें",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "ईमेल सेट अप नहीं है: साइन-इन लिंक, पुष्टिकरण और फ़ॉर्म सूचनाएं नहीं भेजी जातीं।",
    "Set up email": "ईमेल सेट अप करें",
    Assistant: "सहायक", "Loading Tovu…": "Tovu लोड हो रहा है…", "Skip to content": "सामग्री पर जाएँ", "Close navigation": "नेविगेशन बंद करें", "Open navigation": "नेविगेशन खोलें",
    "Log out?": "लॉग आउट करें?",
    "Are you sure you want to log out?": "क्या आप वाकई लॉग आउट करना चाहते हैं?",
    "You don't have access to this": "आपके पास इसकी पहुँच नहीं है",
    "Ask the site owner if you need this section.": "यदि आपको इस अनुभाग की आवश्यकता है, तो साइट के स्वामी से पहुँच माँगें।",
  },
  ur: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "سائٹ سافٹ ویئر کا ورژن {latest} دستیاب ہے۔ یہ سائٹ {runningVersion} پر چل رہی ہے۔",
    "What changed": "کیا بدلا",
    "Scroll to top": "اوپر جائیں", "Scroll to bottom": "نیچے جائیں",
    Dismiss: "مسترد کریں",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "ای میل سیٹ اپ نہیں ہے: سائن ان لنکس، تصدیقات اور فارم اطلاعات نہیں بھیجی جاتیں۔",
    "Set up email": "ای میل سیٹ اپ کریں",
    Assistant: "معاون", "Loading Tovu…": "Tovu لوڈ ہو رہا ہے…", "Skip to content": "مواد پر جائیں", "Close navigation": "نیویگیشن بند کریں", "Open navigation": "نیویگیشن کھولیں",
    "Log out?": "لاگ آؤٹ کریں؟",
    "Are you sure you want to log out?": "کیا آپ واقعی لاگ آؤٹ کرنا چاہتے ہیں؟",
    "You don't have access to this": "آپ کو اس تک رسائی حاصل نہیں ہے",
    "Ask the site owner if you need this section.": "اگر آپ کو اس حصے کی ضرورت ہے تو سائٹ کے مالک سے رسائی مانگیں۔",
  },
  bn: {
    "Version {latest} of the site software is available. This site runs {runningVersion}.": "সাইট সফটওয়্যারের সংস্করণ {latest} পাওয়া যাচ্ছে। এই সাইটটি {runningVersion} চালাচ্ছে।",
    "What changed": "কী বদলেছে",
    "Scroll to top": "উপরে যান", "Scroll to bottom": "নিচে যান",
    Dismiss: "খারিজ করুন",
    "Email is not set up: sign-in links, confirmations and form notifications are not sent.": "ইমেইল সেট আপ করা হয়নি: সাইন-ইন লিংক, নিশ্চিতকরণ এবং ফর্ম বিজ্ঞপ্তি পাঠানো হয় না।",
    "Set up email": "ইমেইল সেট আপ করুন",
    Assistant: "সহকারী", "Loading Tovu…": "Tovu লোড হচ্ছে…", "Skip to content": "বিষয়বস্তুতে যান", "Close navigation": "নেভিগেশন বন্ধ করুন", "Open navigation": "নেভিগেশন খুলুন",
    "Log out?": "লগ আউট করবেন?",
    "Are you sure you want to log out?": "আপনি কি নিশ্চিতভাবে লগ আউট করতে চান?",
    "You don't have access to this": "এতে আপনার অ্যাক্সেস নেই",
    "Ask the site owner if you need this section.": "এই বিভাগটি প্রয়োজন হলে সাইটের মালিকের কাছে অ্যাক্সেস চান।",
  },
};

export const t = createDictionaryTranslator({ featureDictionary: APP_DICT }, { commonDictionary: COMMON_I18N });

/**
 * The assistant dock copy that names the product, per locale — kept here, not in the reusable
 * package's dock dictionary. The dock's `t` (`@jini-ai/admin/shell/components/AssistantDock/assistant-dock-i18n`)
 * checks it first as its `hostDictionary`: the dock's own title, shown in the pane header, the
 * mobile-sheet bar and as the fallback conversation title.
 */
const ASSISTANT_DOCK_HOST_I18N: Record<string, Record<string, string>> = {
  es: {
    "Tovu assistant": "Asistente de Tovu",
  },
  id: {
    "Tovu assistant": "Asisten Tovu",
  },
  de: {
    "Tovu assistant": "Tovu-Assistent",
  },
  "zh-CN": {
    "Tovu assistant": "Tovu 助手",
  },
  "zh-TW": {
    "Tovu assistant": "Tovu 助理",
  },
  "pt-BR": {
    "Tovu assistant": "Assistente Tovu",
  },
  ru: {
    "Tovu assistant": "Ассистент Tovu",
  },
  fa: {
    "Tovu assistant": "دستیار Tovu",
  },
  ar: {
    "Tovu assistant": "مساعد Tovu",
  },
  ja: {
    "Tovu assistant": "Tovuアシスタント",
  },
  ko: {
    "Tovu assistant": "Tovu 어시스턴트",
  },
  pl: {
    "Tovu assistant": "Asystent Tovu",
  },
  hu: {
    "Tovu assistant": "Tovu asszisztens",
  },
  fr: {
    "Tovu assistant": "Assistant Tovu",
  },
  uk: {
    "Tovu assistant": "Асистент Tovu",
  },
  tr: {
    "Tovu assistant": "Tovu Asistanı",
  },
  th: {
    "Tovu assistant": "ผู้ช่วย Tovu",
  },
  it: {
    "Tovu assistant": "Assistente Tovu",
  },
  hi: {
    "Tovu assistant": "Tovu सहायक",
  },
  ur: {
    "Tovu assistant": "Tovu اسسٹنٹ",
  },
  bn: {
    "Tovu assistant": "Tovu সহকারী",
  },
};

/** What this app passes the dock's `t` beside `locale` and `key`: its product copy. */
export const ASSISTANT_DOCK_HOST_FIELDS: { hostDictionary: Record<string, Record<string, string>> } = {
  hostDictionary: ASSISTANT_DOCK_HOST_I18N,
};

/** The chat-pane adapter's product-naming copy: the composer footer's notice that the folder window
 *  opened on the computer running Tovu (rendered inside `JiniChatProvider` through `useT()`). */
const CHAT_PANE_HOST_I18N: Record<string, Record<string, string>> = {
  es: {
    "Folder window opened on the computer running Tovu": "Se abrió una ventana de carpetas en el equipo donde se ejecuta Tovu",
  },
  id: {
    "Folder window opened on the computer running Tovu": "Jendela folder terbuka di komputer yang menjalankan Tovu",
  },
  de: {
    "Folder window opened on the computer running Tovu": "Ordnerfenster auf dem Computer geöffnet, auf dem Tovu läuft",
  },
  "zh-CN": {
    "Folder window opened on the computer running Tovu": "文件夹窗口已在运行 Tovu 的电脑上打开",
  },
  "zh-TW": {
    "Folder window opened on the computer running Tovu": "資料夾視窗已在執行 Tovu 的電腦上開啟",
  },
  "pt-BR": {
    "Folder window opened on the computer running Tovu": "Janela de pastas aberta no computador que executa o Tovu",
  },
  ru: {
    "Folder window opened on the computer running Tovu": "Окно выбора папки открыто на компьютере, где работает Tovu",
  },
  fa: {
    "Folder window opened on the computer running Tovu": "پنجرهٔ پوشه روی رایانه‌ای که Tovu را اجرا می‌کند باز شد",
  },
  ar: {
    "Folder window opened on the computer running Tovu": "فُتحت نافذة المجلدات على الكمبيوتر الذي يشغّل Tovu",
  },
  ja: {
    "Folder window opened on the computer running Tovu": "Tovu を実行しているコンピューターでフォルダーウィンドウが開きました",
  },
  ko: {
    "Folder window opened on the computer running Tovu": "Tovu를 실행 중인 컴퓨터에서 폴더 창이 열렸습니다",
  },
  pl: {
    "Folder window opened on the computer running Tovu": "Okno folderów otwarte na komputerze, na którym działa Tovu",
  },
  hu: {
    "Folder window opened on the computer running Tovu": "A mappaablak a Tovut futtató számítógépen nyílt meg",
  },
  fr: {
    "Folder window opened on the computer running Tovu": "Fenêtre de dossiers ouverte sur l’ordinateur qui exécute Tovu",
  },
  uk: {
    "Folder window opened on the computer running Tovu": "Вікно вибору теки відкрито на комп’ютері, де працює Tovu",
  },
  tr: {
    "Folder window opened on the computer running Tovu": "Klasör penceresi Tovu’nun çalıştığı bilgisayarda açıldı",
  },
  th: {
    "Folder window opened on the computer running Tovu": "หน้าต่างโฟลเดอร์เปิดอยู่บนคอมพิวเตอร์ที่รัน Tovu",
  },
  it: {
    "Folder window opened on the computer running Tovu": "Finestra delle cartelle aperta sul computer che esegue Tovu",
  },
  hi: {
    "Folder window opened on the computer running Tovu": "फ़ोल्डर विंडो उस कंप्यूटर पर खुली है जिस पर Tovu चल रहा है",
  },
  ur: {
    "Folder window opened on the computer running Tovu": "فولڈر ونڈو اس کمپیوٹر پر کھلی ہے جس پر Tovu چل رہا ہے",
  },
  bn: {
    "Folder window opened on the computer running Tovu": "Tovu চলছে এমন কম্পিউটারে ফোল্ডার উইন্ডো খুলেছে",
  },
};

/** Everything this app passes `createChatI18nAdapter` beside `locale`: its product copy, plus the
 *  settings dialog's dictionaries for the two keys that dialog owns (the secret-redacted notice and
 *  the credential-card guidance), which the reusable package cannot import itself. */
export const CHAT_I18N_HOST_FIELDS: {
  hostDictionary: Record<string, Record<string, string>>;
  settingsDialogKeys: readonly string[];
  settingsDialogDictionaries: typeof SETTINGS_DIALOG_DICTIONARIES;
} = {
  hostDictionary: CHAT_PANE_HOST_I18N,
  settingsDialogKeys: [SECRET_REDACTED_NOTICE, CREDENTIAL_CARD_GUIDANCE],
  settingsDialogDictionaries: SETTINGS_DIALOG_DICTIONARIES,
};
