/**
 * @file The Settings screen's own copy for its Execution mode tab: what the admin's stored BYOK key
 * cannot do at the form's endpoint, plus the rest of the tab's own copy — `AdminByokKeyFooter`'s
 * "Saved to the server…" / "Stored on the server…" status lines, `AdminByokSettingsFooter`'s
 * "Settings saved." confirmation, and the Local CLI scope label.
 *
 * Not in `SettingsUi.tsx`'s `t`: that one reads `@jini-ai/ui`'s and `@jini-ai/cms`'s settings-dialog
 * dictionaries, which are other packages' copy. Not in `settings-capabilities-i18n.ts` either: that file is
 * the "no backend yet" notes.
 *
 * All six keys also live in `features/ai-assistant/ai-assistant-i18n.ts` for AI Assistant's mount of
 * the same form. Every value here is copied from there verbatim, so the two screens word the ask
 * alike; `__tests__/settings-execution-i18n.unit.test.ts` fails if either copy changes alone for the
 * two stored-key asks. No `en` block: English is this dict's own key text, so
 * `createDictionaryTranslator`'s `?? key` fallback already renders it for that locale — a literal
 * `en` entry mapping each key to itself would be dead weight.
 */

import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const SETTINGS_EXECUTION_DICT: Record<string, Record<string, string>> = {
  es: {
    "No API key — model discovery needs the key from this browser.":
      "Sin clave de API: la detección de modelos necesita la clave desde este navegador.",
    "Your saved key is for a different provider. Paste a key for this one.": "Tu clave guardada es de otro proveedor. Pega una clave para este.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Tu clave guardada no tiene un proveedor guardado. Pega la clave de nuevo para probarla.",
    "Saved to the server, encrypted.": "Guardada en el servidor, cifrada.",
    "Settings saved.": "Configuración guardada.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Almacenada en el servidor, cifrada. Pega una clave nueva para reemplazarla.",
    "Detected on the Tovu server, not on your own computer.": "Detectado en el servidor de Tovu, no en tu propio equipo.",
  },
  id: {
    "No API key — model discovery needs the key from this browser.":
      "Tidak ada kunci API — penemuan model memerlukan kunci dari browser ini.",
    "Your saved key is for a different provider. Paste a key for this one.": "Kunci tersimpan Anda untuk penyedia lain. Tempel kunci untuk penyedia ini.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Kunci tersimpan Anda tidak memiliki penyedia yang tersimpan. Tempel kunci lagi untuk mengujinya.",
    "Saved to the server, encrypted.": "Disimpan ke server, terenkripsi.",
    "Settings saved.": "Pengaturan disimpan.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Disimpan di server, terenkripsi. Tempel kunci baru untuk menggantinya.",
    "Detected on the Tovu server, not on your own computer.": "Terdeteksi di server Tovu, bukan di komputer Anda sendiri.",
  },
  de: {
    "No API key — model discovery needs the key from this browser.":
      "Kein API-Schlüssel — die Modellerkennung benötigt den Schlüssel aus diesem Browser.",
    "Your saved key is for a different provider. Paste a key for this one.": "Ihr gespeicherter Schlüssel gehört zu einem anderen Anbieter. Fügen Sie einen Schlüssel für diesen ein.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Für Ihren gespeicherten Schlüssel ist kein Anbieter gespeichert. Fügen Sie den Schlüssel erneut ein, um ihn zu testen.",
    "Saved to the server, encrypted.": "Verschlüsselt auf dem Server gespeichert.",
    "Settings saved.": "Einstellungen gespeichert.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Verschlüsselt auf dem Server gespeichert. Fügen Sie einen neuen Schlüssel ein, um ihn zu ersetzen.",
    "Detected on the Tovu server, not on your own computer.": "Auf dem Tovu-Server erkannt, nicht auf Ihrem eigenen Computer.",
  },
  "zh-CN": {
    "No API key — model discovery needs the key from this browser.":
      "没有 API 密钥——模型发现需要来自此浏览器的密钥。",
    "Your saved key is for a different provider. Paste a key for this one.": "已保存的密钥属于其他提供商。请粘贴此提供商的密钥。",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "已保存的密钥未关联提供商。请重新粘贴密钥以进行测试。",
    "Saved to the server, encrypted.": "已加密保存到服务器。",
    "Settings saved.": "设置已保存。",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "已加密存储在服务器上。粘贴新密钥即可替换。",
    "Detected on the Tovu server, not on your own computer.": "在 Tovu 服务器上检测到，而非您自己的计算机。",
  },
  "zh-TW": {
    "No API key — model discovery needs the key from this browser.":
      "沒有 API 金鑰——模型探索需要來自此瀏覽器的金鑰。",
    "Your saved key is for a different provider. Paste a key for this one.": "已儲存的金鑰屬於其他供應商。請貼上此供應商的金鑰。",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "已儲存的金鑰未關聯供應商。請重新貼上金鑰以進行測試。",
    "Saved to the server, encrypted.": "已加密儲存至伺服器。",
    "Settings saved.": "設定已儲存。",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "已加密儲存在伺服器上。貼上新金鑰即可取代。",
    "Detected on the Tovu server, not on your own computer.": "在 Tovu 伺服器上偵測到，而非您自己的電腦。",
  },
  "pt-BR": {
    "No API key — model discovery needs the key from this browser.":
      "Sem chave de API — a descoberta de modelos precisa da chave deste navegador.",
    "Your saved key is for a different provider. Paste a key for this one.": "Sua chave salva é de outro provedor. Cole uma chave para este.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Sua chave salva não tem um provedor salvo. Cole a chave novamente para testá-la.",
    "Saved to the server, encrypted.": "Salva no servidor, criptografada.",
    "Settings saved.": "Configurações salvas.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Armazenada no servidor, criptografada. Cole uma nova chave para substituí-la.",
    "Detected on the Tovu server, not on your own computer.": "Detectado no servidor da Tovu, não no seu próprio computador.",
  },
  ru: {
    "No API key — model discovery needs the key from this browser.":
      "Нет API-ключа — для поиска моделей нужен ключ из этого браузера.",
    "Your saved key is for a different provider. Paste a key for this one.": "Сохранённый ключ относится к другому провайдеру. Вставьте ключ для этого.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Для сохранённого ключа не сохранён провайдер. Вставьте ключ снова, чтобы проверить его.",
    "Saved to the server, encrypted.": "Сохранено на сервере в зашифрованном виде.",
    "Settings saved.": "Настройки сохранены.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Хранится на сервере в зашифрованном виде. Вставьте новый ключ, чтобы заменить его.",
    "Detected on the Tovu server, not on your own computer.": "Обнаружено на сервере Tovu, а не на вашем компьютере.",
  },
  fa: {
    "No API key — model discovery needs the key from this browser.":
      "کلید API وجود ندارد — کشف مدل‌ها به کلید از همین مرورگر نیاز دارد.",
    "Your saved key is for a different provider. Paste a key for this one.": "کلید ذخیره‌شده شما برای ارائه‌دهنده دیگری است. کلیدی برای این ارائه‌دهنده جای‌گذاری کنید.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "برای کلید ذخیره‌شده شما ارائه‌دهنده‌ای ذخیره نشده است. برای آزمایش، کلید را دوباره جای‌گذاری کنید.",
    "Saved to the server, encrypted.": "به‌صورت رمزنگاری‌شده روی سرور ذخیره شد.",
    "Settings saved.": "تنظیمات ذخیره شد.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "به‌صورت رمزنگاری‌شده روی سرور ذخیره شده است. برای جایگزینی، کلید جدید را جای‌گذاری کنید.",
    "Detected on the Tovu server, not on your own computer.": "روی سرور Tovu شناسایی شد، نه روی رایانه‌ی خودتان.",
  },
  ar: {
    "No API key — model discovery needs the key from this browser.":
      "لا يوجد مفتاح API — يحتاج اكتشاف النماذج إلى المفتاح من هذا المتصفح.",
    "Your saved key is for a different provider. Paste a key for this one.": "مفتاحك المحفوظ يخص مزوّدًا آخر. الصق مفتاحًا لهذا المزوّد.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "لا يوجد مزوّد محفوظ مع مفتاحك المحفوظ. الصق المفتاح مرة أخرى لاختباره.",
    "Saved to the server, encrypted.": "حُفظ على الخادم، مشفَّرًا.",
    "Settings saved.": "حُفظت الإعدادات.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "مخزَّن على الخادم، مشفَّرًا. الصق مفتاحًا جديدًا لاستبداله.",
    "Detected on the Tovu server, not on your own computer.": "اكتُشف على خادم Tovu، وليس على جهاز الكمبيوتر الخاص بك.",
  },
  ja: {
    "No API key — model discovery needs the key from this browser.":
      "API キーがありません — モデルの検出には、このブラウザーからのキーが必要です。",
    "Your saved key is for a different provider. Paste a key for this one.": "保存されているキーは別のプロバイダー用です。このプロバイダーのキーを貼り付けてください。",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "保存されているキーにはプロバイダーが保存されていません。テストするにはキーをもう一度貼り付けてください。",
    "Saved to the server, encrypted.": "暗号化されてサーバーに保存済みです。",
    "Settings saved.": "設定を保存しました。",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "暗号化されてサーバーに保存されています。置き換えるには新しいキーを貼り付けてください。",
    "Detected on the Tovu server, not on your own computer.": "自分のコンピューターではなく、Tovuサーバー上で検出されました。",
  },
  ko: {
    "No API key — model discovery needs the key from this browser.":
      "API 키가 없습니다 — 모델 검색에는 이 브라우저의 키가 필요합니다.",
    "Your saved key is for a different provider. Paste a key for this one.": "저장된 키는 다른 공급자용입니다. 이 공급자의 키를 붙여넣으세요.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "저장된 키에 공급자가 저장되어 있지 않습니다. 테스트하려면 키를 다시 붙여넣으세요.",
    "Saved to the server, encrypted.": "암호화되어 서버에 저장되었습니다.",
    "Settings saved.": "설정이 저장되었습니다.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "암호화되어 서버에 저장되어 있습니다. 교체하려면 새 키를 붙여넣으세요.",
    "Detected on the Tovu server, not on your own computer.": "사용자님의 컴퓨터가 아니라 Tovu 서버에서 감지되었습니다.",
  },
  pl: {
    "No API key — model discovery needs the key from this browser.":
      "Brak klucza API — wykrywanie modeli wymaga klucza z tej przeglądarki.",
    "Your saved key is for a different provider. Paste a key for this one.": "Zapisany klucz należy do innego dostawcy. Wklej klucz dla tego dostawcy.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Zapisany klucz nie ma zapisanego dostawcy. Wklej klucz ponownie, aby go przetestować.",
    "Saved to the server, encrypted.": "Zapisano na serwerze, zaszyfrowany.",
    "Settings saved.": "Ustawienia zapisane.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Przechowywany na serwerze, zaszyfrowany. Wklej nowy klucz, aby go zastąpić.",
    "Detected on the Tovu server, not on your own computer.": "Wykryto na serwerze Tovu, a nie na Twoim komputerze.",
  },
  hu: {
    "No API key — model discovery needs the key from this browser.":
      "Nincs API-kulcs — a modellek felderítéséhez a kulcs szükséges ebből a böngészőből.",
    "Your saved key is for a different provider. Paste a key for this one.": "A mentett kulcs egy másik szolgáltatóhoz tartozik. Illesszen be egy kulcsot ehhez.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "A mentett kulcshoz nincs szolgáltató mentve. A teszteléshez illessze be újra a kulcsot.",
    "Saved to the server, encrypted.": "Titkosítva mentve a szerverre.",
    "Settings saved.": "Beállítások mentve.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Titkosítva tárolva a szerveren. A cseréhez illesszen be egy új kulcsot.",
    "Detected on the Tovu server, not on your own computer.": "A Tovu szerveren észlelve, nem a saját számítógépén.",
  },
  fr: {
    "No API key — model discovery needs the key from this browser.":
      "Aucune clé API — la découverte des modèles nécessite la clé depuis ce navigateur.",
    "Your saved key is for a different provider. Paste a key for this one.": "Votre clé enregistrée est celle d'un autre fournisseur. Collez une clé pour celui-ci.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Aucun fournisseur n'est enregistré avec votre clé. Collez à nouveau la clé pour la tester.",
    "Saved to the server, encrypted.": "Enregistrée sur le serveur, chiffrée.",
    "Settings saved.": "Paramètres enregistrés.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Stockée sur le serveur, chiffrée. Collez une nouvelle clé pour la remplacer.",
    "Detected on the Tovu server, not on your own computer.": "Détecté sur le serveur Tovu, pas sur votre propre ordinateur.",
  },
  uk: {
    "No API key — model discovery needs the key from this browser.":
      "Немає API-ключа — для пошуку моделей потрібен ключ із цього браузера.",
    "Your saved key is for a different provider. Paste a key for this one.": "Збережений ключ належить іншому постачальнику. Вставте ключ для цього.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Для збереженого ключа не збережено постачальника. Вставте ключ ще раз, щоб перевірити його.",
    "Saved to the server, encrypted.": "Збережено на сервері в зашифрованому вигляді.",
    "Settings saved.": "Налаштування збережено.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Зберігається на сервері в зашифрованому вигляді. Вставте новий ключ, щоб замінити його.",
    "Detected on the Tovu server, not on your own computer.": "Виявлено на сервері Tovu, а не на вашому комп'ютері.",
  },
  tr: {
    "No API key — model discovery needs the key from this browser.":
      "API anahtarı yok — model keşfi için bu tarayıcıdan anahtar gerekiyor.",
    "Your saved key is for a different provider. Paste a key for this one.": "Kayıtlı anahtarınız başka bir sağlayıcıya ait. Bu sağlayıcı için bir anahtar yapıştırın.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Kayıtlı anahtarınızla birlikte kaydedilmiş bir sağlayıcı yok. Test etmek için anahtarı yeniden yapıştırın.",
    "Saved to the server, encrypted.": "Sunucuya şifrelenerek kaydedildi.",
    "Settings saved.": "Ayarlar kaydedildi.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Sunucuda şifrelenerek saklanıyor. Değiştirmek için yeni bir anahtar yapıştırın.",
    "Detected on the Tovu server, not on your own computer.": "Kendi bilgisayarınızda değil, Tovu sunucusunda algılandı.",
  },
  th: {
    "No API key — model discovery needs the key from this browser.":
      "ไม่มีคีย์ API — การค้นหาโมเดลต้องใช้คีย์จากเบราว์เซอร์นี้",
    "Your saved key is for a different provider. Paste a key for this one.": "คีย์ที่บันทึกไว้เป็นของผู้ให้บริการรายอื่น วางคีย์สำหรับผู้ให้บริการนี้",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "คีย์ที่บันทึกไว้ไม่มีผู้ให้บริการที่บันทึกไว้ วางคีย์อีกครั้งเพื่อทดสอบ",
    "Saved to the server, encrypted.": "บันทึกลงเซิร์ฟเวอร์แบบเข้ารหัสแล้ว",
    "Settings saved.": "บันทึกการตั้งค่าแล้ว",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "จัดเก็บบนเซิร์ฟเวอร์แบบเข้ารหัส วางคีย์ใหม่เพื่อแทนที่",
    "Detected on the Tovu server, not on your own computer.": "ตรวจพบบนเซิร์ฟเวอร์ Tovu ไม่ใช่บนคอมพิวเตอร์ของคุณเอง",
  },
  it: {
    "No API key — model discovery needs the key from this browser.":
      "Nessuna chiave API — il rilevamento dei modelli richiede la chiave da questo browser.",
    "Your saved key is for a different provider. Paste a key for this one.": "La chiave salvata è di un altro provider. Incolla una chiave per questo.",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "Alla chiave salvata non è associato alcun provider. Incolla di nuovo la chiave per testarla.",
    "Saved to the server, encrypted.": "Salvata sul server, crittografata.",
    "Settings saved.": "Impostazioni salvate.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Archiviata sul server, crittografata. Incolla una nuova chiave per sostituirla.",
    "Detected on the Tovu server, not on your own computer.": "Rilevato sul server Tovu, non sul tuo computer.",
  },
  hi: {
    "No API key — model discovery needs the key from this browser.":
      "कोई API कुंजी नहीं — मॉडल खोजने के लिए इस ब्राउज़र से कुंजी चाहिए।",
    "Your saved key is for a different provider. Paste a key for this one.": "आपकी सहेजी गई कुंजी किसी दूसरे प्रदाता की है। इस प्रदाता के लिए कुंजी पेस्ट करें।",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "आपकी सहेजी गई कुंजी के साथ कोई प्रदाता सहेजा नहीं गया है। जाँचने के लिए कुंजी फिर से पेस्ट करें।",
    "Saved to the server, encrypted.": "सर्वर पर एन्क्रिप्टेड रूप से सहेजा गया।",
    "Settings saved.": "सेटिंग्स सहेजी गईं।",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "सर्वर पर एन्क्रिप्टेड रूप से संग्रहीत। इसे बदलने के लिए एक नई कुंजी पेस्ट करें।",
    "Detected on the Tovu server, not on your own computer.": "Tovu सर्वर पर पहचाना गया, आपके अपने कंप्यूटर पर नहीं।",
  },
  ur: {
    "No API key — model discovery needs the key from this browser.":
      "کوئی API کلید نہیں — ماڈلز کی دریافت کے لیے اسی براؤزر سے کلید درکار ہے۔",
    "Your saved key is for a different provider. Paste a key for this one.": "آپ کی محفوظ کلید کسی دوسرے فراہم کنندہ کی ہے۔ اس فراہم کنندہ کے لیے کلید پیسٹ کریں۔",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "آپ کی محفوظ کلید کے ساتھ کوئی فراہم کنندہ محفوظ نہیں ہے۔ جانچنے کے لیے کلید دوبارہ پیسٹ کریں۔",
    "Saved to the server, encrypted.": "سرور پر خفیہ کاری کے ساتھ محفوظ ہو گئی۔",
    "Settings saved.": "ترتیبات محفوظ ہو گئیں۔",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "سرور پر خفیہ کاری کے ساتھ محفوظ ہے۔ اسے بدلنے کے لیے نئی کلید پیسٹ کریں۔",
    "Detected on the Tovu server, not on your own computer.": "Tovu سرور پر شناخت ہوئی، آپ کے اپنے کمپیوٹر پر نہیں۔",
  },
  bn: {
    "No API key — model discovery needs the key from this browser.":
      "কোনো API কী নেই — মডেল খুঁজে পেতে এই ব্রাউজার থেকে কী প্রয়োজন।",
    "Your saved key is for a different provider. Paste a key for this one.": "আপনার সংরক্ষিত কী অন্য একটি প্রদানকারীর। এই প্রদানকারীর জন্য একটি কী পেস্ট করুন।",
    "Your saved key has no provider saved with it. Paste the key again to test it.": "আপনার সংরক্ষিত কী-এর সঙ্গে কোনো প্রদানকারী সংরক্ষিত নেই। পরীক্ষা করতে কী আবার পেস্ট করুন।",
    "Saved to the server, encrypted.": "এনক্রিপ্ট করে সার্ভারে সংরক্ষিত হয়েছে।",
    "Settings saved.": "সেটিংস সংরক্ষিত হয়েছে।",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "এনক্রিপ্ট করে সার্ভারে সংরক্ষিত আছে। প্রতিস্থাপন করতে নতুন কী পেস্ট করুন।",
    "Detected on the Tovu server, not on your own computer.": "Tovu সার্ভারে শনাক্ত হয়েছে, আপনার নিজের কম্পিউটারে নয়।",
  },
};

export const t = createDictionaryTranslator(SETTINGS_EXECUTION_DICT);
