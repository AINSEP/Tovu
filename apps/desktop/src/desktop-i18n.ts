/** Copy for this desktop feature, in every locale supported by Tovu's admin. */
export interface DesktopCopy {
  settings: string;
  automaticUpdates: string;
  saveUpdateError: string;
  restart: string;
  restarting: string;
}
const COPY: Record<string, readonly [string, string, string, string, string]> = {
  en: ['Settings', 'Automatically update Tovu', 'Could not save update preference', 'Restart', 'Restarting…'],
  es: ['Ajustes', 'Actualizar Tovu automáticamente', 'No se pudo guardar la preferencia de actualización', 'Reiniciar', 'Reiniciando…'],
  de: ['Einstellungen', 'Tovu automatisch aktualisieren', 'Update-Einstellung konnte nicht gespeichert werden', 'Neu starten', 'Neustart…'],
  it: ['Impostazioni', 'Aggiorna Tovu automaticamente', 'Impossibile salvare la preferenza di aggiornamento', 'Riavvia', 'Riavvio…'],
  'zh-CN': ['设置', '自动更新 Tovu', '无法保存更新偏好', '重启', '正在重启…'],
  'zh-TW': ['設定', '自動更新 Tovu', '無法儲存更新偏好', '重新啟動', '正在重新啟動…'],
  ar: ['الإعدادات', 'تحديث Tovu تلقائيًا', 'تعذر حفظ تفضيل التحديث', 'إعادة التشغيل', 'جارٍ إعادة التشغيل…'],
  fa: ['تنظیمات', 'به‌روزرسانی خودکار Tovu', 'ذخیرهٔ تنظیم به‌روزرسانی ممکن نشد', 'راه‌اندازی مجدد', 'در حال راه‌اندازی مجدد…'],
  ru: ['Настройки', 'Автоматически обновлять Tovu', 'Не удалось сохранить настройку обновления', 'Перезапустить', 'Перезапуск…'],
  ja: ['設定', 'Tovu を自動更新', '更新設定を保存できませんでした', '再起動', '再起動中…'],
  id: ['Pengaturan', 'Perbarui Tovu secara otomatis', 'Tidak dapat menyimpan preferensi pembaruan', 'Mulai ulang', 'Memulai ulang…'],
  'pt-BR': ['Configurações', 'Atualizar Tovu automaticamente', 'Não foi possível salvar a preferência de atualização', 'Reiniciar', 'Reiniciando…'],
  ko: ['설정', 'Tovu 자동 업데이트', '업데이트 설정을 저장할 수 없습니다', '다시 시작', '다시 시작하는 중…'],
  pl: ['Ustawienia', 'Automatycznie aktualizuj Tovu', 'Nie udało się zapisać ustawienia aktualizacji', 'Uruchom ponownie', 'Ponowne uruchamianie…'],
  hu: ['Beállítások', 'A Tovu automatikus frissítése', 'Nem sikerült menteni a frissítési beállítást', 'Újraindítás', 'Újraindítás…'],
  fr: ['Paramètres', 'Mettre à jour Tovu automatiquement', 'Impossible d’enregistrer la préférence de mise à jour', 'Redémarrer', 'Redémarrage…'],
  uk: ['Налаштування', 'Автоматично оновлювати Tovu', 'Не вдалося зберегти налаштування оновлення', 'Перезапустити', 'Перезапуск…'],
  tr: ['Ayarlar', 'Tovu’yu otomatik güncelle', 'Güncelleme tercihi kaydedilemedi', 'Yeniden başlat', 'Yeniden başlatılıyor…'],
  th: ['การตั้งค่า', 'อัปเดต Tovu โดยอัตโนมัติ', 'ไม่สามารถบันทึกการตั้งค่าการอัปเดตได้', 'เริ่มใหม่', 'กำลังเริ่มใหม่…'],
  hi: ['सेटिंग', 'Tovu को अपने आप अपडेट करें', 'अपडेट की प्राथमिकता सहेजी नहीं जा सकी', 'फिर से शुरू करें', 'फिर से शुरू हो रहा है…'],
  ur: ['ترتیبات', 'Tovu کو خودکار طور پر اپ ڈیٹ کریں', 'اپ ڈیٹ کی ترجیح محفوظ نہیں ہو سکی', 'دوبارہ شروع کریں', 'دوبارہ شروع ہو رہا ہے…'],
  bn: ['সেটিংস', 'Tovu স্বয়ংক্রিয়ভাবে আপডেট করুন', 'আপডেটের পছন্দ সংরক্ষণ করা যায়নি', 'পুনরায় চালু করুন', 'পুনরায় চালু হচ্ছে…'],
};

export function desktopCopy({ locale }: { locale: string }, _optionalArgs = {}): DesktopCopy {
  const normalized = locale.replace(/_/g, '-');
  const key = Object.keys(COPY).find(key => key.toLowerCase() === normalized.toLowerCase())
    ?? (normalized.toLowerCase().startsWith('zh') ? (/tw|hk|hant/i.test(normalized) ? 'zh-TW' : 'zh-CN') : normalized.split('-')[0] ?? 'en');
  const row = COPY[key] ?? COPY.en!;
  const [settings, automaticUpdates, saveUpdateError, restart, restarting] = row;
  return { settings, automaticUpdates, saveUpdateError, restart, restarting };
}
