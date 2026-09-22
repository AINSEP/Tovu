import { createDictionaryTranslator } from "../../lib/dictionary-translator";

/** Settings-shell copy that belongs to Tovu rather than the upstream dialog package. */
const SETTINGS_DICT: Record<string, Record<string, string>> = {
  es: { "Loading settings…": "Cargando configuración…", "Could not load saved settings (": "No se pudo cargar la configuración guardada (", "). Showing defaults — edits will still save.": "). Se muestran los valores predeterminados; las ediciones se seguirán guardando." },
  id: { "Loading settings…": "Memuat pengaturan…", "Could not load saved settings (": "Tidak dapat memuat pengaturan tersimpan (", "). Showing defaults — edits will still save.": "). Menampilkan nilai bawaan — perubahan tetap akan disimpan." },
  de: { "Loading settings…": "Einstellungen werden geladen…", "Could not load saved settings (": "Gespeicherte Einstellungen konnten nicht geladen werden (", "). Showing defaults — edits will still save.": "). Die Standardwerte werden angezeigt — Änderungen werden weiterhin gespeichert." },
  "zh-CN": { "Loading settings…": "正在加载设置…", "Could not load saved settings (": "无法加载已保存的设置（", "). Showing defaults — edits will still save.": "）。正在显示默认值，编辑仍会保存。" },
  "zh-TW": { "Loading settings…": "正在載入設定…", "Could not load saved settings (": "無法載入已儲存的設定（", "). Showing defaults — edits will still save.": "）。正在顯示預設值，編輯仍會儲存。" },
  "pt-BR": { "Loading settings…": "Carregando configurações…", "Could not load saved settings (": "Não foi possível carregar as configurações salvas (", "). Showing defaults — edits will still save.": "). Exibindo os padrões — as edições ainda serão salvas." },
  ru: { "Loading settings…": "Загрузка настроек…", "Could not load saved settings (": "Не удалось загрузить сохранённые настройки (", "). Showing defaults — edits will still save.": "). Показаны значения по умолчанию — изменения всё равно будут сохранены." },
  fa: { "Loading settings…": "در حال بارگذاری تنظیمات…", "Could not load saved settings (": "تنظیمات ذخیره‌شده بارگذاری نشد (", "). Showing defaults — edits will still save.": "). مقادیر پیش‌فرض نمایش داده می‌شوند و ویرایش‌ها همچنان ذخیره خواهند شد." },
  ar: { "Loading settings…": "جارٍ تحميل الإعدادات…", "Could not load saved settings (": "تعذر تحميل الإعدادات المحفوظة (", "). Showing defaults — edits will still save.": "). تُعرض القيم الافتراضية، وستظل التعديلات محفوظة." },
  ja: { "Loading settings…": "設定を読み込み中…", "Could not load saved settings (": "保存した設定を読み込めませんでした（", "). Showing defaults — edits will still save.": "）。既定値を表示していますが、編集内容は保存されます。" },
  ko: { "Loading settings…": "설정을 불러오는 중…", "Could not load saved settings (": "저장된 설정을 불러올 수 없습니다 (", "). Showing defaults — edits will still save.": "). 기본값을 표시하며, 편집 내용은 계속 저장됩니다." },
  pl: { "Loading settings…": "Wczytywanie ustawień…", "Could not load saved settings (": "Nie udało się wczytać zapisanych ustawień (", "). Showing defaults — edits will still save.": "). Wyświetlane są wartości domyślne — zmiany nadal będą zapisywane." },
  hu: { "Loading settings…": "Beállítások betöltése…", "Could not load saved settings (": "A mentett beállításokat nem sikerült betölteni (", "). Showing defaults — edits will still save.": "). Az alapértékek láthatók, a módosítások továbbra is mentésre kerülnek." },
  fr: { "Loading settings…": "Chargement des paramètres…", "Could not load saved settings (": "Impossible de charger les paramètres enregistrés (", "). Showing defaults — edits will still save.": "). Les valeurs par défaut sont affichées ; vos modifications seront tout de même enregistrées." },
  uk: { "Loading settings…": "Завантаження налаштувань…", "Could not load saved settings (": "Не вдалося завантажити збережені налаштування (", "). Showing defaults — edits will still save.": "). Показано типові значення — зміни все одно буде збережено." },
  tr: { "Loading settings…": "Ayarlar yükleniyor…", "Could not load saved settings (": "Kaydedilmiş ayarlar yüklenemedi (", "). Showing defaults — edits will still save.": "). Varsayılanlar gösteriliyor; düzenlemeler yine de kaydedilecek." },
  th: { "Loading settings…": "กำลังโหลดการตั้งค่า…", "Could not load saved settings (": "ไม่สามารถโหลดการตั้งค่าที่บันทึกไว้ได้ (", "). Showing defaults — edits will still save.": "). กำลังแสดงค่าเริ่มต้น และการแก้ไขจะยังคงบันทึกไว้" },
  it: { "Loading settings…": "Caricamento impostazioni…", "Could not load saved settings (": "Impossibile caricare le impostazioni salvate (", "). Showing defaults — edits will still save.": "). Vengono mostrati i valori predefiniti; le modifiche saranno comunque salvate." },
  hi: { "Loading settings…": "सेटिंग लोड हो रही हैं…", "Could not load saved settings (": "सहेजी गई सेटिंग लोड नहीं हो सकीं (", "). Showing defaults — edits will still save.": "). डिफ़ॉल्ट दिखाए जा रहे हैं — संपादन फिर भी सहेजे जाएंगे।" },
  ur: { "Loading settings…": "ترتیبات لوڈ ہو رہی ہیں…", "Could not load saved settings (": "محفوظ شدہ ترتیبات لوڈ نہیں ہو سکیں (", "). Showing defaults — edits will still save.": ")۔ طے شدہ اقدار دکھائی جا رہی ہیں، اور ترمیمات پھر بھی محفوظ ہوں گی۔" },
  bn: { "Loading settings…": "সেটিংস লোড হচ্ছে…", "Could not load saved settings (": "সংরক্ষিত সেটিংস লোড করা যায়নি (", "). Showing defaults — edits will still save.": ")। ডিফল্ট মান দেখানো হচ্ছে — সম্পাদনাগুলি তবুও সংরক্ষিত হবে।" },
};

export const t = createDictionaryTranslator(SETTINGS_DICT);
