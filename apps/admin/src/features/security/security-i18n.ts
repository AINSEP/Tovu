import { interpolate } from "../../lib/template-i18n";
import { createDictionaryTranslator } from "../../lib/dictionary-translator";
import type { OtherCredentialStoreInfo } from "./rules";

/**
 * @file Translations for the Security page (`/admin/access-tokens`). Same shape as
 * `deployment/deployment-i18n.tsx`/`source-control/source-control-i18n.ts`: a flat
 * `DICT[locale][englishKey] = translation` map, `t = createDictionaryTranslator(DICT)`.
 *
 * KNOWN GAP, disclosed rather than silent: this dictionary is English-only for v1 — every OTHER
 * feature dictionary in this app carries the full ~20-locale set `SOURCE_CONTROL_DICT` shows, and
 * this page should eventually match that. `createDictionaryTranslator`'s own fallback chain
 * (`featureDict[locale]?.[key] ?? COMMON_I18N[locale]?.[key] ?? key`) is what makes this a legible
 * degrade rather than a broken one — a non-English reader sees this page's own copy in English
 * inside an otherwise-translated admin, the same "partial-coverage precedent" this file's sibling
 * dictionaries already document for their own newest strings, just applied to the whole page rather
 * than one or two edge-case templates. Follow-up: translate `SECURITY_DICT` into the same locale set
 * `SOURCE_CONTROL_DICT` carries.
 */

const SECURITY_DICT: Record<string, Record<string, string>> = {};

export const t = createDictionaryTranslator(SECURITY_DICT);

/** Load error banner — same `{error}`-interpolated template shape
 *  `publishCredentialsLoadErrorMessage`/`sourceControlCredentialsLoadErrorMessage` use. */
const ACCESS_TOKENS_LOAD_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't load saved access tokens: {error}",
};
export function accessTokensLoadErrorMessage(locale: string, error: string): string {
  return interpolate(ACCESS_TOKENS_LOAD_ERROR_TEMPLATE[locale] ?? ACCESS_TOKENS_LOAD_ERROR_TEMPLATE.en!, { error });
}

/** One row's save-error banner — mirrors `publishCredentialSaveErrorMessage`'s exact shape. */
const ACCESS_TOKEN_SAVE_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't save this token: {error}",
};
export function accessTokenSaveErrorMessage(locale: string, error: string): string {
  return interpolate(ACCESS_TOKEN_SAVE_ERROR_TEMPLATE[locale] ?? ACCESS_TOKEN_SAVE_ERROR_TEMPLATE.en!, { error });
}

/** A failed Remove — its own action-specific wording, distinct from
 *  {@link accessTokenSaveErrorMessage}'s "save" copy, so a failed removal never reads as a failed
 *  save (Terra audit MEDIUM finding, 2026-08-19: `removeToken` used to await its API call with no
 *  error handling at all, so a rejected call produced no visible change). */
const ACCESS_TOKEN_REMOVE_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't remove this token: {error}",
};
export function accessTokenRemoveErrorMessage(locale: string, error: string): string {
  return interpolate(ACCESS_TOKEN_REMOVE_ERROR_TEMPLATE[locale] ?? ACCESS_TOKEN_REMOVE_ERROR_TEMPLATE.en!, { error });
}

/** A failed "Make default" — same action-specific reasoning as {@link accessTokenRemoveErrorMessage}. */
const ACCESS_TOKEN_MAKE_DEFAULT_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't make this token the default: {error}",
};
export function accessTokenMakeDefaultErrorMessage(locale: string, error: string): string {
  return interpolate(ACCESS_TOKEN_MAKE_DEFAULT_ERROR_TEMPLATE[locale] ?? ACCESS_TOKEN_MAKE_DEFAULT_ERROR_TEMPLATE.en!, { error });
}

/** A duplicate-name rejection — this page's own case, since neither origin store's dictionary has a
 *  template naming a PROVIDER + a NAME the way this page's uniqueness check does (`rules.ts`'s
 *  `accessTokenNameTaken`). */
