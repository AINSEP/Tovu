import { COMMON_I18N } from "../../lib/i18n-common";
import { createTrashDictionary } from "@jini-ai/admin/screens/trash/trash-i18n/create-trash-dictionary";

/**
 * @file STAYS-HOST: host binding of the Jini Trash dictionary (`@jini-ai/admin/screens/trash/trash-i18n/create-trash-dictionary`)
 * plus product copy. The neutral dictionary data and its factory live in Jini; this file binds Tovu's own
 * `COMMON_I18N` as the shared-words fallback and carries the one entry that names the product (K3) in `productEntries`.
 * `rules.ts`'s `describeTrashLoadError` reads that entry.
 */
const productEntries: Record<string, Record<string, string>> = {
  es: { "The Tovu API did not respond. Try refreshing the Trash.": "La API de Tovu no respondió. Prueba a actualizar la papelera." },
  id: { "The Tovu API did not respond. Try refreshing the Trash.": "API Tovu tidak merespons. Coba muat ulang Sampah." },
  de: { "The Tovu API did not respond. Try refreshing the Trash.": "Die Tovu-API hat nicht geantwortet. Versuche, den Papierkorb zu aktualisieren." },
  "zh-CN": { "The Tovu API did not respond. Try refreshing the Trash.": "Tovu API 未响应。请尝试刷新回收站。" },
  "zh-TW": { "The Tovu API did not respond. Try refreshing the Trash.": "Tovu API 未回應。請嘗試重新整理資源回收筒。" },
  "pt-BR": { "The Tovu API did not respond. Try refreshing the Trash.": "A API do Tovu não respondeu. Tente atualizar a Lixeira." },
  ru: { "The Tovu API did not respond. Try refreshing the Trash.": "API Tovu не ответил. Попробуйте обновить корзину." },
  fa: { "The Tovu API did not respond. Try refreshing the Trash.": "API تووو پاسخ نداد. زباله‌دان را تازه‌سازی کنید." },
  ar: { "The Tovu API did not respond. Try refreshing the Trash.": "لم تستجب واجهة Tovu البرمجية. جرّب تحديث سلة المهملات." },
  ja: { "The Tovu API did not respond. Try refreshing the Trash.": "Tovu API が応答しませんでした。ゴミ箱を再読み込みしてください。" },
  ko: { "The Tovu API did not respond. Try refreshing the Trash.": "Tovu API가 응답하지 않았습니다. 휴지통을 새로고침해 보세요." },
  pl: { "The Tovu API did not respond. Try refreshing the Trash.": "API Tovu nie odpowiedziało. Spróbuj odświeżyć Kosz." },
  hu: { "The Tovu API did not respond. Try refreshing the Trash.": "A Tovu API nem válaszolt. Próbálja meg frissíteni a Kukát." },
  fr: { "The Tovu API did not respond. Try refreshing the Trash.": "L’API Tovu n’a pas répondu. Essayez d’actualiser la corbeille." },
  uk: { "The Tovu API did not respond. Try refreshing the Trash.": "API Tovu не відповів. Спробуйте оновити кошик." },
  tr: { "The Tovu API did not respond. Try refreshing the Trash.": "Tovu API yanıt vermedi. Çöp kutusunu yenilemeyi deneyin." },
  th: { "The Tovu API did not respond. Try refreshing the Trash.": "Tovu API ไม่ตอบสนอง ลองรีเฟรชถังขยะ" },
  it: { "The Tovu API did not respond. Try refreshing the Trash.": "L’API di Tovu non ha risposto. Prova ad aggiornare il Cestino." },
  hi: { "The Tovu API did not respond. Try refreshing the Trash.": "Tovu API ने जवाब नहीं दिया। ट्रैश को रीफ़्रेश करके देखें।" },
  ur: { "The Tovu API did not respond. Try refreshing the Trash.": "Tovu API نے جواب نہیں دیا۔ ردی کی ٹوکری کو ریفریش کریں۔" },
  bn: { "The Tovu API did not respond. Try refreshing the Trash.": "Tovu API সাড়া দেয়নি। ট্র্যাশ রিফ্রেশ করে দেখুন।" },
};

export const { dictionary: TRASH_DICT, t } = createTrashDictionary({ commonDictionary: COMMON_I18N, productEntries });
