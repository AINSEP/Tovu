import { describe, expect, it } from 'vitest';
import { SETTINGS_DIALOG_DICTIONARIES } from '@jini-ai/ui';
import { ADMIN_LOCALES } from '@/lib/settings-tabs';
import { t, aiAgentPanelDictionaries } from '../settings-execution-i18n';
import { t as tSecurity } from '../../security/security-i18n';
import { AI_ASSISTANT_DICT } from '../../ai-assistant/ai-assistant-i18n';

const expected: Record<string, readonly [string, string, string]> = {
  "en": [
    "AI agent",
    "Detected on this computer.",
    "Authentication required. Sign in before sending."
  ],
  "es": [
    "Agente de IA",
    "Detectado en este ordenador.",
    "Se requiere autenticación. Inicia sesión antes de enviar."
  ],
  "id": [
    "Agen AI",
    "Terdeteksi di komputer ini.",
    "Autentikasi diperlukan. Masuk sebelum mengirim."
  ],
  "de": [
    "KI-Agent",
    "Auf diesem Computer erkannt.",
    "Authentifizierung erforderlich. Melden Sie sich vor dem Senden an."
  ],
  "zh-CN": [
    "AI 智能体",
    "在这台计算机上检测到。",
    "需要身份验证。请先登录再发送。"
  ],
  "zh-TW": [
    "AI 代理",
    "在這台電腦上偵測到。",
    "需要驗證身分。請先登入再傳送。"
  ],
  "pt-BR": [
    "Agente de IA",
    "Detectado neste computador.",
    "Autenticação necessária. Entre antes de enviar."
  ],
  "ru": [
    "ИИ-агент",
    "Обнаружено на этом компьютере.",
    "Требуется авторизация. Войдите перед отправкой."
  ],
  "fa": [
    "عامل هوش مصنوعی",
    "روی این رایانه شناسایی شد.",
    "احراز هویت لازم است. پیش از ارسال وارد شوید."
  ],
  "ar": [
    "وكيل الذكاء الاصطناعي",
    "اكتُشف على هذا الكمبيوتر.",
    "المصادقة مطلوبة. سجّل الدخول قبل الإرسال."
  ],
  "ja": [
    "AI エージェント",
    "このコンピューターで検出されました。",
    "認証が必要です。送信する前にログインしてください。"
  ],
  "ko": [
    "AI 에이전트",
    "이 컴퓨터에서 감지되었습니다.",
    "인증이 필요합니다. 보내기 전에 로그인하세요."
  ],
  "pl": [
    "Agent AI",
    "Wykryto na tym komputerze.",
    "Wymagane uwierzytelnienie. Zaloguj się przed wysłaniem."
  ],
  "hu": [
    "AI-ügynök",
    "Ezen a számítógépen észlelve.",
    "Hitelesítés szükséges. Küldés előtt jelentkezzen be."
  ],
  "fr": [
    "Agent IA",
    "Détecté sur cet ordinateur.",
    "Authentification requise. Connectez-vous avant d’envoyer."
  ],
  "uk": [
    "ШІ-агент",
    "Виявлено на цьому комп’ютері.",
    "Потрібна автентифікація. Увійдіть перед надсиланням."
  ],
  "tr": [
    "Yapay zekâ ajanı",
    "Bu bilgisayarda algılandı.",
    "Kimlik doğrulaması gerekiyor. Göndermeden önce oturum açın."
  ],
  "th": [
    "เอเจนต์ AI",
    "ตรวจพบบนคอมพิวเตอร์เครื่องนี้",
    "ต้องยืนยันตัวตน โปรดเข้าสู่ระบบก่อนส่ง"
  ],
  "it": [
    "Agente IA",
    "Rilevato su questo computer.",
    "Autenticazione richiesta. Accedi prima di inviare."
  ],
  "hi": [
    "AI एजेंट",
    "इस कंप्यूटर पर पता लगाया गया।",
    "प्रमाणीकरण आवश्यक है। भेजने से पहले साइन इन करें।"
  ],
  "ur": [
    "AI ایجنٹ",
    "اس کمپیوٹر پر دریافت ہوا۔",
    "توثیق درکار ہے۔ بھیجنے سے پہلے سائن ان کریں۔"
  ],
  "bn": [
    "AI এজেন্ট",
    "এই কম্পিউটারে শনাক্ত হয়েছে।",
    "প্রমাণীকরণ প্রয়োজন। পাঠানোর আগে সাইন ইন করুন।"
  ]
};

describe('AI agent copy in every supported locale', () => {
  it('has an exact expected entry for every admin locale', () => {
    expect(ADMIN_LOCALES.map((locale) => locale.code).sort()).toEqual(Object.keys(expected).sort());
  });
  it.each(Object.keys(expected))('%s: exact title, scope, warning and package ARIA overlay', (locale) => {
    const [title, scope, warning] = expected[locale]!;
    expect(t({ locale: locale, key: 'AI agent' })).toBe(title);
    expect(t({ locale: locale, key: 'Detected on this computer.' })).toBe(scope);
    expect(t({ locale: locale, key: 'Authentication required. Sign in before sending.' })).toBe(warning);
    const dictionaries = aiAgentPanelDictionaries({ dictionaries: SETTINGS_DIALOG_DICTIONARIES });
    expect(dictionaries[locale]?.['Execution mode']).toBe(title);
    expect(dictionaries[locale]?.['AI agent']).toBe(title);
    expect(tSecurity({ locale: locale, key: 'Settings · AI agent' }).split(' · ')[1]).toBe(title);
    const key = 'It is a different key from the one under Settings → AI agent → BYOK. That one is your own, it is stored on the server, encrypted, for your admin account only, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.';
    expect(AI_ASSISTANT_DICT[locale]?.[key] ?? key).toContain(`→ ${title} → BYOK`);
  });
  it('falls back to exact English for unsupported locales', () => {
    expect(t({ locale: 'unknown', key: 'AI agent' })).toBe('AI agent');
    expect(t({ locale: 'unknown', key: 'Authentication required. Sign in before sending.' })).toBe('Authentication required. Sign in before sending.');
  });
});
