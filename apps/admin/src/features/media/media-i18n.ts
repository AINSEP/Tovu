/**
 * @file STAYS-HOST: host binding of the Jini Media dictionary (`@jini-ai/admin/screens/media/media-i18n/create-media-dictionary`)
 * plus product copy. The neutral dictionary data and its factory live in Jini; this file only binds
 * Tovu's own `COMMON_I18N` as the shared-words fallback and re-exports the host-facing names the
 * feature's importers already use. No entry of this dictionary names the product today — one that
 * does (K3) goes in `productEntries` below, never into the Jini package.
 */
import { COMMON_I18N } from "../../lib/i18n-common";
import { FILE_TOO_LARGE_COPY } from "./upload-size-copy";
import { createMediaDictionary } from "@jini-ai/admin/screens/media/media-i18n/create-media-dictionary";

/** `MEDIA_DICT[locale]?.[key] ?? COMMON_I18N[locale]?.[key] ?? key` via `createDictionaryTranslator`
 *  (same fallback `trash-i18n.ts` uses) — a shared word this dict doesn't carry for a locale still
 *  renders translated instead of falling straight to English. Exported so the feature's
 *  `.hooks.ts`/`rules.ts` files (which have no JSX and build their own `t` closure the way
 *  `Media.tsx` does) can call it directly instead of duplicating the lookup. */
/** Product copy for the size refusal (`upload-size-copy.ts`) and the HEVC card note (`Media.tsx`), per `COMMON_I18N` locale. */
const MEDIA_PRODUCT_ENTRIES: Record<string, Record<string, string>> = {
  "es": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Este archivo supera los 50 MB. Elige un archivo más pequeño o pide al asistente que lo convierta.", "This video may not play in Chrome.": "Es posible que este video no se reproduzca en Chrome." },
  "de": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Diese Datei ist größer als 50 MB. Wähle eine kleinere Datei oder bitte den Assistenten, sie umzuwandeln.", "This video may not play in Chrome.": "Dieses Video wird in Chrome möglicherweise nicht abgespielt." },
  "it": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Questo file supera i 50 MB. Scegli un file più piccolo o chiedi all'assistente di convertirlo.", "This video may not play in Chrome.": "Questo video potrebbe non essere riprodotto in Chrome." },
  "zh-CN": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "此文件大于 50 MB。请选择更小的文件，或让助手转换它。", "This video may not play in Chrome.": "此视频可能无法在 Chrome 中播放。" },
  "zh-TW": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "此檔案大於 50 MB。請選擇較小的檔案，或請助理轉換它。", "This video may not play in Chrome.": "此影片可能無法在 Chrome 中播放。" },
  "ar": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "هذا الملف أكبر من 50 ميغابايت. اختر ملفًا أصغر أو اطلب من المساعد تحويله.", "This video may not play in Chrome.": "قد لا يعمل هذا الفيديو في Chrome." },
  "fa": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "این فایل بزرگ‌تر از ۵۰ مگابایت است. فایل کوچک‌تری انتخاب کنید یا از دستیار بخواهید آن را تبدیل کند.", "This video may not play in Chrome.": "ممکن است این ویدیو در Chrome پخش نشود." },
  "ru": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Этот файл больше 50 МБ. Выберите файл поменьше или попросите ассистента его преобразовать.", "This video may not play in Chrome.": "Это видео может не воспроизводиться в Chrome." },
  "ja": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "このファイルは 50 MB を超えています。小さいファイルを選ぶか、アシスタントに変換を依頼してください。", "This video may not play in Chrome.": "この動画は Chrome で再生できない場合があります。" },
  "id": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "File ini lebih besar dari 50 MB. Pilih file yang lebih kecil atau minta asisten untuk mengonversinya.", "This video may not play in Chrome.": "Video ini mungkin tidak dapat diputar di Chrome." },
  "pt-BR": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Este arquivo tem mais de 50 MB. Escolha um arquivo menor ou peça ao assistente para convertê-lo.", "This video may not play in Chrome.": "Este vídeo pode não ser reproduzido no Chrome." },
  "ko": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "이 파일은 50MB보다 큽니다. 더 작은 파일을 선택하거나 어시스턴트에게 변환을 요청하세요.", "This video may not play in Chrome.": "이 동영상은 Chrome에서 재생되지 않을 수 있습니다." },
  "pl": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Ten plik jest większy niż 50 MB. Wybierz mniejszy plik lub poproś asystenta o jego konwersję.", "This video may not play in Chrome.": "Ten film może nie odtwarzać się w Chrome." },
  "hu": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Ez a fájl nagyobb 50 MB-nál. Válassz kisebb fájlt, vagy kérd meg az asszisztenst, hogy alakítsa át.", "This video may not play in Chrome.": "Előfordulhat, hogy ez a videó nem játszható le a Chrome-ban." },
  "fr": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Ce fichier dépasse 50 Mo. Choisissez un fichier plus petit ou demandez à l'assistant de le convertir.", "This video may not play in Chrome.": "Cette vidéo risque de ne pas être lue dans Chrome." },
  "uk": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Цей файл більший за 50 МБ. Виберіть менший файл або попросіть асистента його перетворити.", "This video may not play in Chrome.": "Це відео може не відтворюватися в Chrome." },
  "tr": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Bu dosya 50 MB'tan büyük. Daha küçük bir dosya seçin veya asistandan dönüştürmesini isteyin.", "This video may not play in Chrome.": "Bu video Chrome'da oynatılmayabilir." },
  "th": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "ไฟล์นี้มีขนาดใหญ่กว่า 50 MB เลือกไฟล์ที่เล็กกว่า หรือขอให้ผู้ช่วยแปลงไฟล์", "This video may not play in Chrome.": "วิดีโอนี้อาจเล่นใน Chrome ไม่ได้" },
  "hi": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "यह फ़ाइल 50 MB से बड़ी है। छोटी फ़ाइल चुनें या सहायक से इसे बदलने के लिए कहें।", "This video may not play in Chrome.": "यह वीडियो Chrome में शायद न चले।" },
  "ur": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "یہ فائل 50 MB سے بڑی ہے۔ چھوٹی فائل منتخب کریں یا اسسٹنٹ سے اسے تبدیل کرنے کو کہیں۔", "This video may not play in Chrome.": "ہو سکتا ہے یہ ویڈیو Chrome میں نہ چلے۔" },
  "bn": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "এই ফাইলটি 50 MB-এর চেয়ে বড়। ছোট ফাইল বেছে নিন অথবা সহকারীকে এটি রূপান্তর করতে বলুন।", "This video may not play in Chrome.": "এই ভিডিওটি Chrome-এ নাও চলতে পারে।" },
};

/** Only the size-refusal sentence, per locale: Library binds it too, so one translation serves every upload surface. */
export const UPLOAD_SIZE_PRODUCT_ENTRIES: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(MEDIA_PRODUCT_ENTRIES).flatMap(([locale, entries]) => {
    const copy = entries[FILE_TOO_LARGE_COPY];
    return copy === undefined ? [] : [[locale, { [FILE_TOO_LARGE_COPY]: copy }]];
  }),
);

export const { dictionary: MEDIA_DICT, t } = createMediaDictionary({ commonDictionary: COMMON_I18N, productEntries: MEDIA_PRODUCT_ENTRIES });