const ACCESS_TOKEN_DUPLICATE_NAME_TEMPLATE: Record<string, string> = {
  en: 'A token named "{name}" already exists for {provider}.',
};
export function accessTokenDuplicateNameMessage(locale: string, name: string, provider: string): string {
  return interpolate(ACCESS_TOKEN_DUPLICATE_NAME_TEMPLATE[locale] ?? ACCESS_TOKEN_DUPLICATE_NAME_TEMPLATE.en!, { name, provider });
}

/** The Remove confirm dialog's three pieces of copy (`rules.ts`'s own "Remove from Tovu, never
 *  Revoke" load-bearing constraint — `development/todos.md:1208`) — kept as templates rather than
 *  built from `t()` fragments plus raw JSX spans, since the load-bearing FACT here (removing here
 *  does not revoke there) is exactly the kind of sentence that must not fragment across a
 *  flat-dictionary boundary and risk a future translator reordering it into something that drops or
 *  inverts the claim. */
const REMOVE_DIALOG_TITLE_TEMPLATE: Record<string, string> = { en: 'Remove "{name}" from Tovu?' };
export function removeDialogTitle(locale: string, name: string): string {
  return interpolate(REMOVE_DIALOG_TITLE_TEMPLATE[locale] ?? REMOVE_DIALOG_TITLE_TEMPLATE.en!, { name });
}

/** Two placeholders, not one: `{credentialLabel}` (what the saved row is FOR — `AccessTokenProviderInfo.label`,
 *  e.g. "GitHub Pages") and `{vendor}` (who actually issues/revokes it — `AccessTokenProviderInfo.vendorLabel`,
 *  e.g. "GitHub"). Collapsing both into one `{provider}` placeholder was the owner-reported bug: this
 *  sentence told an operator to revoke "on GitHub Pages", which has no revoke console of its own. See
 *  `rules.ts`'s `AccessTokenProviderInfo.vendorLabel` doc for the full reasoning. */
const REMOVE_DIALOG_BODY_TEMPLATE: Record<string, string> = {
  en: "This deletes Tovu's saved copy of this {credentialLabel} token. It does NOT revoke the token on {vendor} — it stays valid there until you revoke it yourself.",
};
export function removeDialogBody(locale: string, credentialLabel: string, vendor: string): string {
  return interpolate(REMOVE_DIALOG_BODY_TEMPLATE[locale] ?? REMOVE_DIALOG_BODY_TEMPLATE.en!, { credentialLabel, vendor });
}

/** `external-mcp`'s Remove body — the shared {@link removeDialogBody} does not fit: there is no
 *  vendor console to revoke on, and what is lost (a sealed OAuth secret the read API never returns)
 *  cannot be restored. Fully translated, unlike this file's other templates (see its header's KNOWN
 *  GAP): this sentence guards an unrecoverable delete, so it must not degrade to English. */
