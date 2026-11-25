/**
 * @file STAYS-HOST: host binding of the Jini Media dictionary (`@jini-ai/admin/screens/media/media-i18n/create-media-dictionary`)
 * plus product copy. The neutral dictionary data and its factory live in Jini; this file only binds
 * Tovu's own `COMMON_I18N` as the shared-words fallback and re-exports the host-facing names the
 * feature's importers already use. No entry of this dictionary names the product today — one that
 * does (K3) goes in `productEntries` below, never into the Jini package.
 */
import { COMMON_I18N } from "../../lib/i18n-common";
import { createMediaDictionary } from "@jini-ai/admin/screens/media/media-i18n/create-media-dictionary";

/** `MEDIA_DICT[locale]?.[key] ?? COMMON_I18N[locale]?.[key] ?? key` via `createDictionaryTranslator`
 *  (same fallback `trash-i18n.ts` uses) — a shared word this dict doesn't carry for a locale still
 *  renders translated instead of falling straight to English. Exported so the feature's
 *  `.hooks.ts`/`rules.ts` files (which have no JSX and build their own `t` closure the way
 *  `Media.tsx` does) can call it directly instead of duplicating the lookup. */
/** English key (and fallback) of the status `Media` shows when the server answered an upload with the
 *  fixed `conversionNotice: "web-copy-unavailable"` code. Host copy for a host outcome, so it is bound
 *  here as `productEntries` rather than added to the neutral Jini dictionary. */
export const VIDEO_CONVERSION_NOTICE_KEY = "The video was saved as uploaded. A web-playable copy could not be made.";

const VIDEO_CONVERSION_NOTICE_I18N = {
  es: { [VIDEO_CONVERSION_NOTICE_KEY]: "El video se guardó tal como se subió. No se pudo crear una copia reproducible en la web." },
  id: { [VIDEO_CONVERSION_NOTICE_KEY]: "Video disimpan seperti saat diunggah. Salinan yang dapat diputar di web tidak dapat dibuat." },
  de: { [VIDEO_CONVERSION_NOTICE_KEY]: "Das Video wurde wie hochgeladen gespeichert. Eine im Web abspielbare Kopie konnte nicht erstellt werden." },
  "zh-CN": { [VIDEO_CONVERSION_NOTICE_KEY]: "视频已按上传时的原样保存。无法生成可在网页播放的副本。" },
  "zh-TW": { [VIDEO_CONVERSION_NOTICE_KEY]: "影片已按上傳時的原樣儲存。無法產生可在網頁播放的副本。" },
  "pt-BR": { [VIDEO_CONVERSION_NOTICE_KEY]: "O vídeo foi salvo como enviado. Não foi possível criar uma cópia reproduzível na web." },
  ru: { [VIDEO_CONVERSION_NOTICE_KEY]: "Видео сохранено в исходном виде. Не удалось создать копию для воспроизведения в браузере." },
  fa: { [VIDEO_CONVERSION_NOTICE_KEY]: "ویدیو همان‌طور که بارگذاری شد ذخیره شد. ساخت نسخه‌ای قابل پخش در وب ممکن نشد." },
  ar: { [VIDEO_CONVERSION_NOTICE_KEY]: "تم حفظ الفيديو كما رُفع. تعذّر إنشاء نسخة قابلة للتشغيل على الويب." },
  ja: { [VIDEO_CONVERSION_NOTICE_KEY]: "動画はアップロードされたまま保存されました。Web で再生できるコピーは作成できませんでした。" },
  ko: { [VIDEO_CONVERSION_NOTICE_KEY]: "동영상이 업로드한 그대로 저장되었습니다. 웹에서 재생 가능한 사본을 만들 수 없었습니다." },
  pl: { [VIDEO_CONVERSION_NOTICE_KEY]: "Film zapisano w przesłanej postaci. Nie udało się utworzyć kopii odtwarzalnej w przeglądarce." },
  hu: { [VIDEO_CONVERSION_NOTICE_KEY]: "A videó a feltöltött formában mentve. Webes lejátszásra alkalmas másolat nem készülhetett." },
  fr: { [VIDEO_CONVERSION_NOTICE_KEY]: "La vidéo a été enregistrée telle quelle. Une copie lisible sur le web n’a pas pu être créée." },
  uk: { [VIDEO_CONVERSION_NOTICE_KEY]: "Відео збережено у вихідному вигляді. Не вдалося створити копію для відтворення в браузері." },
  tr: { [VIDEO_CONVERSION_NOTICE_KEY]: "Video yüklendiği gibi kaydedildi. Web’de oynatılabilir bir kopya oluşturulamadı." },
  th: { [VIDEO_CONVERSION_NOTICE_KEY]: "บันทึกวิดีโอตามที่อัปโหลดแล้ว ไม่สามารถสร้างสำเนาที่เล่นบนเว็บได้" },
  it: { [VIDEO_CONVERSION_NOTICE_KEY]: "Il video è stato salvato così come caricato. Non è stato possibile creare una copia riproducibile sul web." },
  hi: { [VIDEO_CONVERSION_NOTICE_KEY]: "वीडियो अपलोड किए गए रूप में सहेजा गया। वेब पर चलने योग्य कॉपी नहीं बनाई जा सकी।" },
  ur: { [VIDEO_CONVERSION_NOTICE_KEY]: "ویڈیو اپ لوڈ کی گئی حالت میں محفوظ کر لی گئی۔ ویب پر چلنے کے قابل کاپی نہیں بن سکی۔" },
  bn: { [VIDEO_CONVERSION_NOTICE_KEY]: "ভিডিওটি আপলোড করা অবস্থায় সংরক্ষিত হয়েছে। ওয়েবে চালানোর উপযোগী কপি তৈরি করা যায়নি।" },
};

export const { dictionary: MEDIA_DICT, t } = createMediaDictionary({ commonDictionary: COMMON_I18N, productEntries: VIDEO_CONVERSION_NOTICE_I18N });
