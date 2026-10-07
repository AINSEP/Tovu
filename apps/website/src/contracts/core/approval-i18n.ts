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
const KEYS = ['Confirm action?', 'Confirm', 'Cancel', 'Tool', 'Input'] as const;
export function approvalText({ locale, key }: { locale: string; key: typeof KEYS[number] }, _optional = {}): string {
  return (APPROVAL_COPY[locale as keyof typeof APPROVAL_COPY] ?? APPROVAL_COPY.en)[KEYS.indexOf(key)];
}
