import { approvalText as coreApprovalText } from "@jini-ai/core/contracts/site/approval-i18n";

const ROUTINE_AVAILABILITY_KEY = 'This routine runs only while Tovu is open and your computer is awake';
const ROUTINE_AVAILABILITY_COPY = {
  en: 'This routine runs only while Tovu is open and your computer is awake',
  es: 'Esta rutina solo se ejecuta mientras Tovu está abierto y tu ordenador está activo',
  id: 'Rutinitas ini hanya berjalan saat Tovu terbuka dan komputer Anda aktif',
  de: 'Diese Routine läuft nur, solange Tovu geöffnet und Ihr Computer eingeschaltet ist',
  'zh-CN': '此例行任务仅在 Tovu 打开且电脑处于唤醒状态时运行',
  'zh-TW': '此例行任務僅在 Tovu 開啟且電腦處於喚醒狀態時執行',
  'pt-BR': 'Esta rotina só é executada enquanto o Tovu estiver aberto e o computador estiver ativo',
  ru: 'Эта рутина выполняется, только пока Tovu открыт, а компьютер не спит',
  fa: 'این روتین فقط وقتی اجرا می‌شود که Tovu باز باشد و رایانه شما بیدار باشد',
  ar: 'يعمل هذا الروتين فقط أثناء فتح Tovu وبقاء جهازك نشطًا',
  ja: 'このルーティンは、Tovu が開いていてコンピューターがスリープしていない間だけ実行されます',
  ko: '이 루틴은 Tovu가 열려 있고 컴퓨터가 절전 상태가 아닐 때만 실행됩니다',
  pl: 'Ta rutyna działa tylko wtedy, gdy Tovu jest otwarte, a komputer nie śpi',
  hu: 'Ez a rutin csak akkor fut, amíg a Tovu meg van nyitva, és a számítógép ébren van',
  fr: 'Cette routine ne s’exécute que lorsque Tovu est ouvert et que votre ordinateur est actif',
  uk: 'Ця рутина виконується, лише поки Tovu відкрито, а комп’ютер не спить',
  tr: 'Bu rutin yalnızca Tovu açıkken ve bilgisayarınız uyanıkken çalışır',
  th: 'รูทีนนี้ทำงานเฉพาะขณะที่ Tovu เปิดอยู่และคอมพิวเตอร์ของคุณไม่อยู่ในโหมดสลีป',
  it: 'Questa routine viene eseguita solo mentre Tovu è aperto e il computer è attivo',
  hi: 'यह रूटीन केवल तब चलता है जब Tovu खुला हो और आपका कंप्यूटर चालू हो',
  ur: 'یہ روٹین صرف اسی وقت چلتی ہے جب Tovu کھلا ہو اور آپ کا کمپیوٹر جاگ رہا ہو',
  bn: 'এই রুটিন শুধু তখনই চলে যখন Tovu খোলা থাকে এবং আপনার কম্পিউটার জাগ্রত থাকে',
} as const;

export function approvalText({ locale, key }: { locale: string; key: string }, _optional = {}): string {
  if (key === ROUTINE_AVAILABILITY_KEY) return (Object.hasOwn(ROUTINE_AVAILABILITY_COPY, locale) ? ROUTINE_AVAILABILITY_COPY[locale as keyof typeof ROUTINE_AVAILABILITY_COPY] : ROUTINE_AVAILABILITY_COPY.en);
  return coreApprovalText({ locale, key });
}
