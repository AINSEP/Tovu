import { createSourceControlTranslator, type SourceControlHostDictionary } from "@jini-ai/admin/source-control/source-control-i18n";

import { COMMON_I18N } from "../../lib/i18n-common";

/**
 * @file This admin's own Source Control strings: the ones that name Tovu. The rest of the page's
 * dictionary (and its `{error}` templates) is `@jini-ai/admin/source-control/source-control-i18n`; this
 * file layers these entries over it per locale and binds the `t` the Source Control screen and hook
 * here use, falling back to this app's `COMMON_I18N` exactly as before the split. Keys are the exact
 * English strings `SourceControl.tsx` looks up.
 */
const SOURCE_CONTROL_HOST_I18N: SourceControlHostDictionary = {
  es: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "Conecta una cuenta para que Tovu pueda leer tus repositorios, y más adelante enviar cambios a ellos. Esto no convierte tu contenido en archivos versionados con git — eso es una función aparte, que aún no está construida.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Se guarda cifrado en el servidor. Una vez guardado, Tovu nunca vuelve a mostrarlo.",
  },
  id: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "Hubungkan akun agar Tovu dapat membaca repositori Anda, dan mendorong perubahan ke sana nanti. Ini tidak mengubah konten Anda menjadi berkas berversi git — itu fitur terpisah, yang belum dibuat.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Disimpan terenkripsi di server. Setelah disimpan, Tovu tidak akan pernah menampilkannya lagi.",
  },
  de: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "Verbinde ein Konto, damit Tovu deine Repositories lesen und später Änderungen dorthin pushen kann. Dadurch werden deine Inhalte nicht in git-versionierte Dateien umgewandelt — das ist eine separate Funktion, die noch nicht gebaut ist.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Wird verschlüsselt auf dem Server gespeichert. Nach dem Speichern zeigt Tovu es nie wieder an.",
  },
  "zh-CN": {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "连接一个账户，让 Tovu 可以读取你的仓库，之后再推送更改。这不会把你的内容变成 git 版本化文件——那是一个单独的功能，尚未构建。",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "以加密方式存储在服务器上。保存后，Tovu 不会再次显示它。",
  },
  "zh-TW": {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "連接一個帳戶，讓 Tovu 可以讀取你的儲存庫，之後再推送變更。這不會把你的內容變成 git 版本化檔案——那是另一項功能，尚未建置。",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "以加密方式儲存於伺服器上。儲存後，Tovu 不會再次顯示它。",
  },
  "pt-BR": {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "Conecte uma conta para que o Tovu possa ler seus repositórios e, mais tarde, enviar alterações a eles. Isso não transforma seu conteúdo em arquivos versionados com git — isso é um recurso separado, ainda não construído.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Armazenado de forma criptografada no servidor. Depois de salvo, o Tovu nunca o exibe novamente.",
  },
  ru: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "Подключите аккаунт, чтобы Tovu мог читать ваши репозитории, а позже отправлять в них изменения. Это не превращает ваш контент в файлы, версионируемые в git — это отдельная функция, которая ещё не реализована.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Хранится в зашифрованном виде на сервере. После сохранения Tovu больше никогда его не показывает.",
  },
  fa: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "یک حساب کاربری متصل کنید تا Tovu بتواند مخازن شما را بخواند و بعداً تغییرات را به آن‌ها push کند. این کار محتوای شما را به فایل‌های نسخه‌بندی‌شده با git تبدیل نمی‌کند — آن یک ویژگی جداگانه است که هنوز ساخته نشده است.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "به‌صورت رمزگذاری‌شده روی سرور ذخیره می‌شود. پس از ذخیره، Tovu دیگر هرگز آن را نمایش نمی‌دهد.",
  },
  ar: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "اربط حسابًا حتى يتمكن Tovu من قراءة مستودعاتك، ودفع التغييرات إليها لاحقًا. هذا لا يحوّل محتواك إلى ملفات مُدارة بالإصدارات عبر git — تلك ميزة منفصلة لم تُبنَ بعد.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "يُخزَّن مشفّرًا على الخادم. بعد الحفظ، لن يعرضه Tovu مرة أخرى أبدًا.",
  },
  ja: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "アカウントを接続すると、Tovu はリポジトリを読み取り、後で変更を push できるようになります。これによってコンテンツが git 管理のファイルになるわけではありません — それは別の、まだ未実装の機能です。",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "サーバー上に暗号化して保存されます。保存後、Tovu が再び表示することはありません。",
  },
  ko: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "계정을 연결하면 Tovu가 저장소를 읽고 나중에 변경 사항을 push할 수 있습니다. 이 기능은 콘텐츠를 git 버전 관리 파일로 바꾸지 않습니다 — 그것은 아직 구축되지 않은 별도의 기능입니다.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "서버에 암호화되어 저장됩니다. 저장 후에는 Tovu가 다시는 표시하지 않습니다.",
  },
  pl: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "Połącz konto, aby Tovu mógł odczytywać Twoje repozytoria, a później wysyłać do nich zmiany. Nie zamienia to Twoich treści w pliki wersjonowane przez git — to osobna funkcja, jeszcze niezbudowana.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Przechowywany zaszyfrowany na serwerze. Po zapisaniu Tovu nigdy więcej go nie wyświetli.",
  },
  hu: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "Kapcsolj össze egy fiókot, hogy a Tovu olvasni tudja a tárolóidat, később pedig változtatásokat küldhessen beléjük. Ez nem alakítja a tartalmadat git által verziózott fájlokká — az egy külön, még meg nem épített funkció.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Titkosítva tárolódik a szerveren. Mentés után a Tovu soha többé nem jeleníti meg.",
  },
  fr: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "Connecte un compte pour que Tovu puisse lire tes dépôts, puis y pousser des modifications plus tard. Cela ne transforme pas ton contenu en fichiers versionnés par git — c'est une fonctionnalité distincte, pas encore construite.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Stocké chiffré sur le serveur. Une fois enregistré, Tovu ne l'affiche plus jamais.",
  },
  uk: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "Підключіть обліковий запис, щоб Tovu міг читати ваші репозиторії, а пізніше надсилати до них зміни. Це не перетворює ваш вміст на файли, версійовані git — це окрема функція, яку ще не реалізовано.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Зберігається в зашифрованому вигляді на сервері. Після збереження Tovu більше ніколи його не показує.",
  },
  tr: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "Tovu'nun depolarınızı okuyabilmesi ve daha sonra değişiklikleri bunlara gönderebilmesi için bir hesap bağlayın. Bu, içeriğinizi git ile sürümlenen dosyalara dönüştürmez — bu, henüz oluşturulmamış ayrı bir özelliktir.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Sunucuda şifrelenerek saklanır. Kaydedildikten sonra Tovu onu bir daha asla göstermez.",
  },
  th: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "เชื่อมต่อบัญชีเพื่อให้ Tovu สามารถอ่านที่เก็บโค้ดของคุณ และ push การเปลี่ยนแปลงไปยังที่เก็บเหล่านั้นได้ในภายหลัง การทำเช่นนี้ไม่ได้เปลี่ยนเนื้อหาของคุณให้เป็นไฟล์ที่ควบคุมเวอร์ชันด้วย git — นั่นเป็นฟีเจอร์แยกต่างหากที่ยังไม่ได้สร้างขึ้น",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "จัดเก็บแบบเข้ารหัสไว้บนเซิร์ฟเวอร์ เมื่อบันทึกแล้ว Tovu จะไม่แสดงอีกเลย",
  },
  it: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "Collega un account per consentire a Tovu di leggere i tuoi repository e, in seguito, inviarvi modifiche. Questo non trasforma i tuoi contenuti in file versionati con git — è una funzionalità separata, non ancora realizzata.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Memorizzato in forma cifrata sul server. Una volta salvato, Tovu non lo mostrerà mai più.",
  },
  hi: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "एक खाता कनेक्ट करें ताकि Tovu आपके रिपॉज़िटरी पढ़ सके, और बाद में उनमें बदलाव push कर सके। इससे आपकी सामग्री git-वर्ज़न वाली फ़ाइलों में नहीं बदलती — वह एक अलग सुविधा है, जो अभी बनाई नहीं गई है।",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "सर्वर पर एन्क्रिप्ट करके संग्रहीत किया जाता है। सहेजे जाने के बाद, Tovu इसे फिर कभी नहीं दिखाता।",
  },
  ur: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "ایک اکاؤنٹ منسلک کریں تاکہ Tovu آپ کے ریپوزٹریز پڑھ سکے، اور بعد میں ان میں تبدیلیاں push کر سکے۔ اس سے آپ کا مواد git-ورژن شدہ فائلوں میں تبدیل نہیں ہوتا — وہ ایک الگ فیچر ہے، جو ابھی تک نہیں بنایا گیا۔",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "سرور پر خفیہ کاری کے ساتھ محفوظ کیا جاتا ہے۔ محفوظ ہونے کے بعد، Tovu اسے دوبارہ کبھی نہیں دکھاتا۔",
  },
  bn: {
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.": "একটি অ্যাকাউন্ট সংযুক্ত করুন যাতে Tovu আপনার রিপোজিটরি পড়তে পারে, এবং পরে সেগুলোতে পরিবর্তন push করতে পারে। এটি আপনার কন্টেন্টকে git-ভার্সনযুক্ত ফাইলে পরিণত করে না — সেটি একটি আলাদা ফিচার, যা এখনও তৈরি হয়নি।",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "সার্ভারে এনক্রিপ্ট করে সংরক্ষণ করা হয়। একবার সংরক্ষণ করার পর, Tovu এটি আর কখনও দেখাবে না।",
  },
};

export const t = createSourceControlTranslator({ hostDictionary: SOURCE_CONTROL_HOST_I18N }, { commonDictionary: COMMON_I18N });
