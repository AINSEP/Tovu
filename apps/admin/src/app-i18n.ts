import { createDictionaryTranslator } from "./lib/dictionary-translator";

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
 * Same 21-locale set and order as `admin-nav-i18n.ts`/every feature `*-i18n.ts` file in this app.
 */

const APP_DICT: Record<string, Record<string, string>> = {
  es: {
    "Log out?": "¿Cerrar sesión?",
    "Are you sure you want to log out?": "¿Seguro que quieres cerrar sesión?",
  },
  id: {
    "Log out?": "Keluar?",
    "Are you sure you want to log out?": "Yakin ingin keluar?",
  },
  de: {
    "Log out?": "Abmelden?",
    "Are you sure you want to log out?": "Möchten Sie sich wirklich abmelden?",
  },
  "zh-CN": {
    "Log out?": "退出登录?",
    "Are you sure you want to log out?": "确定要退出登录吗?",
  },
  "zh-TW": {
    "Log out?": "登出?",
    "Are you sure you want to log out?": "確定要登出嗎?",
  },
  "pt-BR": {
    "Log out?": "Sair?",
    "Are you sure you want to log out?": "Tem certeza de que deseja sair?",
  },
  ru: {
    "Log out?": "Выйти?",
    "Are you sure you want to log out?": "Вы уверены, что хотите выйти?",
  },
  fa: {
    "Log out?": "خروج؟",
    "Are you sure you want to log out?": "آیا مطمئن هستید که می‌خواهید خارج شوید؟",
  },
  ar: {
    "Log out?": "تسجيل الخروج؟",
    "Are you sure you want to log out?": "هل أنت متأكد أنك تريد تسجيل الخروج؟",
  },
  ja: {
    "Log out?": "ログアウトしますか?",
    "Are you sure you want to log out?": "本当にログアウトしますか?",
  },
  ko: {
    "Log out?": "로그아웃하시겠습니까?",
    "Are you sure you want to log out?": "정말로 로그아웃하시겠습니까?",
  },
  pl: {
    "Log out?": "Wylogować się?",
    "Are you sure you want to log out?": "Czy na pewno chcesz się wylogować?",
  },
  hu: {
    "Log out?": "Kijelentkezés?",
    "Are you sure you want to log out?": "Biztosan ki szeretne jelentkezni?",
  },
  fr: {
    "Log out?": "Se déconnecter ?",
    "Are you sure you want to log out?": "Voulez-vous vraiment vous déconnecter ?",
  },
  uk: {
    "Log out?": "Вийти?",
    "Are you sure you want to log out?": "Ви впевнені, що хочете вийти?",
  },
  tr: {
    "Log out?": "Çıkış yapılsın mı?",
    "Are you sure you want to log out?": "Çıkış yapmak istediğinizden emin misiniz?",
  },
  th: {
    "Log out?": "ออกจากระบบ?",
    "Are you sure you want to log out?": "คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?",
  },
  it: {
    "Log out?": "Uscire?",
    "Are you sure you want to log out?": "Sei sicuro di voler uscire?",
  },
  hi: {
    "Log out?": "लॉग आउट करें?",
    "Are you sure you want to log out?": "क्या आप वाकई लॉग आउट करना चाहते हैं?",
  },
  ur: {
    "Log out?": "لاگ آؤٹ کریں؟",
    "Are you sure you want to log out?": "کیا آپ واقعی لاگ آؤٹ کرنا چاہتے ہیں؟",
  },
  bn: {
    "Log out?": "লগ আউট করবেন?",
    "Are you sure you want to log out?": "আপনি কি নিশ্চিতভাবে লগ আউট করতে চান?",
  },
};

export const t = createDictionaryTranslator(APP_DICT);
