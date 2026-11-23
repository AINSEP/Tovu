import { COMMON_I18N } from "../../lib/i18n-common";
import { createMembersTranslator } from "@jini-ai/user-management/react/members/members-i18n";
/**
 * @file Host binding of the Members dictionary (`MEMBERS_DICT`, in `@jini-ai/user-management`) to
 * THIS app's common dictionary, plus the translations of the copy this app passes to the screen as
 * `description`/`emptyDescription` (`MembersPanel.tsx`). That copy names members "site visitors" —
 * product wording, so its translations stay here rather than in the package dictionary.
 *
 * `MEMBERS_HOST_COPY[locale]?.[key] ?? MEMBERS_DICT[locale]?.[key] ?? COMMON_I18N[locale]?.[key] ?? key`.
 */
const MEMBERS_HOST_COPY: Record<string, Record<string, string>> = {
  es: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "Visitantes del sitio que han registrado una cuenta: revisa el estado, reenvía un enlace de acceso o desactiva el acceso.",
    "Registered site visitors will show up here.": "Los visitantes del sitio registrados aparecerán aquí.",
  },
  id: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "Pengunjung situs yang telah mendaftarkan akun — tinjau statusnya, kirim ulang tautan masuk, atau nonaktifkan akses.",
    "Registered site visitors will show up here.": "Pengunjung situs yang terdaftar akan muncul di sini.",
  },
  de: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "Website-Besucher, die ein Konto registriert haben — Status prüfen, Anmeldelink erneut senden oder Zugriff deaktivieren.",
    "Registered site visitors will show up here.": "Registrierte Website-Besucher werden hier angezeigt.",
  },
  "zh-CN": {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "已注册账户的网站访问者——查看状态、重新发送登录链接或禁用访问权限。",
    "Registered site visitors will show up here.": "已注册的网站访问者将显示在此处。",
  },
  "zh-TW": {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "已註冊帳戶的網站訪客 — 檢視狀態、重新傳送登入連結，或停用存取權限。",
    "Registered site visitors will show up here.": "已註冊的網站訪客將顯示於此。",
  },
  "pt-BR": {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "Visitantes do site que registraram uma conta — revise o status, reenvie um link de acesso ou desative o acesso.",
    "Registered site visitors will show up here.": "Os visitantes do site registrados aparecerão aqui.",
  },
  ru: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "Посетители сайта, зарегистрировавшие учётную запись — просматривайте статус, повторно отправляйте ссылку для входа или отключайте доступ.",
    "Registered site visitors will show up here.": "Зарегистрированные посетители сайта будут отображаться здесь.",
  },
  fa: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "بازدیدکنندگان سایت که حسابی ثبت کرده‌اند — وضعیت را بررسی کنید، لینک ورود را دوباره ارسال کنید یا دسترسی را غیرفعال کنید.",
    "Registered site visitors will show up here.": "بازدیدکنندگان ثبت‌نام‌شده در اینجا نمایش داده می‌شوند.",
  },
  ar: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "زوار الموقع الذين سجّلوا حسابًا — راجع الحالة، أو أعد إرسال رابط تسجيل الدخول، أو عطّل الوصول.",
    "Registered site visitors will show up here.": "سيظهر هنا زوار الموقع المسجَّلون.",
  },
  ja: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "アカウントを登録済みのサイト訪問者です。ステータスの確認、サインインリンクの再送信、アクセスの無効化ができます。",
    "Registered site visitors will show up here.": "登録済みのサイト訪問者がここに表示されます。",
  },
  ko: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "계정을 등록한 사이트 방문자입니다 — 상태를 확인하거나, 로그인 링크를 재전송하거나, 접근을 비활성화하세요.",
    "Registered site visitors will show up here.": "등록된 사이트 방문자가 여기에 표시됩니다.",
  },
  pl: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "Odwiedzający witrynę, którzy zarejestrowali konto — sprawdzaj status, wysyłaj ponownie link logowania lub wyłączaj dostęp.",
    "Registered site visitors will show up here.": "Zarejestrowani odwiedzający witrynę pojawią się tutaj.",
  },
  hu: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "Fiókot regisztrált weboldal-látogatók — nézd meg az állapotukat, küldd újra a bejelentkezési linket, vagy tiltsd le a hozzáférésüket.",
    "Registered site visitors will show up here.": "A regisztrált weboldal-látogatók itt jelennek meg.",
  },
  fr: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "Visiteurs du site ayant enregistré un compte — consultez le statut, renvoyez un lien de connexion ou désactivez l'accès.",
    "Registered site visitors will show up here.": "Les visiteurs du site enregistrés apparaîtront ici.",
  },
  uk: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "Відвідувачі сайту, які зареєстрували обліковий запис — переглядайте статус, повторно надсилайте посилання для входу або вимикайте доступ.",
    "Registered site visitors will show up here.": "Зареєстровані відвідувачі сайту з'являтимуться тут.",
  },
  tr: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "Hesap kaydeden site ziyaretçileri — durumu inceleyin, oturum açma bağlantısını yeniden gönderin veya erişimi devre dışı bırakın.",
    "Registered site visitors will show up here.": "Kayıtlı site ziyaretçileri burada görünecek.",
  },
  th: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "ผู้เยี่ยมชมเว็บไซต์ที่ลงทะเบียนบัญชีแล้ว — ตรวจสอบสถานะ ส่งลิงก์เข้าสู่ระบบอีกครั้ง หรือปิดใช้งานการเข้าถึง",
    "Registered site visitors will show up here.": "ผู้เยี่ยมชมเว็บไซต์ที่ลงทะเบียนแล้วจะแสดงที่นี่",
  },
  it: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "Visitatori del sito che hanno registrato un account — controlla lo stato, reinvia un link di accesso o disabilita l'accesso.",
    "Registered site visitors will show up here.": "I visitatori del sito registrati verranno visualizzati qui.",
  },
  hi: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "साइट विज़िटर जिन्होंने खाता पंजीकृत किया है — स्थिति देखें, साइन-इन लिंक फिर से भेजें, या पहुंच अक्षम करें।",
    "Registered site visitors will show up here.": "पंजीकृत साइट विज़िटर यहां दिखाई देंगे।",
  },
  ur: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "سائٹ وزیٹرز جنہوں نے اکاؤنٹ رجسٹر کیا ہے — حیثیت دیکھیں، سائن ان لنک دوبارہ بھیجیں، یا رسائی غیرفعال کریں۔",
    "Registered site visitors will show up here.": "رجسٹرڈ سائٹ وزیٹرز یہاں ظاہر ہوں گے۔",
  },
  bn: {
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "সাইট ভিজিটর যারা একটি অ্যাকাউন্ট নিবন্ধন করেছেন — অবস্থা পর্যালোচনা করুন, সাইন-ইন লিঙ্ক পুনরায় পাঠান, অথবা অ্যাক্সেস নিষ্ক্রিয় করুন।",
    "Registered site visitors will show up here.": "নিবন্ধিত সাইট ভিজিটর এখানে দেখা যাবে।",
  },
};

export const t = createMembersTranslator({ commonDictionary: COMMON_I18N }, { hostCopy: MEMBERS_HOST_COPY });
