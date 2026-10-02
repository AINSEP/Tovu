/**
 * Language options offered by Tovu's admin interface. Shared by the selector and the
 * assistant's locale discovery tool; an option does not certify complete dictionary coverage.
 * English is the source language. Add translations before adding another offered option here.
 */
export const ADMIN_LOCALES: readonly { readonly code: string; readonly label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "de", label: "Deutsch" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "ru", label: "Русский" },
  { code: "fa", label: "فارسی" },
  { code: "ar", label: "العربية" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "pl", label: "Polski" },
  { code: "hu", label: "Magyar" },
  { code: "fr", label: "Français" },
  { code: "uk", label: "Українська" },
  { code: "tr", label: "Türkçe" },
  { code: "th", label: "ภาษาไทย" },
  { code: "it", label: "Italiano" },
  { code: "hi", label: "हिन्दी" },
  { code: "ur", label: "اردو" },
  { code: "bn", label: "বাংলা" },
];
