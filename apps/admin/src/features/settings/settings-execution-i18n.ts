/**
 * @file The Settings screen's own copy for its Execution mode tab: what the admin's stored BYOK key
 * cannot do at the form's endpoint. Both keys are `lib/stored-credential-endpoint.ts`'s copy constants,
 * rendered by `AdminByokKeyFooter`'s status line and by `ExecutionTab`'s failed-discovery line through
 * `createProbeErrorDescriber`.
 *
 * Not in `SettingsUi.tsx`'s `t`: that one reads `@jini-ai/ui`'s and `@jini-ai/cms`'s settings-dialog
 * dictionaries, which are other packages' copy. Not in `settings-capabilities-i18n.ts` either: that file is
 * the "no backend yet" notes.
 *
 * The same two keys live in `features/ai-assistant/ai-assistant-i18n.ts` for AI Assistant's mount of the
 * same form. The values here are copied from there verbatim, so the two screens word the ask alike;
 * `__tests__/settings-execution-i18n.unit.test.ts` fails if either copy changes alone.
 */

import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const SETTINGS_EXECUTION_DICT: Record<string, Record<string, string>> = {
  es: {
    "Your saved key is for a different provider. Paste a key for this one.": "Tu clave guardada es de otro proveedor. Pega una clave para este.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Tu clave guardada no tiene un proveedor guardado. Pega la clave de nuevo para probarla.",
  },
  id: {
    "Your saved key is for a different provider. Paste a key for this one.": "Kunci tersimpan Anda untuk penyedia lain. Tempel kunci untuk penyedia ini.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Kunci tersimpan Anda tidak memiliki penyedia yang tersimpan. Tempel kunci lagi untuk mengujinya.",
  },
  de: {
    "Your saved key is for a different provider. Paste a key for this one.": "Ihr gespeicherter Schlüssel gehört zu einem anderen Anbieter. Fügen Sie einen Schlüssel für diesen ein.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Für Ihren gespeicherten Schlüssel ist kein Anbieter gespeichert. Fügen Sie den Schlüssel erneut ein, um ihn zu testen.",
  },
  "zh-CN": {
    "Your saved key is for a different provider. Paste a key for this one.": "已保存的密钥属于其他提供商。请粘贴此提供商的密钥。",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "已保存的密钥未关联提供商。请重新粘贴密钥以进行测试。",
  },
  "zh-TW": {
    "Your saved key is for a different provider. Paste a key for this one.": "已儲存的金鑰屬於其他供應商。請貼上此供應商的金鑰。",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "已儲存的金鑰未關聯供應商。請重新貼上金鑰以進行測試。",
  },
  "pt-BR": {
    "Your saved key is for a different provider. Paste a key for this one.": "Sua chave salva é de outro provedor. Cole uma chave para este.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Sua chave salva não tem um provedor salvo. Cole a chave novamente para testá-la.",
  },
  ru: {
    "Your saved key is for a different provider. Paste a key for this one.": "Сохранённый ключ относится к другому провайдеру. Вставьте ключ для этого.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Для сохранённого ключа не сохранён провайдер. Вставьте ключ снова, чтобы проверить его.",
  },
  fa: {
    "Your saved key is for a different provider. Paste a key for this one.": "کلید ذخیره‌شده شما برای ارائه‌دهنده دیگری است. کلیدی برای این ارائه‌دهنده جای‌گذاری کنید.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "برای کلید ذخیره‌شده شما ارائه‌دهنده‌ای ذخیره نشده است. برای آزمایش، کلید را دوباره جای‌گذاری کنید.",
  },
  ar: {
    "Your saved key is for a different provider. Paste a key for this one.": "مفتاحك المحفوظ يخص مزوّدًا آخر. الصق مفتاحًا لهذا المزوّد.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "لا يوجد مزوّد محفوظ مع مفتاحك المحفوظ. الصق المفتاح مرة أخرى لاختباره.",
  },
  ja: {
    "Your saved key is for a different provider. Paste a key for this one.": "保存されているキーは別のプロバイダー用です。このプロバイダーのキーを貼り付けてください。",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "保存されているキーにはプロバイダーが保存されていません。テストするにはキーをもう一度貼り付けてください。",
  },
  ko: {
    "Your saved key is for a different provider. Paste a key for this one.": "저장된 키는 다른 공급자용입니다. 이 공급자의 키를 붙여넣으세요.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "저장된 키에 공급자가 저장되어 있지 않습니다. 테스트하려면 키를 다시 붙여넣으세요.",
  },
  pl: {
    "Your saved key is for a different provider. Paste a key for this one.": "Zapisany klucz należy do innego dostawcy. Wklej klucz dla tego dostawcy.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Zapisany klucz nie ma zapisanego dostawcy. Wklej klucz ponownie, aby go przetestować.",
  },
  hu: {
    "Your saved key is for a different provider. Paste a key for this one.": "A mentett kulcs egy másik szolgáltatóhoz tartozik. Illesszen be egy kulcsot ehhez.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "A mentett kulcshoz nincs szolgáltató mentve. A teszteléshez illessze be újra a kulcsot.",
  },
  fr: {
    "Your saved key is for a different provider. Paste a key for this one.": "Votre clé enregistrée est celle d'un autre fournisseur. Collez une clé pour celui-ci.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Aucun fournisseur n'est enregistré avec votre clé. Collez à nouveau la clé pour la tester.",
  },
  uk: {
    "Your saved key is for a different provider. Paste a key for this one.": "Збережений ключ належить іншому постачальнику. Вставте ключ для цього.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Для збереженого ключа не збережено постачальника. Вставте ключ ще раз, щоб перевірити його.",
  },
  tr: {
    "Your saved key is for a different provider. Paste a key for this one.": "Kayıtlı anahtarınız başka bir sağlayıcıya ait. Bu sağlayıcı için bir anahtar yapıştırın.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Kayıtlı anahtarınızla birlikte kaydedilmiş bir sağlayıcı yok. Test etmek için anahtarı yeniden yapıştırın.",
  },
  th: {
    "Your saved key is for a different provider. Paste a key for this one.": "คีย์ที่บันทึกไว้เป็นของผู้ให้บริการรายอื่น วางคีย์สำหรับผู้ให้บริการนี้",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "คีย์ที่บันทึกไว้ไม่มีผู้ให้บริการที่บันทึกไว้ วางคีย์อีกครั้งเพื่อทดสอบ",
  },
  it: {
    "Your saved key is for a different provider. Paste a key for this one.": "La chiave salvata è di un altro provider. Incolla una chiave per questo.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Alla chiave salvata non è associato alcun provider. Incolla di nuovo la chiave per testarla.",
  },
  hi: {
    "Your saved key is for a different provider. Paste a key for this one.": "आपकी सहेजी गई कुंजी किसी दूसरे प्रदाता की है। इस प्रदाता के लिए कुंजी पेस्ट करें।",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "आपकी सहेजी गई कुंजी के साथ कोई प्रदाता सहेजा नहीं गया है। जाँचने के लिए कुंजी फिर से पेस्ट करें।",
  },
  ur: {
    "Your saved key is for a different provider. Paste a key for this one.": "آپ کی محفوظ کلید کسی دوسرے فراہم کنندہ کی ہے۔ اس فراہم کنندہ کے لیے کلید پیسٹ کریں۔",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "آپ کی محفوظ کلید کے ساتھ کوئی فراہم کنندہ محفوظ نہیں ہے۔ جانچنے کے لیے کلید دوبارہ پیسٹ کریں۔",
  },
  bn: {
    "Your saved key is for a different provider. Paste a key for this one.": "আপনার সংরক্ষিত কী অন্য একটি প্রদানকারীর। এই প্রদানকারীর জন্য একটি কী পেস্ট করুন।",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "আপনার সংরক্ষিত কী-এর সঙ্গে কোনো প্রদানকারী সংরক্ষিত নেই। পরীক্ষা করতে কী আবার পেস্ট করুন।",
  },
};

export const t = createDictionaryTranslator(SETTINGS_EXECUTION_DICT);
