/** Public form copy follows the rendered document/form language; field labels remain authored. */
export const FORM_VALIDATION_COPY: Record<string, readonly [string, string, string, string, string]> = {
  en: ["Please enter {label}.", "Please select {label}.", "Please shorten {label}.", "Please check {label}.", "this field"],
  es: ["Introduce {label}.", "Selecciona {label}.", "Acorta {label}.", "Revisa {label}.", "este campo"],
  id: ["Silakan isi {label}.", "Silakan pilih {label}.", "Silakan persingkat {label}.", "Silakan periksa {label}.", "bidang ini"],
  de: ["Bitte füllen Sie {label} aus.", "Bitte wählen Sie {label} aus.", "Bitte kürzen Sie {label}.", "Bitte prüfen Sie {label}.", "dieses Feld"],
  "zh-CN": ["请填写{label}。", "请选择{label}。", "请缩短{label}。", "请检查{label}。", "此字段"],
  "zh-TW": ["請填寫{label}。", "請選擇{label}。", "請縮短{label}。", "請檢查{label}。", "此欄位"],
  "pt-BR": ["Preencha {label}.", "Selecione {label}.", "Encurte {label}.", "Verifique {label}.", "este campo"],
  ru: ["Заполните поле «{label}».", "Выберите «{label}».", "Сократите текст в поле «{label}».", "Проверьте поле «{label}».", "это поле"],
  fa: ["لطفاً {label} را وارد کنید.", "لطفاً {label} را انتخاب کنید.", "لطفاً {label} را کوتاه‌تر کنید.", "لطفاً {label} را بررسی کنید.", "این فیلد"],
  ar: ["يرجى إدخال {label}.", "يرجى اختيار {label}.", "يرجى تقصير {label}.", "يرجى التحقق من {label}.", "هذا الحقل"],
  ja: ["{label}を入力してください。", "{label}を選択してください。", "{label}を短くしてください。", "{label}を確認してください。", "この項目"],
  ko: ["{label}을(를) 입력해 주세요.", "{label}을(를) 선택해 주세요.", "{label}을(를) 줄여 주세요.", "{label}을(를) 확인해 주세요.", "이 항목"],
  pl: ["Wypełnij pole „{label}”.", "Wybierz „{label}”.", "Skróć tekst w polu „{label}”.", "Sprawdź pole „{label}”.", "to pole"],
  hu: ["Töltse ki ezt: {label}.", "Válassza ki ezt: {label}.", "Rövidítse le ezt: {label}.", "Ellenőrizze ezt: {label}.", "ez a mező"],
  fr: ["Veuillez renseigner {label}.", "Veuillez sélectionner {label}.", "Veuillez raccourcir {label}.", "Veuillez vérifier {label}.", "ce champ"],
  uk: ["Заповніть поле «{label}».", "Виберіть «{label}».", "Скоротіть текст у полі «{label}».", "Перевірте поле «{label}».", "це поле"],
  tr: ["Lütfen {label} alanını doldurun.", "Lütfen {label} seçeneğini seçin.", "Lütfen {label} metnini kısaltın.", "Lütfen {label} alanını kontrol edin.", "bu alan"],
  th: ["โปรดกรอก{label}", "โปรดเลือก{label}", "โปรดย่อ{label}ให้สั้นลง", "โปรดตรวจสอบ{label}", "ช่องนี้"],
  it: ["Compila {label}.", "Seleziona {label}.", "Accorcia {label}.", "Controlla {label}.", "questo campo"],
  hi: ["कृपया {label} भरें।", "कृपया {label} चुनें।", "कृपया {label} छोटा करें।", "कृपया {label} जाँचें।", "यह फ़ील्ड"],
  ur: ["براہ کرم {label} درج کریں۔", "براہ کرم {label} منتخب کریں۔", "براہ کرم {label} مختصر کریں۔", "براہ کرم {label} چیک کریں۔", "یہ خانہ"],
  bn: ["অনুগ্রহ করে {label} পূরণ করুন।", "অনুগ্রহ করে {label} নির্বাচন করুন।", "অনুগ্রহ করে {label} সংক্ষিপ্ত করুন।", "অনুগ্রহ করে {label} যাচাই করুন।", "এই ঘর"],
};

export function formValidationCopy({ locale }: { locale: string }, _optional = {}) {
  const normalized = locale.toLowerCase();
  const key = Object.keys(FORM_VALIDATION_COPY).find((key) => key.toLowerCase() === normalized)
    ?? (normalized.startsWith("zh") ? (/(tw|hk|hant)/.test(normalized) ? "zh-TW" : "zh-CN") : normalized.split("-")[0]);
  return FORM_VALIDATION_COPY[key] ?? (key === "pt" ? FORM_VALIDATION_COPY["pt-BR"] : FORM_VALIDATION_COPY.en);
}
