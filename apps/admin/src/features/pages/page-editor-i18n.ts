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

const PAGE_EDITOR_DICT: Record<string, Record<string, string>> = {
  es: {
    "could not re-read the current version — your changes are still here, try again": "no se pudo releer la versión actual: tus cambios siguen aquí, inténtalo de nuevo",
    "failed to load page": "no se pudo cargar la página",
    Saved: "Guardado",
    "failed to save page": "no se pudo guardar la página",
    "failed to delete page": "no se pudo eliminar la página",
  },
  id: {
    "could not re-read the current version — your changes are still here, try again": "tidak dapat membaca ulang versi saat ini — perubahan Anda masih ada di sini, coba lagi",
    "failed to load page": "gagal memuat halaman",
    Saved: "Tersimpan",
    "failed to save page": "gagal menyimpan halaman",
    "failed to delete page": "gagal menghapus halaman",
  },
  de: {
    "could not re-read the current version — your changes are still here, try again": "die aktuelle Version konnte nicht erneut gelesen werden — deine Änderungen sind noch hier, versuche es erneut",
    "failed to load page": "Seite konnte nicht geladen werden",
    Saved: "Gespeichert",
    "failed to save page": "Seite konnte nicht gespeichert werden",
    "failed to delete page": "Seite konnte nicht gelöscht werden",
  },
  "zh-CN": {
    "could not re-read the current version — your changes are still here, try again": "无法重新读取当前版本 — 你的更改仍在这里，请重试",
    "failed to load page": "页面加载失败",
    Saved: "已保存",
    "failed to save page": "页面保存失败",
    "failed to delete page": "页面删除失败",
  },
  "zh-TW": {
    "could not re-read the current version — your changes are still here, try again": "無法重新讀取目前版本 — 你的變更仍在這裡，請再試一次",
    "failed to load page": "頁面載入失敗",
    Saved: "已儲存",
    "failed to save page": "頁面儲存失敗",
    "failed to delete page": "頁面刪除失敗",
  },
  "pt-BR": {
    "could not re-read the current version — your changes are still here, try again": "não foi possível reler a versão atual — suas alterações continuam aqui, tente novamente",
    "failed to load page": "falha ao carregar a página",
    Saved: "Salvo",
    "failed to save page": "falha ao salvar a página",
    "failed to delete page": "falha ao excluir a página",
  },
  ru: {
    "could not re-read the current version — your changes are still here, try again": "не удалось перечитать текущую версию — ваши изменения на месте, попробуйте ещё раз",
    "failed to load page": "не удалось загрузить страницу",
    Saved: "Сохранено",
    "failed to save page": "не удалось сохранить страницу",
    "failed to delete page": "не удалось удалить страницу",
  },
  fa: {
    "could not re-read the current version — your changes are still here, try again": "نسخه فعلی دوباره خوانده نشد — تغییرات شما همچنان اینجاست، دوباره تلاش کنید",
    "failed to load page": "بارگذاری صفحه ناموفق بود",
    Saved: "ذخیره شد",
    "failed to save page": "ذخیرهٔ صفحه ناموفق بود",
    "failed to delete page": "حذف صفحه ناموفق بود",
  },
  ar: {
    "could not re-read the current version — your changes are still here, try again": "تعذّرت إعادة قراءة الإصدار الحالي — تغييراتك لا تزال هنا، حاول مرة أخرى",
    "failed to load page": "تعذّر تحميل الصفحة",
    Saved: "تم الحفظ",
    "failed to save page": "تعذّر حفظ الصفحة",
    "failed to delete page": "تعذّر حذف الصفحة",
  },
  ja: {
    "could not re-read the current version — your changes are still here, try again": "現在のバージョンを読み直せませんでした — 変更はまだここにあります。もう一度お試しください",
    "failed to load page": "ページを読み込めませんでした",
    Saved: "保存しました",
    "failed to save page": "ページを保存できませんでした",
    "failed to delete page": "ページを削除できませんでした",
  },
  ko: {
    "could not re-read the current version — your changes are still here, try again": "현재 버전을 다시 읽지 못했습니다 — 변경 사항은 그대로 있습니다. 다시 시도하세요",
    "failed to load page": "페이지를 불러오지 못했습니다",
    Saved: "저장됨",
    "failed to save page": "페이지를 저장하지 못했습니다",
    "failed to delete page": "페이지를 삭제하지 못했습니다",
  },
  pl: {
    "could not re-read the current version — your changes are still here, try again": "nie udało się ponownie odczytać bieżącej wersji — Twoje zmiany nadal tu są, spróbuj ponownie",
    "failed to load page": "nie udało się wczytać strony",
    Saved: "Zapisano",
    "failed to save page": "nie udało się zapisać strony",
    "failed to delete page": "nie udało się usunąć strony",
  },
  hu: {
    "could not re-read the current version — your changes are still here, try again": "nem sikerült újraolvasni az aktuális verziót — a módosításai továbbra is itt vannak, próbálja újra",
    "failed to load page": "nem sikerült betölteni az oldalt",
    Saved: "Mentve",
    "failed to save page": "nem sikerült menteni az oldalt",
    "failed to delete page": "nem sikerült törölni az oldalt",
  },
  fr: {
    "could not re-read the current version — your changes are still here, try again": "impossible de relire la version actuelle — vos modifications sont toujours là, réessayez",
    "failed to load page": "échec du chargement de la page",
    Saved: "Enregistré",
    "failed to save page": "échec de l'enregistrement de la page",
    "failed to delete page": "échec de la suppression de la page",
  },
  uk: {
    "could not re-read the current version — your changes are still here, try again": "не вдалося перечитати поточну версію — ваші зміни на місці, спробуйте ще раз",
    "failed to load page": "не вдалося завантажити сторінку",
    Saved: "Збережено",
    "failed to save page": "не вдалося зберегти сторінку",
    "failed to delete page": "не вдалося видалити сторінку",
  },
  tr: {
    "could not re-read the current version — your changes are still here, try again": "geçerli sürüm yeniden okunamadı — değişiklikleriniz hâlâ burada, tekrar deneyin",
    "failed to load page": "sayfa yüklenemedi",
    Saved: "Kaydedildi",
    "failed to save page": "sayfa kaydedilemedi",
    "failed to delete page": "sayfa silinemedi",
  },
  th: {
    "could not re-read the current version — your changes are still here, try again": "ไม่สามารถอ่านเวอร์ชันปัจจุบันซ้ำได้ — การเปลี่ยนแปลงของคุณยังอยู่ ลองอีกครั้ง",
    "failed to load page": "โหลดหน้าไม่สำเร็จ",
    Saved: "บันทึกแล้ว",
    "failed to save page": "บันทึกหน้าไม่สำเร็จ",
    "failed to delete page": "ลบหน้าไม่สำเร็จ",
  },
  it: {
    "could not re-read the current version — your changes are still here, try again": "impossibile rileggere la versione corrente: le tue modifiche sono ancora qui, riprova",
    "failed to load page": "impossibile caricare la pagina",
    Saved: "Salvato",
    "failed to save page": "impossibile salvare la pagina",
    "failed to delete page": "impossibile eliminare la pagina",
  },
  hi: {
    "could not re-read the current version — your changes are still here, try again": "मौजूदा संस्करण दोबारा नहीं पढ़ा जा सका — आपके बदलाव यहीं हैं, फिर से कोशिश करें",
    "failed to load page": "पेज लोड नहीं हो सका",
    Saved: "सहेजा गया",
    "failed to save page": "पेज सहेजा नहीं जा सका",
    "failed to delete page": "पेज हटाया नहीं जा सका",
  },
  ur: {
    "could not re-read the current version — your changes are still here, try again": "موجودہ ورژن دوبارہ نہیں پڑھا جا سکا — آپ کی تبدیلیاں یہیں موجود ہیں، دوبارہ کوشش کریں",
    "failed to load page": "صفحہ لوڈ نہیں ہو سکا",
    Saved: "محفوظ ہو گیا",
    "failed to save page": "صفحہ محفوظ نہیں ہو سکا",
    "failed to delete page": "صفحہ حذف نہیں ہو سکا",
  },
  bn: {
    "could not re-read the current version — your changes are still here, try again": "বর্তমান সংস্করণ আবার পড়া যায়নি — আপনার পরিবর্তনগুলি এখানেই আছে, আবার চেষ্টা করুন",
    "failed to load page": "পেজ লোড করা যায়নি",
    Saved: "সংরক্ষিত হয়েছে",
    "failed to save page": "পেজ সংরক্ষণ করা যায়নি",
    "failed to delete page": "পেজ মুছে ফেলা যায়নি",
  },
};

export const t = createDictionaryTranslator(PAGE_EDITOR_DICT);
