import { COMMON_I18N } from "./i18n-common";
import { createDictionaryTranslator } from "@jini-ai/core/text";

/**
 * @file Translations of the admin's one upload-limit refusal (`upload-limit.ts`). Keyed by the
 * English sentence, like every admin dictionary. Feature dictionaries whose own `t` renders the
 * refusal (Media, Library) spread {@link UPLOAD_LIMIT_STRINGS} into their tables, so the sentence is
 * translated once here. `lib/__tests__/untranslated-copy.unit.test.ts` checks every locale.
 */
export const UPLOAD_LIMIT_STRINGS: Record<string, Record<string, string>> = {
  es: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Este archivo supera los 50 MB. Elige un archivo más pequeño o pide al asistente que lo convierta." },
  id: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "File ini lebih dari 50 MB. Pilih file yang lebih kecil atau minta asisten untuk mengonversinya." },
  de: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Diese Datei ist größer als 50 MB. Wähle eine kleinere Datei oder bitte den Assistenten, sie umzuwandeln." },
  "zh-CN": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "此文件超过 50 MB。请选择较小的文件，或让助手进行转换。" },
  "zh-TW": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "此檔案超過 50 MB。請選擇較小的檔案，或請助理進行轉換。" },
  "pt-BR": { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Este arquivo tem mais de 50 MB. Escolha um arquivo menor ou peça ao assistente para convertê-lo." },
  ru: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Файл больше 50 МБ. Выберите файл поменьше или попросите ассистента его конвертировать." },
  fa: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "این فایل بزرگ‌تر از ۵۰ مگابایت است. فایل کوچک‌تری انتخاب کنید یا از دستیار بخواهید آن را تبدیل کند." },
  ar: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "هذا الملف أكبر من 50 ميغابايت. اختر ملفًا أصغر أو اطلب من المساعد تحويله." },
  ja: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "このファイルは 50 MB を超えています。小さいファイルを選ぶか、アシスタントに変換を依頼してください。" },
  ko: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "이 파일은 50MB를 초과합니다. 더 작은 파일을 선택하거나 어시스턴트에게 변환을 요청하세요." },
  pl: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Ten plik jest większy niż 50 MB. Wybierz mniejszy plik lub poproś asystenta o konwersję." },
  hu: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Ez a fájl nagyobb, mint 50 MB. Válassz kisebb fájlt, vagy kérd meg az asszisztenst, hogy alakítsa át." },
  fr: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Ce fichier dépasse 50 Mo. Choisissez un fichier plus petit ou demandez à l’assistant de le convertir." },
  uk: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Файл більший за 50 МБ. Виберіть менший файл або попросіть асистента його конвертувати." },
  tr: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Bu dosya 50 MB'tan büyük. Daha küçük bir dosya seçin veya asistandan dönüştürmesini isteyin." },
  th: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "ไฟล์นี้ใหญ่กว่า 50 MB เลือกไฟล์ที่เล็กกว่า หรือขอให้ผู้ช่วยแปลงไฟล์" },
  it: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "Questo file supera i 50 MB. Scegli un file più piccolo o chiedi all’assistente di convertirlo." },
  hi: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "यह फ़ाइल 50 MB से बड़ी है। छोटी फ़ाइल चुनें या सहायक से इसे बदलने के लिए कहें।" },
  ur: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "یہ فائل 50 MB سے بڑی ہے۔ چھوٹی فائل منتخب کریں یا اسسٹنٹ سے اسے تبدیل کرنے کو کہیں۔" },
  bn: { "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.": "এই ফাইলটি 50 MB-এর চেয়ে বড়। ছোট একটি ফাইল বেছে নিন বা সহকারীকে এটি রূপান্তর করতে বলুন।" },
};

/** `UPLOAD_LIMIT_STRINGS[locale]?.[key] ?? COMMON_I18N[locale]?.[key] ?? key`. */
export const t = createDictionaryTranslator({ featureDictionary: UPLOAD_LIMIT_STRINGS }, { commonDictionary: COMMON_I18N });
