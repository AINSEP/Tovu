/**
 * @file Spanish dictionary for `use-page-editor.hooks.ts`'s own notice/error strings
 * (`setMessage`/`setError` fallbacks) — NOT `PageEditor.tsx`'s JSX markup, which `pages-i18n.ts`'s
 * own header notes was deliberately left out of scope by the earlier `.tsx`-only translation pass.
 * This file exists because that scope boundary was JSX vs. hooks, not "this feature's editor is
 * untranslated" — the hook's hardcoded English strings still surface directly in the UI (the same
 * gap `comments-i18n.ts` closes for `use-comment-queue.hooks.ts`/`use-comment-settings.hooks.ts`).
 * Same two-step fallback every other `t()` in this app uses: translated value, else the English
 * source string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

export const PAGE_EDITOR_DICT: Record<string, Record<string, string>> = {
  es: {
    "could not re-read the current version — your changes are still here, try again": "no se pudo releer la versión actual: tus cambios siguen aquí, inténtalo de nuevo",
    "failed to load page": "no se pudo cargar la página",
    Saved: "Guardado",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Se guardaron el título, el slug y el estado. El contenido de esta página usa el editor de documentos y aún no se puede editar aquí.",
    "failed to save page": "no se pudo guardar la página",
    "failed to delete page": "no se pudo eliminar la página",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Se guardaron el título, el slug y el estado, pero no el contenido de la página. Tu contenido sigue aquí — pulsa Guardar para reintentarlo.",
  },
  id: {
    "could not re-read the current version — your changes are still here, try again": "tidak dapat membaca ulang versi saat ini — perubahan Anda masih ada di sini, coba lagi",
    "failed to load page": "gagal memuat halaman",
    Saved: "Tersimpan",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Judul, slug, dan status tersimpan. Konten halaman ini menggunakan editor dokumen dan belum bisa diedit di sini.",
    "failed to save page": "gagal menyimpan halaman",
    "failed to delete page": "gagal menghapus halaman",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Judul, slug, dan status tersimpan, tetapi konten halaman tidak. Konten Anda masih ada di sini — tekan Simpan untuk mencoba lagi.",
  },
  de: {
    "could not re-read the current version — your changes are still here, try again": "die aktuelle Version konnte nicht erneut gelesen werden — deine Änderungen sind noch hier, versuche es erneut",
    "failed to load page": "Seite konnte nicht geladen werden",
    Saved: "Gespeichert",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Titel, Slug und Status wurden gespeichert. Der Inhalt dieser Seite verwendet den Dokumenteditor und kann hier noch nicht bearbeitet werden.",
    "failed to save page": "Seite konnte nicht gespeichert werden",
    "failed to delete page": "Seite konnte nicht gelöscht werden",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Titel, Slug und Status wurden gespeichert, der Seiteninhalt jedoch nicht. Dein Inhalt ist noch hier — klicke auf Speichern, um es erneut zu versuchen.",
  },
  "zh-CN": {
    "could not re-read the current version — your changes are still here, try again": "无法重新读取当前版本 — 你的更改仍在这里，请重试",
    "failed to load page": "页面加载失败",
    Saved: "已保存",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "标题、slug 和状态已保存。此页面的内容使用文档编辑器，目前还不能在这里编辑。",
    "failed to save page": "页面保存失败",
    "failed to delete page": "页面删除失败",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "标题、slug 和状态已保存，但页面内容未保存。你的内容仍在这里 — 请按“保存”重试。",
  },
  "zh-TW": {
    "could not re-read the current version — your changes are still here, try again": "無法重新讀取目前版本 — 你的變更仍在這裡，請再試一次",
    "failed to load page": "頁面載入失敗",
    Saved: "已儲存",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "標題、slug 和狀態已儲存。此頁面的內容使用文件編輯器，目前還不能在這裡編輯。",
    "failed to save page": "頁面儲存失敗",
    "failed to delete page": "頁面刪除失敗",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "標題、slug 和狀態已儲存，但頁面內容未儲存。你的內容仍在這裡 — 請按「儲存」重試。",
  },
  "pt-BR": {
    "could not re-read the current version — your changes are still here, try again": "não foi possível reler a versão atual — suas alterações continuam aqui, tente novamente",
    "failed to load page": "falha ao carregar a página",
    Saved: "Salvo",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Título, slug e status foram salvos. O conteúdo desta página usa o editor de documentos e ainda não pode ser editado aqui.",
    "failed to save page": "falha ao salvar a página",
    "failed to delete page": "falha ao excluir a página",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Título, slug e status foram salvos, mas o conteúdo da página não. Seu conteúdo ainda está aqui — pressione Salvar para tentar novamente.",
  },
  ru: {
    "could not re-read the current version — your changes are still here, try again": "не удалось перечитать текущую версию — ваши изменения на месте, попробуйте ещё раз",
    "failed to load page": "не удалось загрузить страницу",
    Saved: "Сохранено",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Заголовок, slug и статус сохранены. Содержимое этой страницы использует редактор документов и пока не может редактироваться здесь.",
    "failed to save page": "не удалось сохранить страницу",
    "failed to delete page": "не удалось удалить страницу",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Заголовок, slug и статус сохранены, но содержимое страницы — нет. Ваш текст всё ещё здесь — нажмите «Сохранить», чтобы повторить попытку.",
  },
  fa: {
    "could not re-read the current version — your changes are still here, try again": "نسخه فعلی دوباره خوانده نشد — تغییرات شما همچنان اینجاست، دوباره تلاش کنید",
    "failed to load page": "بارگذاری صفحه ناموفق بود",
    Saved: "ذخیره شد",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "عنوان، slug و وضعیت ذخیره شدند. محتوای این صفحه از ویرایشگر سند استفاده می‌کند و هنوز نمی‌توان آن را اینجا ویرایش کرد.",
    "failed to save page": "ذخیرهٔ صفحه ناموفق بود",
    "failed to delete page": "حذف صفحه ناموفق بود",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "عنوان، slug و وضعیت ذخیره شدند، اما محتوای صفحه ذخیره نشد. محتوای شما همچنان اینجاست — برای تلاش دوباره روی «ذخیره» بزنید.",
  },
  ar: {
    "could not re-read the current version — your changes are still here, try again": "تعذّرت إعادة قراءة الإصدار الحالي — تغييراتك لا تزال هنا، حاول مرة أخرى",
    "failed to load page": "تعذّر تحميل الصفحة",
    Saved: "تم الحفظ",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "تم حفظ العنوان والمعرف (slug) والحالة. يستخدم محتوى هذه الصفحة محرر المستندات ولا يمكن تحريره هنا بعد.",
    "failed to save page": "تعذّر حفظ الصفحة",
    "failed to delete page": "تعذّر حذف الصفحة",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "تم حفظ العنوان والمعرف (slug) والحالة، لكن لم يتم حفظ محتوى الصفحة. لا يزال المحتوى الخاص بك هنا — اضغط على حفظ لإعادة المحاولة.",
  },
  ja: {
    "could not re-read the current version — your changes are still here, try again": "現在のバージョンを読み直せませんでした — 変更はまだここにあります。もう一度お試しください",
    "failed to load page": "ページを読み込めませんでした",
    Saved: "保存しました",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "タイトル、スラッグ、ステータスを保存しました。このページの内容はドキュメントエディタを使用しており、まだここでは編集できません。",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "タイトル、スラッグ、ステータスは保存されましたが、ページの内容は保存されませんでした。内容はまだここにあります — 「保存」を押してもう一度お試しください。",
    "failed to save page": "ページを保存できませんでした",
    "failed to delete page": "ページを削除できませんでした",
  },
  ko: {
    "could not re-read the current version — your changes are still here, try again": "현재 버전을 다시 읽지 못했습니다 — 변경 사항은 그대로 있습니다. 다시 시도하세요",
    "failed to load page": "페이지를 불러오지 못했습니다",
    Saved: "저장됨",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "제목, 슬러그, 상태가 저장되었습니다. 이 페이지의 내용은 문서 편집기를 사용하며 아직 여기서는 편집할 수 없습니다.",
    "failed to save page": "페이지를 저장하지 못했습니다",
    "failed to delete page": "페이지를 삭제하지 못했습니다",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "제목, 슬러그, 상태는 저장되었지만 페이지 내용은 저장되지 않았습니다. 작성하신 내용은 그대로 남아 있습니다 — 다시 시도하려면 저장을 누르세요.",
  },
  pl: {
    "could not re-read the current version — your changes are still here, try again": "nie udało się ponownie odczytać bieżącej wersji — Twoje zmiany nadal tu są, spróbuj ponownie",
    "failed to load page": "nie udało się wczytać strony",
    Saved: "Zapisano",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Tytuł, slug i status zostały zapisane. Treść tej strony korzysta z edytora dokumentów i nie można jej jeszcze edytować tutaj.",
    "failed to save page": "nie udało się zapisać strony",
    "failed to delete page": "nie udało się usunąć strony",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Tytuł, slug i status zostały zapisane, ale treść strony nie. Twoja treść nadal tu jest — kliknij Zapisz, aby spróbować ponownie.",
  },
  hu: {
    "could not re-read the current version — your changes are still here, try again": "nem sikerült újraolvasni az aktuális verziót — a módosításai továbbra is itt vannak, próbálja újra",
    "failed to load page": "nem sikerült betölteni az oldalt",
    Saved: "Mentve",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "A cím, a slug és az állapot mentve lett. Ennek az oldalnak a tartalma a dokumentumszerkesztőt használja, és itt még nem szerkeszthető.",
    "failed to save page": "nem sikerült menteni az oldalt",
    "failed to delete page": "nem sikerült törölni az oldalt",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "A cím, a slug és az állapot mentve lett, de az oldal tartalma nem. A tartalma továbbra is itt van — az újrapróbálkozáshoz kattintson a Mentésre.",
  },
  fr: {
    "could not re-read the current version — your changes are still here, try again": "impossible de relire la version actuelle — vos modifications sont toujours là, réessayez",
    "failed to load page": "échec du chargement de la page",
    Saved: "Enregistré",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Le titre, le slug et le statut ont été enregistrés. Le contenu de cette page utilise l'éditeur de documents et ne peut pas encore être modifié ici.",
    "failed to save page": "échec de l'enregistrement de la page",
    "failed to delete page": "échec de la suppression de la page",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Le titre, le slug et le statut ont été enregistrés, mais pas le contenu de la page. Votre contenu est toujours là — cliquez sur Enregistrer pour réessayer.",
  },
  uk: {
    "could not re-read the current version — your changes are still here, try again": "не вдалося перечитати поточну версію — ваші зміни на місці, спробуйте ще раз",
    "failed to load page": "не вдалося завантажити сторінку",
    Saved: "Збережено",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Заголовок, slug і статус збережено. Вміст цієї сторінки використовує редактор документів і поки що не може редагуватися тут.",
    "failed to save page": "не вдалося зберегти сторінку",
    "failed to delete page": "не вдалося видалити сторінку",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Заголовок, slug і статус збережено, але вміст сторінки — ні. Ваш вміст досі тут — натисніть «Зберегти», щоб повторити спробу.",
  },
  tr: {
    "could not re-read the current version — your changes are still here, try again": "geçerli sürüm yeniden okunamadı — değişiklikleriniz hâlâ burada, tekrar deneyin",
    "failed to load page": "sayfa yüklenemedi",
    Saved: "Kaydedildi",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Başlık, slug ve durum kaydedildi. Bu sayfanın içeriği belge düzenleyicisini kullanıyor ve henüz burada düzenlenemiyor.",
    "failed to save page": "sayfa kaydedilemedi",
    "failed to delete page": "sayfa silinemedi",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Başlık, slug ve durum kaydedildi, ancak sayfa içeriği kaydedilmedi. İçeriğiniz hâlâ burada — tekrar denemek için Kaydet'e basın.",
  },
  th: {
    "could not re-read the current version — your changes are still here, try again": "ไม่สามารถอ่านเวอร์ชันปัจจุบันซ้ำได้ — การเปลี่ยนแปลงของคุณยังอยู่ ลองอีกครั้ง",
    "failed to load page": "โหลดหน้าไม่สำเร็จ",
    Saved: "บันทึกแล้ว",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "บันทึกชื่อเรื่อง สลัก และสถานะแล้ว เนื้อหาของหน้านี้ใช้ตัวแก้ไขเอกสารและยังไม่สามารถแก้ไขได้ที่นี่",
    "failed to save page": "บันทึกหน้าไม่สำเร็จ",
    "failed to delete page": "ลบหน้าไม่สำเร็จ",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "บันทึกชื่อเรื่อง สลัก และสถานะแล้ว แต่เนื้อหาของหน้ายังไม่ถูกบันทึก เนื้อหาของคุณยังอยู่ที่นี่ — กด บันทึก เพื่อลองอีกครั้ง",
  },
  it: {
    "could not re-read the current version — your changes are still here, try again": "impossibile rileggere la versione corrente: le tue modifiche sono ancora qui, riprova",
    "failed to load page": "impossibile caricare la pagina",
    Saved: "Salvato",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "Titolo, slug e stato sono stati salvati. Il contenuto di questa pagina utilizza l'editor di documenti e non può ancora essere modificato qui.",
    "failed to save page": "impossibile salvare la pagina",
    "failed to delete page": "impossibile eliminare la pagina",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "Titolo, slug e stato sono stati salvati, ma il contenuto della pagina no. Il tuo contenuto è ancora qui — premi Salva per riprovare.",
  },
  hi: {
    "could not re-read the current version — your changes are still here, try again": "मौजूदा संस्करण दोबारा नहीं पढ़ा जा सका — आपके बदलाव यहीं हैं, फिर से कोशिश करें",
    "failed to load page": "पेज लोड नहीं हो सका",
    Saved: "सहेजा गया",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "शीर्षक, स्लग और स्थिति सहेज ली गई। इस पेज की सामग्री दस्तावेज़ संपादक का उपयोग करती है और अभी यहाँ संपादित नहीं की जा सकती।",
    "failed to save page": "पेज सहेजा नहीं जा सका",
    "failed to delete page": "पेज हटाया नहीं जा सका",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "शीर्षक, स्लग और स्थिति सहेज ली गई, लेकिन पेज की सामग्री नहीं सहेजी गई। आपकी सामग्री अभी भी यहीं है — फिर से कोशिश करने के लिए सहेजें दबाएँ।",
  },
  ur: {
    "could not re-read the current version — your changes are still here, try again": "موجودہ ورژن دوبارہ نہیں پڑھا جا سکا — آپ کی تبدیلیاں یہیں موجود ہیں، دوبارہ کوشش کریں",
    "failed to load page": "صفحہ لوڈ نہیں ہو سکا",
    Saved: "محفوظ ہو گیا",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "عنوان، سلگ اور اسٹیٹس محفوظ ہو گئے۔ اس صفحے کا مواد دستاویز ایڈیٹر استعمال کرتا ہے اور ابھی یہاں ترمیم نہیں کی جا سکتی۔",
    "failed to save page": "صفحہ محفوظ نہیں ہو سکا",
    "failed to delete page": "صفحہ حذف نہیں ہو سکا",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "عنوان، سلگ اور اسٹیٹس محفوظ ہو گئے، لیکن صفحے کا مواد محفوظ نہیں ہوا۔ آپ کا مواد اب بھی یہیں موجود ہے — دوبارہ کوشش کرنے کے لیے محفوظ کریں دبائیں۔",
  },
  bn: {
    "could not re-read the current version — your changes are still here, try again": "বর্তমান সংস্করণ আবার পড়া যায়নি — আপনার পরিবর্তনগুলি এখানেই আছে, আবার চেষ্টা করুন",
    "failed to load page": "পেজ লোড করা যায়নি",
    Saved: "সংরক্ষিত হয়েছে",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.": "শিরোনাম, স্লাগ এবং স্ট্যাটাস সংরক্ষিত হয়েছে। এই পেজের বিষয়বস্তু ডকুমেন্ট এডিটর ব্যবহার করে এবং এখনও এখানে সম্পাদনা করা যায় না।",
    "failed to save page": "পেজ সংরক্ষণ করা যায়নি",
    "failed to delete page": "পেজ মুছে ফেলা যায়নি",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.":
      "শিরোনাম, স্লাগ এবং স্ট্যাটাস সংরক্ষিত হয়েছে, কিন্তু পেজের বিষয়বস্তু সংরক্ষিত হয়নি। আপনার বিষয়বস্তু এখনও এখানে আছে — আবার চেষ্টা করতে সংরক্ষণ করুন চাপুন।",
  },
};

export const t = createDictionaryTranslator(PAGE_EDITOR_DICT);
