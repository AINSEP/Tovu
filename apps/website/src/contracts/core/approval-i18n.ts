/** Confirmation cards use the same operator locale codes as the admin language selector. */
export const APPROVAL_COPY = {
  en: ['Confirm action?', 'Confirm', 'Cancel', 'Tool', 'Input'],
  es: ['¿Confirmar acción?', 'Confirmar', 'Cancelar', 'Herramienta', 'Entrada'],
  id: ['Konfirmasi tindakan?', 'Konfirmasi', 'Batal', 'Alat', 'Masukan'],
  de: ['Aktion bestätigen?', 'Bestätigen', 'Abbrechen', 'Werkzeug', 'Eingabe'],
  'zh-CN': ['确认操作？', '确认', '取消', '工具', '输入'],
  'zh-TW': ['確認操作？', '確認', '取消', '工具', '輸入'],
  'pt-BR': ['Confirmar ação?', 'Confirmar', 'Cancelar', 'Ferramenta', 'Entrada'],
  ru: ['Подтвердить действие?', 'Подтвердить', 'Отмена', 'Инструмент', 'Ввод'],
  fa: ['عملیات را تأیید می‌کنید؟', 'تأیید', 'لغو', 'ابزار', 'ورودی'],
  ar: ['تأكيد الإجراء؟', 'تأكيد', 'إلغاء', 'الأداة', 'المدخلات'],
  ja: ['操作を確認しますか？', '確認', 'キャンセル', 'ツール', '入力'],
  ko: ['작업을 확인하시겠습니까?', '확인', '취소', '도구', '입력'],
  pl: ['Potwierdzić działanie?', 'Potwierdź', 'Anuluj', 'Narzędzie', 'Dane wejściowe'],
  hu: ['Megerősíti a műveletet?', 'Megerősítés', 'Mégse', 'Eszköz', 'Bemenet'],
  fr: ['Confirmer l’action ?', 'Confirmer', 'Annuler', 'Outil', 'Entrée'],
  uk: ['Підтвердити дію?', 'Підтвердити', 'Скасувати', 'Інструмент', 'Вхідні дані'],
  tr: ['İşlem onaylansın mı?', 'Onayla', 'İptal', 'Araç', 'Girdi'],
  th: ['ยืนยันการดำเนินการหรือไม่?', 'ยืนยัน', 'ยกเลิก', 'เครื่องมือ', 'ข้อมูลเข้า'],
  it: ['Confermare l’azione?', 'Conferma', 'Annulla', 'Strumento', 'Dati in ingresso'],
  hi: ['कार्रवाई की पुष्टि करें?', 'पुष्टि करें', 'रद्द करें', 'टूल', 'इनपुट'],
  ur: ['کارروائی کی تصدیق کریں؟', 'تصدیق کریں', 'منسوخ کریں', 'ٹول', 'ان پٹ'],
  bn: ['কাজটি নিশ্চিত করবেন?', 'নিশ্চিত করুন', 'বাতিল করুন', 'টুল', 'ইনপুট'],
} as const;
const KEYS: readonly string[] = ['Confirm action?', 'Confirm', 'Cancel', 'Tool', 'Input'];
const ACTION_KEYS: readonly string[] = ['Technical name', '{action}?', 'Publish static site', 'Publish'];
/** Catalog copy uses exact-key lookup; unknown tool names and schema labels remain verbatim. */
const ACTION_COPY = {
  en: ['Technical name', '{action}?', 'Publish static site', 'Publish'],
  es: ['Nombre técnico', '¿{action}?', 'Publicar sitio estático', 'Publicar'],
  id: ['Nama teknis', '{action}?', 'Publikasikan situs statis', 'Publikasikan'],
  de: ['Technischer Name', '{action}?', 'Statische Website veröffentlichen', 'Veröffentlichen'],
  'zh-CN': ['技术名称', '{action}？', '发布静态网站', '发布'],
  'zh-TW': ['技術名稱', '{action}？', '發布靜態網站', '發布'],
  'pt-BR': ['Nome técnico', '{action}?', 'Publicar site estático', 'Publicar'],
  ru: ['Техническое имя', '{action}?', 'Опубликовать статический сайт', 'Опубликовать'],
  fa: ['نام فنی', '{action}؟', 'انتشار سایت ایستا', 'انتشار'],
  ar: ['الاسم التقني', '{action}؟', 'نشر موقع ثابت', 'نشر'],
  ja: ['技術名', '{action}しますか？', '静的サイトを公開', '公開'],
  ko: ['기술 이름', '{action}하시겠습니까?', '정적 사이트 게시', '게시'],
  pl: ['Nazwa techniczna', '{action}?', 'Opublikować witrynę statyczną', 'Opublikuj'],
  hu: ['Technikai név', '{action}?', 'Statikus webhely közzététele', 'Közzététel'],
  fr: ['Nom technique', '{action} ?', 'Publier le site statique', 'Publier'],
  uk: ['Технічна назва', '{action}?', 'Опублікувати статичний сайт', 'Опублікувати'],
  tr: ['Teknik ad', '{action}?', 'Statik siteyi yayınla', 'Yayınla'],
  th: ['ชื่อทางเทคนิค', '{action}หรือไม่?', 'เผยแพร่เว็บไซต์แบบคงที่', 'เผยแพร่'],
  it: ['Nome tecnico', '{action}?', 'Pubblicare il sito statico', 'Pubblica'],
  hi: ['तकनीकी नाम', '{action} की पुष्टि करें?', 'स्थिर साइट प्रकाशित करें', 'प्रकाशित करें'],
  ur: ['تکنیکی نام', '{action} کی تصدیق کریں؟', 'جامد سائٹ شائع کریں', 'شائع کریں'],
  bn: ['প্রযুক্তিগত নাম', '{action} নিশ্চিত করবেন?', 'স্থির সাইট প্রকাশ করুন', 'প্রকাশ করুন'],
} as const satisfies Record<keyof typeof APPROVAL_COPY, readonly string[]>;

/** Translate approval chrome and registered catalog copy, falling back to English or the key.
 * @complexity O(k) time for bounded copy-key lookup, O(1) space; no effects. */
export function approvalText({ locale, key }: { locale: string; key: string }, _optional = {}): string {
  const copy = APPROVAL_COPY[locale as keyof typeof APPROVAL_COPY] ?? APPROVAL_COPY.en;
  const actionCopy = ACTION_COPY[locale as keyof typeof ACTION_COPY] ?? ACTION_COPY.en;
  return copy[KEYS.indexOf(key)] ?? actionCopy[ACTION_KEYS.indexOf(key)] ?? key;
}