const REMOVE_DIALOG_EXTERNAL_MCP_BODY: Record<string, string> = {
  en: "This deletes the server and its saved credentials. It can't be undone — you'd have to set it up again, and sign in again if it uses OAuth.",
  es: "Esto elimina el servidor y sus credenciales guardadas. No se puede deshacer: tendrías que configurarlo de nuevo y volver a iniciar sesión si usa OAuth.",
  id: "Ini menghapus server dan kredensial tersimpannya. Tindakan ini tidak dapat dibatalkan — Anda harus menyiapkannya lagi, dan masuk lagi jika menggunakan OAuth.",
  de: "Dadurch werden der Server und seine gespeicherten Zugangsdaten gelöscht. Das lässt sich nicht rückgängig machen – Sie müssten ihn neu einrichten und sich erneut anmelden, falls er OAuth verwendet.",
  "zh-CN": "这会删除该服务器及其已保存的凭据。此操作无法撤销——你需要重新设置它；如果它使用 OAuth，还需要重新登录。",
  "zh-TW": "這會刪除該伺服器及其已儲存的憑證。此操作無法復原——你需要重新設定它；如果它使用 OAuth，還需要重新登入。",
  "pt-BR": "Isso exclui o servidor e as credenciais salvas dele. Não é possível desfazer — você teria que configurá-lo de novo e entrar novamente se ele usar OAuth.",
  ru: "Это удалит сервер и его сохранённые учётные данные. Отменить это нельзя — придётся настроить его заново и снова войти, если он использует OAuth.",
  fa: "این کار سرور و اطلاعات ورود ذخیره‌شده‌اش را حذف می‌کند. قابل بازگشت نیست — باید دوباره آن را راه‌اندازی کنید و اگر از OAuth استفاده می‌کند، دوباره وارد شوید.",
  ar: "سيؤدي هذا إلى حذف الخادم وبيانات الاعتماد المحفوظة الخاصة به. لا يمكن التراجع عن ذلك — سيتعين عليك إعداده من جديد، وتسجيل الدخول مرة أخرى إذا كان يستخدم OAuth.",
  ja: "サーバーと保存済みの認証情報を削除します。元に戻せません。再度使うにはセットアップし直す必要があり、OAuth を使う場合はもう一度サインインが必要です。",
  ko: "서버와 저장된 자격 증명이 삭제됩니다. 되돌릴 수 없습니다. 다시 사용하려면 새로 설정해야 하며, OAuth를 사용하는 경우 다시 로그인해야 합니다.",
  pl: "Spowoduje to usunięcie serwera i jego zapisanych danych uwierzytelniających. Tej operacji nie można cofnąć — trzeba będzie skonfigurować go od nowa i zalogować się ponownie, jeśli używa OAuth.",
  hu: "Ez törli a szervert és a mentett hitelesítő adatait. Nem vonható vissza — újra be kellene állítani, és ha OAuth-ot használ, újra be kellene jelentkezni.",
  fr: "Cela supprime le serveur et ses identifiants enregistrés. Cette action est irréversible : vous devriez le reconfigurer, et vous reconnecter s'il utilise OAuth.",
  uk: "Це видалить сервер і його збережені облікові дані. Скасувати це неможливо — доведеться налаштувати його заново й знову увійти, якщо він використовує OAuth.",
  tr: "Bu işlem sunucuyu ve kayıtlı kimlik bilgilerini siler. Geri alınamaz — yeniden kurmanız ve OAuth kullanıyorsa yeniden oturum açmanız gerekir.",
  th: "การดำเนินการนี้จะลบเซิร์ฟเวอร์และข้อมูลรับรองที่บันทึกไว้ ไม่สามารถเลิกทำได้ — คุณจะต้องตั้งค่าใหม่ และลงชื่อเข้าใช้อีกครั้งหากใช้ OAuth",
  it: "Questa operazione elimina il server e le relative credenziali salvate. Non è reversibile: dovresti configurarlo di nuovo e accedere di nuovo se usa OAuth.",
  hi: "इससे सर्वर और उसके सहेजे गए क्रेडेंशियल हट जाएंगे। इसे पूर्ववत नहीं किया जा सकता — आपको इसे फिर से सेट अप करना होगा, और यदि यह OAuth का उपयोग करता है तो फिर से साइन इन करना होगा।",
  ur: "اس سے سرور اور اس کی محفوظ کردہ اسناد حذف ہو جائیں گی۔ اسے واپس نہیں لیا جا سکتا — آپ کو اسے دوبارہ سیٹ اپ کرنا ہوگا، اور اگر یہ OAuth استعمال کرتا ہے تو دوبارہ سائن ان کرنا ہوگا۔",
  bn: "এটি সার্ভার এবং এর সংরক্ষিত ক্রেডেনশিয়াল মুছে ফেলবে। এটি পূর্বাবস্থায় ফেরানো যাবে না — আপনাকে এটি আবার সেট আপ করতে হবে, এবং OAuth ব্যবহার করলে আবার সাইন ইন করতে হবে।",
};

