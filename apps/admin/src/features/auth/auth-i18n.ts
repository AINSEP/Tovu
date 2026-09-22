import { createDictionaryTranslator } from "../../lib/dictionary-translator";

/** Login-screen copy.  Keep this separate from the app-shell dictionary: Login is rendered
 * before the shell and must not fall back to English for a signed-out operator. */
const AUTH_DICT: Record<string, Record<string, string>> = {
  es: { "Sign in to your workspace": "Inicia sesión en tu espacio de trabajo", Username: "Nombre de usuario", Password: "Contraseña", "Sign in": "Iniciar sesión", "Signing in…": "Iniciando sesión…" },
  id: { "Sign in to your workspace": "Masuk ke ruang kerja Anda", Username: "Nama pengguna", Password: "Kata sandi", "Sign in": "Masuk", "Signing in…": "Sedang masuk…" },
  de: { "Sign in to your workspace": "Melden Sie sich bei Ihrem Arbeitsbereich an", Username: "Benutzername", Password: "Passwort", "Sign in": "Anmelden", "Signing in…": "Anmeldung läuft…" },
  "zh-CN": { "Sign in to your workspace": "登录您的工作区", Username: "用户名", Password: "密码", "Sign in": "登录", "Signing in…": "正在登录…" },
  "zh-TW": { "Sign in to your workspace": "登入您的工作區", Username: "使用者名稱", Password: "密碼", "Sign in": "登入", "Signing in…": "正在登入…" },
  "pt-BR": { "Sign in to your workspace": "Entre no seu espaço de trabalho", Username: "Nome de usuário", Password: "Senha", "Sign in": "Entrar", "Signing in…": "Entrando…" },
  ru: { "Sign in to your workspace": "Войдите в своё рабочее пространство", Username: "Имя пользователя", Password: "Пароль", "Sign in": "Войти", "Signing in…": "Выполняется вход…" },
  fa: { "Sign in to your workspace": "به فضای کاری خود وارد شوید", Username: "نام کاربری", Password: "گذرواژه", "Sign in": "ورود", "Signing in…": "در حال ورود…" },
  ar: { "Sign in to your workspace": "سجّل الدخول إلى مساحة عملك", Username: "اسم المستخدم", Password: "كلمة المرور", "Sign in": "تسجيل الدخول", "Signing in…": "جارٍ تسجيل الدخول…" },
  ja: { "Sign in to your workspace": "ワークスペースにサインイン", Username: "ユーザー名", Password: "パスワード", "Sign in": "サインイン", "Signing in…": "サインイン中…" },
  ko: { "Sign in to your workspace": "작업 공간에 로그인", Username: "사용자 이름", Password: "비밀번호", "Sign in": "로그인", "Signing in…": "로그인하는 중…" },
  pl: { "Sign in to your workspace": "Zaloguj się do swojego obszaru roboczego", Username: "Nazwa użytkownika", Password: "Hasło", "Sign in": "Zaloguj się", "Signing in…": "Logowanie…" },
  hu: { "Sign in to your workspace": "Jelentkezzen be a munkaterületére", Username: "Felhasználónév", Password: "Jelszó", "Sign in": "Bejelentkezés", "Signing in…": "Bejelentkezés folyamatban…" },
  fr: { "Sign in to your workspace": "Connectez-vous à votre espace de travail", Username: "Nom d’utilisateur", Password: "Mot de passe", "Sign in": "Se connecter", "Signing in…": "Connexion…" },
  uk: { "Sign in to your workspace": "Увійдіть до свого робочого простору", Username: "Ім’я користувача", Password: "Пароль", "Sign in": "Увійти", "Signing in…": "Виконується вхід…" },
  tr: { "Sign in to your workspace": "Çalışma alanınızda oturum açın", Username: "Kullanıcı adı", Password: "Parola", "Sign in": "Oturum aç", "Signing in…": "Oturum açılıyor…" },
  th: { "Sign in to your workspace": "ลงชื่อเข้าใช้พื้นที่ทำงานของคุณ", Username: "ชื่อผู้ใช้", Password: "รหัสผ่าน", "Sign in": "ลงชื่อเข้าใช้", "Signing in…": "กำลังลงชื่อเข้าใช้…" },
  it: { "Sign in to your workspace": "Accedi al tuo spazio di lavoro", Username: "Nome utente", Password: "Password", "Sign in": "Accedi", "Signing in…": "Accesso in corso…" },
  hi: { "Sign in to your workspace": "अपने कार्यक्षेत्र में साइन इन करें", Username: "उपयोगकर्ता नाम", Password: "पासवर्ड", "Sign in": "साइन इन करें", "Signing in…": "साइन इन हो रहा है…" },
  ur: { "Sign in to your workspace": "اپنی ورک اسپیس میں سائن ان کریں", Username: "صارف نام", Password: "پاس ورڈ", "Sign in": "سائن ان", "Signing in…": "سائن ان ہو رہا ہے…" },
  bn: { "Sign in to your workspace": "আপনার কর্মক্ষেত্রে সাইন ইন করুন", Username: "ব্যবহারকারীর নাম", Password: "পাসওয়ার্ড", "Sign in": "সাইন ইন করুন", "Signing in…": "সাইন ইন হচ্ছে…" },
};

export const t = createDictionaryTranslator(AUTH_DICT);