/** `composio-connector`'s Remove body — here the shared {@link removeDialogBody} would be FALSE:
 *  `POST …/connectors/:id/disconnect` revokes the account at Composio (that route's own header),
 *  so "It does NOT revoke the token" must never be said about this store. Fully translated for the
 *  same reason as {@link REMOVE_DIALOG_EXTERNAL_MCP_BODY}. */
const REMOVE_DIALOG_COMPOSIO_CONNECTOR_BODY: Record<string, string> = {
  en: "This disconnects the account and revokes its access at Composio. To use it again, you'd have to connect it and sign in again.",
  es: "Esto desconecta la cuenta y revoca su acceso en Composio. Para volver a usarla, tendrías que conectarla e iniciar sesión de nuevo.",
  id: "Ini memutus akun dan mencabut aksesnya di Composio. Untuk menggunakannya lagi, Anda harus menghubungkannya dan masuk lagi.",
  de: "Dadurch wird das Konto getrennt und sein Zugriff bei Composio widerrufen. Um es wieder zu nutzen, müssten Sie es erneut verbinden und sich neu anmelden.",
  "zh-CN": "这会断开该账户，并在 Composio 撤销其访问权限。要再次使用，你需要重新连接并重新登录。",
  "zh-TW": "這會中斷該帳戶的連線，並在 Composio 撤銷其存取權限。要再次使用，你需要重新連線並重新登入。",
  "pt-BR": "Isso desconecta a conta e revoga o acesso dela no Composio. Para usá-la de novo, você teria que conectá-la e entrar novamente.",
  ru: "Это отключит аккаунт и отзовёт его доступ в Composio. Чтобы снова им пользоваться, придётся подключить его и войти заново.",
  fa: "این کار حساب را قطع می‌کند و دسترسی آن را در Composio لغو می‌کند. برای استفادهٔ دوباره، باید دوباره آن را متصل کنید و وارد شوید.",
  ar: "سيؤدي هذا إلى فصل الحساب وإلغاء وصوله في Composio. لاستخدامه مجددًا، سيتعين عليك ربطه وتسجيل الدخول مرة أخرى.",
  ja: "アカウントの接続を解除し、Composio でのアクセス権を取り消します。再度使うには、もう一度接続してサインインする必要があります。",
  ko: "계정 연결이 해제되고 Composio에서 액세스 권한이 취소됩니다. 다시 사용하려면 다시 연결하고 로그인해야 합니다.",
  pl: "Spowoduje to odłączenie konta i cofnięcie jego dostępu w Composio. Aby znów z niego korzystać, trzeba będzie połączyć je ponownie i się zalogować.",
  hu: "Ez leválasztja a fiókot, és visszavonja a hozzáférését a Composióban. Az újbóli használathoz újra össze kellene kapcsolni és be kellene jelentkezni.",
  fr: "Cela déconnecte le compte et révoque son accès sur Composio. Pour l'utiliser à nouveau, vous devriez le reconnecter et vous connecter de nouveau.",
  uk: "Це від'єднає обліковий запис і відкличе його доступ у Composio. Щоб знову ним користуватися, доведеться під'єднати його й увійти заново.",
  tr: "Bu işlem hesabın bağlantısını keser ve Composio'daki erişimini iptal eder. Yeniden kullanmak için tekrar bağlamanız ve oturum açmanız gerekir.",
  th: "การดำเนินการนี้จะยกเลิกการเชื่อมต่อบัญชีและเพิกถอนสิทธิ์การเข้าถึงใน Composio หากต้องการใช้อีกครั้ง คุณจะต้องเชื่อมต่อและลงชื่อเข้าใช้ใหม่",
  it: "Questa operazione scollega l'account e ne revoca l'accesso su Composio. Per usarlo di nuovo, dovresti ricollegarlo e accedere di nuovo.",
  hi: "इससे खाता डिस्कनेक्ट हो जाएगा और Composio पर उसकी पहुँच रद्द हो जाएगी। इसे फिर से उपयोग करने के लिए आपको इसे दोबारा कनेक्ट करना और साइन इन करना होगा।",
  ur: "اس سے اکاؤنٹ منقطع ہو جائے گا اور Composio پر اس کی رسائی منسوخ ہو جائے گی۔ اسے دوبارہ استعمال کرنے کے لیے آپ کو اسے پھر سے منسلک کر کے سائن ان کرنا ہوگا۔",
  bn: "এটি অ্যাকাউন্টটি সংযোগ বিচ্ছিন্ন করবে এবং Composio-তে এর অ্যাক্সেস প্রত্যাহার করবে। আবার ব্যবহার করতে, আপনাকে এটি আবার সংযুক্ত করে সাইন ইন করতে হবে।",
};

/** The Tier-2 Remove dialog's body, per store — the two non-replaceable stores get their own
 *  wording (above), the other four keep {@link removeDialogBody} with `purposeLabel` for both
 *  placeholders, exactly as before (Tier 2 has no vendor/destination split — its deep links go to
 *  Tovu's own screens). @complexity O(1). */
export function otherCredentialRemoveDialogBody(locale: string, store: Pick<OtherCredentialStoreInfo, "id" | "purposeLabel">): string {
  if (store.id === "external-mcp") return REMOVE_DIALOG_EXTERNAL_MCP_BODY[locale] ?? REMOVE_DIALOG_EXTERNAL_MCP_BODY.en!;
  if (store.id === "composio-connector") return REMOVE_DIALOG_COMPOSIO_CONNECTOR_BODY[locale] ?? REMOVE_DIALOG_COMPOSIO_CONNECTOR_BODY.en!;
  return removeDialogBody(locale, store.purposeLabel, store.purposeLabel);
}

const REMOVE_DIALOG_LAST_ROW_TEMPLATE: Record<string, string> = {
  en: "This is the only saved {provider} token — after removing it, nothing here will be marked as connected.",
};
export function removeDialogLastRowNote(locale: string, provider: string): string {
  return interpolate(REMOVE_DIALOG_LAST_ROW_TEMPLATE[locale] ?? REMOVE_DIALOG_LAST_ROW_TEMPLATE.en!, { provider });
}

/** Site Token tab's load-error banner — same `{error}`-interpolated shape as
 *  {@link accessTokensLoadErrorMessage}. */
const SITE_TOKEN_LOAD_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't load the Site Token's status: {error}",
};
export function siteTokenLoadErrorMessage(locale: string, error: string): string {
  return interpolate(SITE_TOKEN_LOAD_ERROR_TEMPLATE[locale] ?? SITE_TOKEN_LOAD_ERROR_TEMPLATE.en!, { error });
}

/** Site Token tab's generic generate-error banner — used when the failure is neither of the two
 *  known markers (`ENV_VAR_ACTIVE`/`ALREADY_EXISTS`, both handled with their own fixed copy in
 *  `SiteTokenTab.tsx` rather than this template, since neither needs an `{error}` slot). */
const SITE_TOKEN_GENERATE_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't generate a key: {error}",
};
export function siteTokenGenerateErrorMessage(locale: string, error: string): string {
  return interpolate(SITE_TOKEN_GENERATE_ERROR_TEMPLATE[locale] ?? SITE_TOKEN_GENERATE_ERROR_TEMPLATE.en!, { error });
}

/** Site Token tab's reveal-error banner — same `{error}`-interpolated shape. Unlike generate,
 *  reveal has no known-marker cases to special-case (a reveal either works or fails outright), so
 *  this is the only error template that call site needs. */
const SITE_TOKEN_REVEAL_ERROR_TEMPLATE: Record<string, string> = {
  en: "Couldn't reveal the Site Token: {error}",
};
export function siteTokenRevealErrorMessage(locale: string, error: string): string {
  return interpolate(SITE_TOKEN_REVEAL_ERROR_TEMPLATE[locale] ?? SITE_TOKEN_REVEAL_ERROR_TEMPLATE.en!, { error });
}
