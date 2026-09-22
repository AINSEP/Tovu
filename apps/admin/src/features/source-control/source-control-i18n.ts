import { interpolate } from "../../lib/template-i18n";
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

/**
 * @file Translations for the Source Control page (`/admin/source-control`). Same shape as
 * `deployment/deployment-i18n.tsx`: a flat `DICT[locale][englishKey] = translation` map, `t =
 * createDictionaryTranslator(DICT)`, and two `{error}`-carrying templates handled the same way that
 * file's own `publishCredentialsLoadErrorMessage`/`publishCredentialSaveErrorMessage` are — English
 * only, mirroring that exact same file's own documented "partial-coverage precedent" for its two
 * newest, most-recently-added error templates: an English banner in an otherwise-translated screen
 * degrades legibly (falls back through `createDictionaryTranslator`'s own `?? key` chain), it does
 * not break. The one-off "already saved, reload" duplicate-label string below follows the identical
 * precedent for the identical reason (an edge case, not core page copy).
 *
 * Every OTHER string here — headings, field labels, hints, the three providers' scope-guidance
 * sentences — gets the full locale set this app's nav and every other stable feature dictionary
 * carries, since those are read on every visit, not just an error path.
 */

const SOURCE_CONTROL_TRANSLATIONS: Record<string, Record<string, string>> = {
  es: {
    "Source Control": "Control de código fuente",
    Providers: "Proveedores",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Conecta una cuenta para que Tovu pueda leer tus repositorios, y más adelante enviar cambios a ellos. Esto no convierte tu contenido en archivos versionados con git — eso es una función aparte, que aún no está construida.",
    "Loading connections…": "Cargando conexiones…",
    Connect: "Conectar",
    "Access token": "Token de acceso",
    "Which token do I need?": "¿Qué token necesito?",
    "Leave blank to keep the current token.": "Déjalo en blanco para conservar el token actual.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Se guarda cifrado en el servidor. Una vez guardado, Tovu nunca vuelve a mostrarlo.",
    "Create a token": "Crear un token",
    Username: "Nombre de usuario",
    "The Bitbucket username this API token belongs to.": "El nombre de usuario de Bitbucket al que pertenece este token de API.",
    Save: "Guardar",
    "Saving…": "Guardando…",
    connected: "conectado",
    "token stored, encrypted": "token guardado, cifrado",
    saved: "guardado",
    "Replace token": "Reemplazar token",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'Necesita un token de acceso personal detallado, limitado únicamente a este repositorio, con el permiso Contents en Lectura y escritura. Un token clásico con el alcance "repo" también funciona, pero da acceso a todos los repositorios que esta cuenta pueda alcanzar — usa el token detallado siempre que puedas.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'Necesita un token de acceso de proyecto — limitado únicamente a este proyecto, no a toda tu cuenta — con los alcances "read_repository" y "write_repository". Créalo desde la página Settings → Access tokens del propio proyecto (no existe una única página para toda la cuenta).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'Necesita un token de API de Bitbucket limitado solo al acceso al repositorio (los alcances "read:repository:bitbucket" y "write:repository:bitbucket"), más el nombre de usuario de Bitbucket al que pertenece — Bitbucket autentica el par, no el token por sí solo.',
  },
  id: {
    "Source Control": "Kontrol Kode Sumber",
    Providers: "Penyedia",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Hubungkan akun agar Tovu dapat membaca repositori Anda, dan mendorong perubahan ke sana nanti. Ini tidak mengubah konten Anda menjadi berkas berversi git — itu fitur terpisah, yang belum dibuat.",
    "Loading connections…": "Memuat koneksi…",
    Connect: "Hubungkan",
    "Access token": "Token akses",
    "Which token do I need?": "Token mana yang saya butuhkan?",
    "Leave blank to keep the current token.": "Biarkan kosong untuk mempertahankan token saat ini.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Disimpan terenkripsi di server. Setelah disimpan, Tovu tidak akan pernah menampilkannya lagi.",
    "Create a token": "Buat token",
    Username: "Nama pengguna",
    "The Bitbucket username this API token belongs to.": "Nama pengguna Bitbucket tempat token API ini berasal.",
    Save: "Simpan",
    "Saving…": "Menyimpan…",
    connected: "terhubung",
    "token stored, encrypted": "token tersimpan, terenkripsi",
    saved: "disimpan",
    "Replace token": "Ganti token",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'Memerlukan token akses pribadi terperinci yang dibatasi hanya untuk repositori ini, dengan izin Contents diatur ke Read and write. Token klasik dengan cakupan "repo" juga berfungsi, tetapi menjangkau semua repositori yang dapat diakses akun ini — gunakan token terperinci jika memungkinkan.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'Memerlukan token akses proyek — dibatasi hanya untuk proyek ini, bukan seluruh akun Anda — dengan cakupan "read_repository" dan "write_repository". Buat dari halaman Settings → Access tokens milik proyek itu sendiri (tidak ada satu halaman tunggal untuk seluruh akun).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'Memerlukan token API Bitbucket yang dibatasi hanya untuk akses repositori (cakupan "read:repository:bitbucket" dan "write:repository:bitbucket"), ditambah nama pengguna Bitbucket tempat token ini berasal — Bitbucket mengautentikasi pasangan ini, bukan hanya tokennya.',
  },
  de: {
    "Source Control": "Quellcodeverwaltung",
    Providers: "Anbieter",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Verbinde ein Konto, damit Tovu deine Repositories lesen und später Änderungen dorthin pushen kann. Dadurch werden deine Inhalte nicht in git-versionierte Dateien umgewandelt — das ist eine separate Funktion, die noch nicht gebaut ist.",
    "Loading connections…": "Verbindungen werden geladen…",
    Connect: "Verbinden",
    "Access token": "Zugriffstoken",
    "Which token do I need?": "Welches Token brauche ich?",
    "Leave blank to keep the current token.": "Leer lassen, um das aktuelle Token zu behalten.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Wird verschlüsselt auf dem Server gespeichert. Nach dem Speichern zeigt Tovu es nie wieder an.",
    "Create a token": "Token erstellen",
    Username: "Benutzername",
    "The Bitbucket username this API token belongs to.": "Der Bitbucket-Benutzername, zu dem dieses API-Token gehört.",
    Save: "Speichern",
    "Saving…": "Wird gespeichert…",
    connected: "verbunden",
    "token stored, encrypted": "Token gespeichert, verschlüsselt",
    saved: "gespeichert",
    "Replace token": "Token ersetzen",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'Benötigt ein feingranulares persönliches Zugriffstoken, das auf nur dieses Repository beschränkt ist, mit der Berechtigung Contents auf Lesen und Schreiben. Ein klassisches Token mit dem Bereich "repo" funktioniert auch, erreicht aber jedes Repository, auf das dieses Konto zugreifen kann — bevorzuge nach Möglichkeit das feingranulare Token.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'Benötigt ein Projekt-Zugriffstoken — beschränkt auf nur dieses Projekt, nicht dein ganzes Konto — mit den Bereichen "read_repository" und "write_repository". Erstelle es auf der eigenen Settings → Access tokens-Seite des Projekts (es gibt keine einzelne kontoweite Seite dafür).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'Benötigt ein Bitbucket-API-Token, das ausschließlich auf Repository-Zugriff beschränkt ist (die Bereiche "read:repository:bitbucket" und "write:repository:bitbucket"), plus den Bitbucket-Benutzernamen, zu dem es gehört — Bitbucket authentifiziert das Paar, nicht nur das Token.',
  },
  "zh-CN": {
    "Source Control": "源代码管理",
    Providers: "提供商",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "连接一个账户，让 Tovu 可以读取你的仓库，之后再推送更改。这不会把你的内容变成 git 版本化文件——那是一个单独的功能，尚未构建。",
    "Loading connections…": "正在加载连接…",
    Connect: "连接",
    "Access token": "访问令牌",
    "Which token do I need?": "我需要哪种令牌？",
    "Leave blank to keep the current token.": "留空以保留当前令牌。",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "以加密方式存储在服务器上。保存后，Tovu 不会再次显示它。",
    "Create a token": "创建令牌",
    Username: "用户名",
    "The Bitbucket username this API token belongs to.": "此 API 令牌所属的 Bitbucket 用户名。",
    Save: "保存",
    "Saving…": "正在保存…",
    connected: "已连接",
    "token stored, encrypted": "令牌已存储，已加密",
    saved: "已保存于",
    "Replace token": "更换令牌",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      '需要一个精细令牌，仅限访问此仓库，并将 Contents 权限设为读写。具有 "repo" 范围的经典令牌也可以使用，但会访问该账户可访问的所有仓库——请尽可能使用精细令牌。',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      '需要一个项目访问令牌——仅限于此项目，而非整个账户——具有 "read_repository" 和 "write_repository" 范围。请从该项目自己的 Settings → Access tokens 页面创建（没有统一的账户级页面）。',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      '需要一个仅限仓库访问的 Bitbucket API 令牌（"read:repository:bitbucket" 和 "write:repository:bitbucket" 范围），以及其所属的 Bitbucket 用户名——Bitbucket 验证的是这一对信息，而不仅仅是令牌本身。',
  },
  "zh-TW": {
    "Source Control": "原始碼管理",
    Providers: "供應商",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "連接一個帳戶，讓 Tovu 可以讀取你的儲存庫，之後再推送變更。這不會把你的內容變成 git 版本化檔案——那是另一項功能，尚未建置。",
    "Loading connections…": "正在載入連線…",
    Connect: "連接",
    "Access token": "存取權杖",
    "Which token do I need?": "我需要哪種權杖？",
    "Leave blank to keep the current token.": "留空以保留目前的權杖。",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "以加密方式儲存於伺服器上。儲存後，Tovu 不會再次顯示它。",
    "Create a token": "建立權杖",
    Username: "使用者名稱",
    "The Bitbucket username this API token belongs to.": "此 API 權杖所屬的 Bitbucket 使用者名稱。",
    Save: "儲存",
    "Saving…": "正在儲存…",
    connected: "已連接",
    "token stored, encrypted": "權杖已儲存，已加密",
    saved: "已儲存於",
    "Replace token": "更換權杖",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      '需要精細權杖，僅限存取此儲存庫，並將 Contents 權限設為讀寫。具有 "repo" 範圍的傳統權杖也可使用，但會存取此帳戶可存取的每個儲存庫——請盡量使用精細權杖。',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      '需要專案存取權杖——僅限此專案，而非整個帳戶——具有 "read_repository" 與 "write_repository" 範圍。請從該專案自己的 Settings → Access tokens 頁面建立（沒有單一的帳戶層級頁面）。',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      '需要僅限儲存庫存取的 Bitbucket API 權杖（"read:repository:bitbucket" 與 "write:repository:bitbucket" 範圍），以及其所屬的 Bitbucket 使用者名稱——Bitbucket 驗證的是這一對資訊，而非僅是權杖本身。',
  },
  "pt-BR": {
    "Source Control": "Controle de código-fonte",
    Providers: "Provedores",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Conecte uma conta para que o Tovu possa ler seus repositórios e, mais tarde, enviar alterações a eles. Isso não transforma seu conteúdo em arquivos versionados com git — isso é um recurso separado, ainda não construído.",
    "Loading connections…": "Carregando conexões…",
    Connect: "Conectar",
    "Access token": "Token de acesso",
    "Which token do I need?": "Qual token eu preciso?",
    "Leave blank to keep the current token.": "Deixe em branco para manter o token atual.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Armazenado de forma criptografada no servidor. Depois de salvo, o Tovu nunca o exibe novamente.",
    "Create a token": "Criar um token",
    Username: "Nome de usuário",
    "The Bitbucket username this API token belongs to.": "O nome de usuário do Bitbucket ao qual este token de API pertence.",
    Save: "Salvar",
    "Saving…": "Salvando…",
    connected: "conectado",
    "token stored, encrypted": "token salvo, criptografado",
    saved: "salvo em",
    "Replace token": "Substituir token",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'Requer um token de acesso pessoal refinado, restrito apenas a este repositório, com a permissão Contents definida como Leitura e escrita. Um token clássico com o escopo "repo" também funciona, mas alcança todos os repositórios que esta conta pode acessar — prefira o token refinado sempre que possível.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'Requer um token de acesso de projeto — restrito apenas a este projeto, não a toda a conta — com os escopos "read_repository" e "write_repository". Crie-o na própria página Settings → Access tokens do projeto (não existe uma única página para toda a conta).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'Requer um token de API do Bitbucket restrito apenas ao acesso de repositório (os escopos "read:repository:bitbucket" e "write:repository:bitbucket"), além do nome de usuário do Bitbucket ao qual pertence — o Bitbucket autentica o par, não apenas o token.',
  },
  ru: {
    "Source Control": "Управление исходным кодом",
    Providers: "Провайдеры",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Подключите аккаунт, чтобы Tovu мог читать ваши репозитории, а позже отправлять в них изменения. Это не превращает ваш контент в файлы, версионируемые в git — это отдельная функция, которая ещё не реализована.",
    "Loading connections…": "Загрузка подключений…",
    Connect: "Подключить",
    "Access token": "Токен доступа",
    "Which token do I need?": "Какой токен мне нужен?",
    "Leave blank to keep the current token.": "Оставьте пустым, чтобы сохранить текущий токен.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Хранится в зашифрованном виде на сервере. После сохранения Tovu больше никогда его не показывает.",
    "Create a token": "Создать токен",
    Username: "Имя пользователя",
    "The Bitbucket username this API token belongs to.": "Имя пользователя Bitbucket, которому принадлежит этот API-токен.",
    Save: "Сохранить",
    "Saving…": "Сохранение…",
    connected: "подключено",
    "token stored, encrypted": "токен сохранён, зашифрован",
    saved: "сохранено",
    "Replace token": "Заменить токен",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'Требуется детализированный персональный токен доступа, ограниченный только этим репозиторием, с правом Contents на чтение и запись. Классический токен с областью "repo" тоже подходит, но даёт доступ ко всем репозиториям, доступным этому аккаунту — по возможности используйте детализированный токен.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'Требуется токен доступа проекта — ограниченный только этим проектом, а не всем аккаунтом — с областями "read_repository" и "write_repository". Создайте его на странице Settings → Access tokens самого проекта (единой страницы для всего аккаунта не существует).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'Требуется токен API Bitbucket, ограниченный только доступом к репозиторию (области "read:repository:bitbucket" и "write:repository:bitbucket"), а также имя пользователя Bitbucket, которому он принадлежит — Bitbucket проверяет именно эту пару, а не только токен.',
  },
  fa: {
    "Source Control": "کنترل کد منبع",
    Providers: "ارائه‌دهندگان",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "یک حساب کاربری متصل کنید تا Tovu بتواند مخازن شما را بخواند و بعداً تغییرات را به آن‌ها push کند. این کار محتوای شما را به فایل‌های نسخه‌بندی‌شده با git تبدیل نمی‌کند — آن یک ویژگی جداگانه است که هنوز ساخته نشده است.",
    "Loading connections…": "در حال بارگذاری اتصال‌ها…",
    Connect: "اتصال",
    "Access token": "توکن دسترسی",
    "Which token do I need?": "به کدام توکن نیاز دارم؟",
    "Leave blank to keep the current token.": "برای نگه‌داشتن توکن فعلی، آن را خالی بگذارید.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "به‌صورت رمزگذاری‌شده روی سرور ذخیره می‌شود. پس از ذخیره، Tovu دیگر هرگز آن را نمایش نمی‌دهد.",
    "Create a token": "ایجاد توکن",
    Username: "نام کاربری",
    "The Bitbucket username this API token belongs to.": "نام کاربری Bitbucket که این توکن API به آن تعلق دارد.",
    Save: "ذخیره",
    "Saving…": "در حال ذخیره…",
    connected: "متصل شد",
    "token stored, encrypted": "توکن ذخیره شد، رمزگذاری‌شده",
    saved: "ذخیره‌شده در",
    "Replace token": "جایگزینی توکن",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'به یک توکن دسترسی شخصی دقیق نیاز دارد که فقط به این مخزن محدود شده باشد، با مجوز Contents تنظیم‌شده روی خواندن و نوشتن. یک توکن کلاسیک با محدوده "repo" هم کار می‌کند، اما به هر مخزنی که این حساب به آن دسترسی دارد می‌رسد — در صورت امکان از توکن دقیق استفاده کنید.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'به یک توکن دسترسی پروژه نیاز دارد — که فقط به این پروژه محدود شده، نه کل حساب شما — با محدوده‌های "read_repository" و "write_repository". آن را از صفحه Settings → Access tokens خودِ پروژه بسازید (صفحه‌ی واحدی برای کل حساب وجود ندارد).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'به یک توکن API بیت‌باکت نیاز دارد که فقط به دسترسی مخزن محدود شده (محدوده‌های "read:repository:bitbucket" و "write:repository:bitbucket")، به‌همراه نام کاربری Bitbucket که به آن تعلق دارد — Bitbucket این جفت را احراز هویت می‌کند، نه فقط توکن را.',
  },
  ar: {
    "Source Control": "إدارة الشيفرة المصدرية",
    Providers: "المزوّدون",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "اربط حسابًا حتى يتمكن Tovu من قراءة مستودعاتك، ودفع التغييرات إليها لاحقًا. هذا لا يحوّل محتواك إلى ملفات مُدارة بالإصدارات عبر git — تلك ميزة منفصلة لم تُبنَ بعد.",
    "Loading connections…": "جارٍ تحميل الاتصالات…",
    Connect: "اتصال",
    "Access token": "رمز الوصول",
    "Which token do I need?": "ما الرمز الذي أحتاجه؟",
    "Leave blank to keep the current token.": "اتركه فارغًا للاحتفاظ بالرمز الحالي.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "يُخزَّن مشفّرًا على الخادم. بعد الحفظ، لن يعرضه Tovu مرة أخرى أبدًا.",
    "Create a token": "إنشاء رمز",
    Username: "اسم المستخدم",
    "The Bitbucket username this API token belongs to.": "اسم مستخدم Bitbucket الذي ينتمي إليه رمز API هذا.",
    Save: "حفظ",
    "Saving…": "جارٍ الحفظ…",
    connected: "متصل",
    "token stored, encrypted": "الرمز محفوظ، مشفّر",
    saved: "تم الحفظ في",
    "Replace token": "استبدال الرمز",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'يتطلب رمز وصول شخصي دقيقًا مقصورًا على هذا المستودع فقط، بصلاحية Contents مضبوطة على القراءة والكتابة. يعمل أيضًا رمز تقليدي بنطاق "repo"، لكنه يصل إلى كل مستودع يمكن لهذا الحساب الوصول إليه — يُفضَّل استخدام الرمز الدقيق كلما أمكن.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'يتطلب رمز وصول مشروع — مقصورًا على هذا المشروع فقط، وليس حسابك بالكامل — بنطاقي "read_repository" و"write_repository". أنشئه من صفحة Settings ← Access tokens الخاصة بالمشروع نفسه (لا توجد صفحة واحدة على مستوى الحساب لهذا الغرض).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'يتطلب رمز API من Bitbucket مقصورًا على الوصول إلى المستودع فقط (نطاقا "read:repository:bitbucket" و"write:repository:bitbucket")، إضافةً إلى اسم مستخدم Bitbucket الذي ينتمي إليه — يتحقق Bitbucket من هذا الزوج معًا، وليس من الرمز وحده.',
  },
  ja: {
    "Source Control": "ソースコード管理",
    Providers: "プロバイダー",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "アカウントを接続すると、Tovu はリポジトリを読み取り、後で変更を push できるようになります。これによってコンテンツが git 管理のファイルになるわけではありません — それは別の、まだ未実装の機能です。",
    "Loading connections…": "接続を読み込み中…",
    Connect: "接続",
    "Access token": "アクセストークン",
    "Which token do I need?": "どのトークンが必要ですか？",
    "Leave blank to keep the current token.": "現在のトークンを維持するには空欄のままにしてください。",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "サーバー上に暗号化して保存されます。保存後、Tovu が再び表示することはありません。",
    "Create a token": "トークンを作成",
    Username: "ユーザー名",
    "The Bitbucket username this API token belongs to.": "この API トークンが属する Bitbucket のユーザー名。",
    Save: "保存",
    "Saving…": "保存中…",
    connected: "接続済み",
    "token stored, encrypted": "トークン保存済み・暗号化済み",
    saved: "保存日時",
    "Replace token": "トークンを置き換える",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'このリポジトリだけに限定された、きめ細かい個人アクセストークンが必要です。Contents 権限を読み書きに設定してください。"repo" スコープを持つクラシックなトークンでも動作しますが、このアカウントがアクセスできるすべてのリポジトリに届いてしまいます — 可能な限りきめ細かいトークンを優先してください。',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'このプロジェクトだけに限定された（アカウント全体ではない）プロジェクトアクセストークンが必要です。"read_repository" と "write_repository" スコープを設定してください。プロジェクト自体の Settings → Access tokens ページから作成します（アカウント全体で使える単一のページはありません）。',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'リポジトリへのアクセスのみに限定された Bitbucket API トークン（"read:repository:bitbucket" と "write:repository:bitbucket" スコープ）と、それが属する Bitbucket のユーザー名が必要です — Bitbucket はトークン単体ではなく、この組み合わせを認証します。',
  },
  ko: {
    "Source Control": "소스 코드 관리",
    Providers: "제공업체",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "계정을 연결하면 Tovu가 저장소를 읽고 나중에 변경 사항을 push할 수 있습니다. 이 기능은 콘텐츠를 git 버전 관리 파일로 바꾸지 않습니다 — 그것은 아직 구축되지 않은 별도의 기능입니다.",
    "Loading connections…": "연결을 불러오는 중…",
    Connect: "연결",
    "Access token": "액세스 토큰",
    "Which token do I need?": "어떤 토큰이 필요한가요?",
    "Leave blank to keep the current token.": "현재 토큰을 유지하려면 비워 두세요.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "서버에 암호화되어 저장됩니다. 저장 후에는 Tovu가 다시는 표시하지 않습니다.",
    "Create a token": "토큰 만들기",
    Username: "사용자 이름",
    "The Bitbucket username this API token belongs to.": "이 API 토큰이 속한 Bitbucket 사용자 이름입니다.",
    Save: "저장",
    "Saving…": "저장 중…",
    connected: "연결됨",
    "token stored, encrypted": "토큰 저장됨, 암호화됨",
    saved: "저장 시각",
    "Replace token": "토큰 교체",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      '이 저장소에만 국한된 세분화된 개인 액세스 토큰이 필요하며, Contents 권한을 읽기/쓰기로 설정해야 합니다. "repo" 범위를 가진 클래식 토큰도 작동하지만 이 계정이 접근할 수 있는 모든 저장소에 도달합니다 — 가능하면 세분화된 토큰을 우선하세요.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      '전체 계정이 아닌 이 프로젝트에만 국한된 프로젝트 액세스 토큰이 필요하며, "read_repository" 및 "write_repository" 범위를 설정해야 합니다. 프로젝트 자체의 Settings → Access tokens 페이지에서 생성하세요 (계정 전체에 대한 단일 페이지는 없습니다).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      '저장소 접근으로만 범위가 제한된 Bitbucket API 토큰("read:repository:bitbucket" 및 "write:repository:bitbucket" 범위)과, 그것이 속한 Bitbucket 사용자 이름이 필요합니다 — Bitbucket은 토큰 단독이 아니라 이 조합을 인증합니다.',
  },
  pl: {
    "Source Control": "Kontrola kodu źródłowego",
    Providers: "Dostawcy",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Połącz konto, aby Tovu mógł odczytywać Twoje repozytoria, a później wysyłać do nich zmiany. Nie zamienia to Twoich treści w pliki wersjonowane przez git — to osobna funkcja, jeszcze niezbudowana.",
    "Loading connections…": "Wczytywanie połączeń…",
    Connect: "Połącz",
    "Access token": "Token dostępu",
    "Which token do I need?": "Jakiego tokenu potrzebuję?",
    "Leave blank to keep the current token.": "Pozostaw puste, aby zachować bieżący token.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Przechowywany zaszyfrowany na serwerze. Po zapisaniu Tovu nigdy więcej go nie wyświetli.",
    "Create a token": "Utwórz token",
    Username: "Nazwa użytkownika",
    "The Bitbucket username this API token belongs to.": "Nazwa użytkownika Bitbucket, do którego należy ten token API.",
    Save: "Zapisz",
    "Saving…": "Zapisywanie…",
    connected: "połączono",
    "token stored, encrypted": "token zapisany, zaszyfrowany",
    saved: "zapisano",
    "Replace token": "Zastąp token",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'Wymaga precyzyjnego osobistego tokenu dostępu ograniczonego wyłącznie do tego repozytorium, z uprawnieniem Contents ustawionym na odczyt i zapis. Klasyczny token o zakresie "repo" również działa, ale obejmuje każde repozytorium dostępne dla tego konta — jeśli to możliwe, preferuj token precyzyjny.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'Wymaga tokenu dostępu projektu — ograniczonego wyłącznie do tego projektu, a nie całego konta — o zakresach "read_repository" i "write_repository". Utwórz go na własnej stronie projektu Settings → Access tokens (nie istnieje jedna strona dla całego konta).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'Wymaga tokenu API Bitbucket ograniczonego wyłącznie do dostępu do repozytorium (zakresy "read:repository:bitbucket" i "write:repository:bitbucket"), a także nazwy użytkownika Bitbucket, do którego należy — Bitbucket uwierzytelnia tę parę, a nie sam token.',
  },
  hu: {
    "Source Control": "Forráskód-kezelés",
    Providers: "Szolgáltatók",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Kapcsolj össze egy fiókot, hogy a Tovu olvasni tudja a tárolóidat, később pedig változtatásokat küldhessen beléjük. Ez nem alakítja a tartalmadat git által verziózott fájlokká — az egy külön, még meg nem épített funkció.",
    "Loading connections…": "Kapcsolatok betöltése…",
    Connect: "Kapcsolódás",
    "Access token": "Hozzáférési token",
    "Which token do I need?": "Melyik tokenre van szükségem?",
    "Leave blank to keep the current token.": "Hagyd üresen a jelenlegi token megtartásához.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Titkosítva tárolódik a szerveren. Mentés után a Tovu soha többé nem jeleníti meg.",
    "Create a token": "Token létrehozása",
    Username: "Felhasználónév",
    "The Bitbucket username this API token belongs to.": "A Bitbucket felhasználónév, amelyhez ez az API-token tartozik.",
    Save: "Mentés",
    "Saving…": "Mentés…",
    connected: "kapcsolódva",
    "token stored, encrypted": "token elmentve, titkosítva",
    saved: "mentve",
    "Replace token": "Token cseréje",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'Finomhangolt személyes hozzáférési token szükséges, amely kizárólag erre a tárolóra korlátozódik, a Contents jogosultsággal olvasásra és írásra állítva. A klasszikus, "repo" hatókörű token is működik, de eléri a fiók által elérhető összes tárolót — lehetőség szerint a finomhangolt tokent részesítsd előnyben.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'Projekt-hozzáférési token szükséges — kizárólag erre a projektre korlátozva, nem az egész fiókra — "read_repository" és "write_repository" hatókörrel. Hozd létre a projekt saját Settings → Access tokens oldalán (nincs egyetlen, fiókszintű oldal ehhez).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'Kizárólag tárolóhozzáférésre korlátozott Bitbucket API-token szükséges ("read:repository:bitbucket" és "write:repository:bitbucket" hatókörök), valamint a Bitbucket felhasználónév, amelyhez tartozik — a Bitbucket ezt a párost hitelesíti, nem csak a tokent.',
  },
  fr: {
    "Source Control": "Gestion du code source",
    Providers: "Fournisseurs",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Connecte un compte pour que Tovu puisse lire tes dépôts, puis y pousser des modifications plus tard. Cela ne transforme pas ton contenu en fichiers versionnés par git — c'est une fonctionnalité distincte, pas encore construite.",
    "Loading connections…": "Chargement des connexions…",
    Connect: "Connecter",
    "Access token": "Jeton d'accès",
    "Which token do I need?": "De quel jeton ai-je besoin ?",
    "Leave blank to keep the current token.": "Laisser vide pour conserver le jeton actuel.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Stocké chiffré sur le serveur. Une fois enregistré, Tovu ne l'affiche plus jamais.",
    "Create a token": "Créer un jeton",
    Username: "Nom d'utilisateur",
    "The Bitbucket username this API token belongs to.": "Le nom d'utilisateur Bitbucket auquel ce jeton API appartient.",
    Save: "Enregistrer",
    "Saving…": "Enregistrement…",
    connected: "connecté",
    "token stored, encrypted": "jeton enregistré, chiffré",
    saved: "enregistré le",
    "Replace token": "Remplacer le jeton",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'Nécessite un jeton d\'accès personnel fin, limité à ce seul dépôt, avec la permission Contents réglée sur lecture et écriture. Un jeton classique avec le champ "repo" fonctionne aussi, mais donne accès à tous les dépôts que ce compte peut atteindre — préférez le jeton fin quand c\'est possible.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'Nécessite un jeton d\'accès de projet — limité à ce seul projet, pas à tout le compte — avec les champs "read_repository" et "write_repository". Créez-le depuis la page Settings → Access tokens du projet lui-même (il n\'existe pas de page unique pour tout le compte).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'Nécessite un jeton API Bitbucket limité au seul accès aux dépôts (les champs "read:repository:bitbucket" et "write:repository:bitbucket"), ainsi que le nom d\'utilisateur Bitbucket auquel il appartient — Bitbucket authentifie cette paire, pas seulement le jeton.',
  },
  uk: {
    "Source Control": "Керування вихідним кодом",
    Providers: "Провайдери",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Підключіть обліковий запис, щоб Tovu міг читати ваші репозиторії, а пізніше надсилати до них зміни. Це не перетворює ваш вміст на файли, версійовані git — це окрема функція, яку ще не реалізовано.",
    "Loading connections…": "Завантаження підключень…",
    Connect: "Підключити",
    "Access token": "Токен доступу",
    "Which token do I need?": "Який токен мені потрібен?",
    "Leave blank to keep the current token.": "Залиште порожнім, щоб зберегти поточний токен.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Зберігається в зашифрованому вигляді на сервері. Після збереження Tovu більше ніколи його не показує.",
    "Create a token": "Створити токен",
    Username: "Ім'я користувача",
    "The Bitbucket username this API token belongs to.": "Ім'я користувача Bitbucket, якому належить цей токен API.",
    Save: "Зберегти",
    "Saving…": "Збереження…",
    connected: "підключено",
    "token stored, encrypted": "токен збережено, зашифровано",
    saved: "збережено",
    "Replace token": "Замінити токен",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'Потрібен деталізований особистий токен доступу, обмежений лише цим репозиторієм, із правом Contents на читання й запис. Класичний токен з областю "repo" також підходить, але надає доступ до кожного репозиторію, доступного цьому обліковому запису — за можливості віддавайте перевагу деталізованому токену.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'Потрібен токен доступу проєкту — обмежений лише цим проєктом, а не всім обліковим записом — з областями "read_repository" та "write_repository". Створіть його на сторінці Settings → Access tokens самого проєкту (єдиної сторінки для всього облікового запису не існує).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'Потрібен токен API Bitbucket, обмежений лише доступом до репозиторію (області "read:repository:bitbucket" та "write:repository:bitbucket"), а також ім\'я користувача Bitbucket, якому він належить — Bitbucket перевіряє саме цю пару, а не лише токен.',
  },
  tr: {
    "Source Control": "Kaynak kod yönetimi",
    Providers: "Sağlayıcılar",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Tovu'nun depolarınızı okuyabilmesi ve daha sonra değişiklikleri bunlara gönderebilmesi için bir hesap bağlayın. Bu, içeriğinizi git ile sürümlenen dosyalara dönüştürmez — bu, henüz oluşturulmamış ayrı bir özelliktir.",
    "Loading connections…": "Bağlantılar yükleniyor…",
    Connect: "Bağlan",
    "Access token": "Erişim belirteci",
    "Which token do I need?": "Hangi belirtece ihtiyacım var?",
    "Leave blank to keep the current token.": "Mevcut belirteci korumak için boş bırakın.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Sunucuda şifrelenerek saklanır. Kaydedildikten sonra Tovu onu bir daha asla göstermez.",
    "Create a token": "Belirteç oluştur",
    Username: "Kullanıcı adı",
    "The Bitbucket username this API token belongs to.": "Bu API belirtecinin ait olduğu Bitbucket kullanıcı adı.",
    Save: "Kaydet",
    "Saving…": "Kaydediliyor…",
    connected: "bağlandı",
    "token stored, encrypted": "belirteç kaydedildi, şifrelendi",
    saved: "kaydedildi",
    "Replace token": "Belirteci değiştir",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'Yalnızca bu depoyla sınırlı, ayrıntılı bir kişisel erişim belirteci gerekir; Contents izni Okuma ve yazma olarak ayarlanmalıdır. "repo" kapsamına sahip klasik bir belirteç de çalışır, ancak bu hesabın erişebildiği her depoya ulaşır — mümkünse ayrıntılı belirteci tercih edin.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'Tüm hesap değil, yalnızca bu projeyle sınırlı bir proje erişim belirteci gerekir; "read_repository" ve "write_repository" kapsamlarına sahip olmalıdır. Bunu projenin kendi Settings → Access tokens sayfasından oluşturun (hesap geneli için tek bir sayfa yoktur).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'Yalnızca depo erişimiyle sınırlı bir Bitbucket API belirteci ("read:repository:bitbucket" ve "write:repository:bitbucket" kapsamları) ile ait olduğu Bitbucket kullanıcı adı gerekir — Bitbucket yalnızca belirteci değil, bu ikiliyi doğrular.',
  },
  th: {
    "Source Control": "การจัดการซอร์สโค้ด",
    Providers: "ผู้ให้บริการ",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "เชื่อมต่อบัญชีเพื่อให้ Tovu สามารถอ่านที่เก็บโค้ดของคุณ และ push การเปลี่ยนแปลงไปยังที่เก็บเหล่านั้นได้ในภายหลัง การทำเช่นนี้ไม่ได้เปลี่ยนเนื้อหาของคุณให้เป็นไฟล์ที่ควบคุมเวอร์ชันด้วย git — นั่นเป็นฟีเจอร์แยกต่างหากที่ยังไม่ได้สร้างขึ้น",
    "Loading connections…": "กำลังโหลดการเชื่อมต่อ…",
    Connect: "เชื่อมต่อ",
    "Access token": "โทเคนการเข้าถึง",
    "Which token do I need?": "ฉันต้องการโทเคนแบบไหน?",
    "Leave blank to keep the current token.": "เว้นว่างไว้เพื่อคงโทเคนปัจจุบัน",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "จัดเก็บแบบเข้ารหัสไว้บนเซิร์ฟเวอร์ เมื่อบันทึกแล้ว Tovu จะไม่แสดงอีกเลย",
    "Create a token": "สร้างโทเคน",
    Username: "ชื่อผู้ใช้",
    "The Bitbucket username this API token belongs to.": "ชื่อผู้ใช้ Bitbucket ที่โทเคน API นี้เป็นของ",
    Save: "บันทึก",
    "Saving…": "กำลังบันทึก…",
    connected: "เชื่อมต่อแล้ว",
    "token stored, encrypted": "บันทึกโทเคนแล้ว เข้ารหัสแล้ว",
    saved: "บันทึกเมื่อ",
    "Replace token": "แทนที่โทเคน",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'ต้องใช้โทเคนการเข้าถึงส่วนบุคคลแบบละเอียดที่จำกัดเฉพาะที่เก็บโค้ดนี้เท่านั้น โดยตั้งสิทธิ์ Contents เป็นอ่านและเขียน โทเคนแบบคลาสสิกที่มีขอบเขต "repo" ก็ใช้ได้เช่นกัน แต่จะเข้าถึงทุกที่เก็บโค้ดที่บัญชีนี้เข้าถึงได้ — ควรเลือกใช้โทเคนแบบละเอียดเมื่อทำได้',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'ต้องใช้โทเคนการเข้าถึงโปรเจกต์ — จำกัดเฉพาะโปรเจกต์นี้เท่านั้น ไม่ใช่ทั้งบัญชี — ที่มีขอบเขต "read_repository" และ "write_repository" สร้างได้จากหน้า Settings → Access tokens ของโปรเจกต์นั้นเอง (ไม่มีหน้าเดียวสำหรับทั้งบัญชี)',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'ต้องใช้โทเคน API ของ Bitbucket ที่จำกัดเฉพาะการเข้าถึงที่เก็บโค้ด (ขอบเขต "read:repository:bitbucket" และ "write:repository:bitbucket") พร้อมชื่อผู้ใช้ Bitbucket ที่เป็นเจ้าของ — Bitbucket ตรวจสอบสิทธิ์จากคู่ข้อมูลนี้ ไม่ใช่โทเคนเพียงอย่างเดียว',
  },
  it: {
    "Source Control": "Controllo del codice sorgente",
    Providers: "Fornitori",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Collega un account per consentire a Tovu di leggere i tuoi repository e, in seguito, inviarvi modifiche. Questo non trasforma i tuoi contenuti in file versionati con git — è una funzionalità separata, non ancora realizzata.",
    "Loading connections…": "Caricamento connessioni…",
    Connect: "Collega",
    "Access token": "Token di accesso",
    "Which token do I need?": "Di quale token ho bisogno?",
    "Leave blank to keep the current token.": "Lascia vuoto per mantenere il token attuale.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Memorizzato in forma cifrata sul server. Una volta salvato, Tovu non lo mostrerà mai più.",
    "Create a token": "Crea un token",
    Username: "Nome utente",
    "The Bitbucket username this API token belongs to.": "Il nome utente Bitbucket a cui appartiene questo token API.",
    Save: "Salva",
    "Saving…": "Salvataggio…",
    connected: "connesso",
    "token stored, encrypted": "token salvato, cifrato",
    saved: "salvato il",
    "Replace token": "Sostituisci token",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'Richiede un token di accesso personale granulare, limitato a questo solo repository, con il permesso Contents impostato su Lettura e scrittura. Funziona anche un token classico con l\'ambito "repo", ma raggiunge ogni repository a cui questo account può accedere — preferisci il token granulare quando possibile.',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'Richiede un token di accesso al progetto — limitato a questo solo progetto, non all\'intero account — con gli ambiti "read_repository" e "write_repository". Crealo dalla pagina Settings → Access tokens del progetto stesso (non esiste un\'unica pagina per l\'intero account).',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'Richiede un token API di Bitbucket limitato al solo accesso al repository (gli ambiti "read:repository:bitbucket" e "write:repository:bitbucket"), oltre al nome utente Bitbucket a cui appartiene — Bitbucket autentica la coppia, non solo il token.',
  },
  hi: {
    "Source Control": "स्रोत कोड नियंत्रण",
    Providers: "प्रदाता",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "एक खाता कनेक्ट करें ताकि Tovu आपके रिपॉज़िटरी पढ़ सके, और बाद में उनमें बदलाव push कर सके। इससे आपकी सामग्री git-वर्ज़न वाली फ़ाइलों में नहीं बदलती — वह एक अलग सुविधा है, जो अभी बनाई नहीं गई है।",
    "Loading connections…": "कनेक्शन लोड हो रहे हैं…",
    Connect: "कनेक्ट करें",
    "Access token": "एक्सेस टोकन",
    "Which token do I need?": "मुझे कौन सा टोकन चाहिए?",
    "Leave blank to keep the current token.": "मौजूदा टोकन बनाए रखने के लिए इसे खाली छोड़ दें।",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "सर्वर पर एन्क्रिप्ट करके संग्रहीत किया जाता है। सहेजे जाने के बाद, Tovu इसे फिर कभी नहीं दिखाता।",
    "Create a token": "टोकन बनाएं",
    Username: "उपयोगकर्ता नाम",
    "The Bitbucket username this API token belongs to.": "वह Bitbucket उपयोगकर्ता नाम जिससे यह API टोकन संबंधित है।",
    Save: "सहेजें",
    "Saving…": "सहेजा जा रहा है…",
    connected: "जुड़ा हुआ",
    "token stored, encrypted": "टोकन सहेजा गया, एन्क्रिप्टेड",
    saved: "सहेजा गया",
    "Replace token": "टोकन बदलें",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'इसके लिए केवल इसी रिपॉज़िटरी तक सीमित एक बारीक व्यक्तिगत एक्सेस टोकन चाहिए, जिसमें Contents अनुमति पढ़ने और लिखने पर सेट हो। "repo" स्कोप वाला क्लासिक टोकन भी काम करता है, लेकिन यह उन सभी रिपॉज़िटरी तक पहुँच देता है जिन तक यह खाता पहुँच सकता है — जब संभव हो, बारीक टोकन को प्राथमिकता दें।',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'इसके लिए एक प्रोजेक्ट एक्सेस टोकन चाहिए — जो पूरे खाते तक नहीं, केवल इसी प्रोजेक्ट तक सीमित हो — जिसमें "read_repository" और "write_repository" स्कोप हों। इसे प्रोजेक्ट के अपने Settings → Access tokens पेज से बनाएं (पूरे खाते के लिए कोई एक पेज नहीं है)।',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'इसके लिए केवल रिपॉज़िटरी एक्सेस तक सीमित एक Bitbucket API टोकन ("read:repository:bitbucket" और "write:repository:bitbucket" स्कोप), साथ ही वह Bitbucket उपयोगकर्ता नाम चाहिए जिससे यह संबंधित है — Bitbucket केवल टोकन को नहीं, बल्कि इस जोड़ी को प्रमाणित करता है।',
  },
  ur: {
    "Source Control": "سورس کوڈ کنٹرول",
    Providers: "فراہم کنندگان",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "ایک اکاؤنٹ منسلک کریں تاکہ Tovu آپ کے ریپوزٹریز پڑھ سکے، اور بعد میں ان میں تبدیلیاں push کر سکے۔ اس سے آپ کا مواد git-ورژن شدہ فائلوں میں تبدیل نہیں ہوتا — وہ ایک الگ فیچر ہے، جو ابھی تک نہیں بنایا گیا۔",
    "Loading connections…": "کنکشنز لوڈ ہو رہے ہیں…",
    Connect: "منسلک کریں",
    "Access token": "رسائی ٹوکن",
    "Which token do I need?": "مجھے کون سا ٹوکن چاہیے؟",
    "Leave blank to keep the current token.": "موجودہ ٹوکن برقرار رکھنے کے لیے اسے خالی چھوڑ دیں۔",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "سرور پر خفیہ کاری کے ساتھ محفوظ کیا جاتا ہے۔ محفوظ ہونے کے بعد، Tovu اسے دوبارہ کبھی نہیں دکھاتا۔",
    "Create a token": "ٹوکن بنائیں",
    Username: "صارف نام",
    "The Bitbucket username this API token belongs to.": "وہ Bitbucket صارف نام جس سے یہ API ٹوکن تعلق رکھتا ہے۔",
    Save: "محفوظ کریں",
    "Saving…": "محفوظ ہو رہا ہے…",
    connected: "منسلک",
    "token stored, encrypted": "ٹوکن محفوظ، خفیہ کاری شدہ",
    saved: "محفوظ کیا گیا",
    "Replace token": "ٹوکن تبدیل کریں",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'اس کے لیے صرف اسی ریپوزٹری تک محدود ایک باریک ذاتی رسائی ٹوکن درکار ہے، جس میں Contents اجازت پڑھنے اور لکھنے پر سیٹ ہو۔ "repo" اسکوپ کے ساتھ کلاسک ٹوکن بھی کام کرتا ہے، لیکن یہ ہر اس ریپوزٹری تک رسائی دیتا ہے جس تک یہ اکاؤنٹ پہنچ سکتا ہے — جب ممکن ہو باریک ٹوکن کو ترجیح دیں۔',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'اس کے لیے ایک پراجیکٹ ایکسیس ٹوکن درکار ہے — جو پورے اکاؤنٹ کے بجائے صرف اسی پراجیکٹ تک محدود ہو — جس میں "read_repository" اور "write_repository" اسکوپس ہوں۔ اسے پراجیکٹ کے اپنے Settings → Access tokens صفحے سے بنائیں (پورے اکاؤنٹ کے لیے کوئی ایک صفحہ نہیں ہے)۔',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'اس کے لیے صرف ریپوزٹری تک رسائی محدود کردہ Bitbucket API ٹوکن ("read:repository:bitbucket" اور "write:repository:bitbucket" اسکوپس)، اور وہ Bitbucket صارف نام درکار ہے جس سے یہ تعلق رکھتا ہے — Bitbucket صرف ٹوکن کی نہیں بلکہ اس جوڑے کی توثیق کرتا ہے۔',
  },
  bn: {
    "Source Control": "সোর্স কোড নিয়ন্ত্রণ",
    Providers: "প্রদানকারী",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "একটি অ্যাকাউন্ট সংযুক্ত করুন যাতে Tovu আপনার রিপোজিটরি পড়তে পারে, এবং পরে সেগুলোতে পরিবর্তন push করতে পারে। এটি আপনার কন্টেন্টকে git-ভার্সনযুক্ত ফাইলে পরিণত করে না — সেটি একটি আলাদা ফিচার, যা এখনও তৈরি হয়নি।",
    "Loading connections…": "সংযোগ লোড হচ্ছে…",
    Connect: "সংযুক্ত করুন",
    "Access token": "অ্যাক্সেস টোকেন",
    "Which token do I need?": "আমার কোন টোকেন প্রয়োজন?",
    "Leave blank to keep the current token.": "বর্তমান টোকেন বজায় রাখতে খালি রাখুন।",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "সার্ভারে এনক্রিপ্ট করে সংরক্ষণ করা হয়। একবার সংরক্ষণ করার পর, Tovu এটি আর কখনও দেখাবে না।",
    "Create a token": "টোকেন তৈরি করুন",
    Username: "ব্যবহারকারীর নাম",
    "The Bitbucket username this API token belongs to.": "যে Bitbucket ব্যবহারকারীর নামের সাথে এই API টোকেন সম্পর্কিত।",
    Save: "সংরক্ষণ করুন",
    "Saving…": "সংরক্ষণ হচ্ছে…",
    connected: "সংযুক্ত",
    "token stored, encrypted": "টোকেন সংরক্ষিত, এনক্রিপ্টেড",
    saved: "সংরক্ষিত হয়েছে",
    "Replace token": "টোকেন প্রতিস্থাপন করুন",
    'Needs a fine-grained personal access token scoped to just this repository, with Contents permission set to Read and write. A classic token with the "repo" scope also works, but reaches every repository this account can access — prefer the fine-grained token.':
      'শুধুমাত্র এই রিপোজিটরির মধ্যে সীমাবদ্ধ একটি সূক্ষ্ম ব্যক্তিগত অ্যাক্সেস টোকেন প্রয়োজন, যেখানে Contents অনুমতি Read and write-এ সেট করা থাকবে। "repo" স্কোপ সহ একটি ক্লাসিক টোকেনও কাজ করে, তবে এটি এই অ্যাকাউন্ট যত রিপোজিটরিতে পৌঁছাতে পারে সবগুলোতে পৌঁছায় — যখনই সম্ভব সূক্ষ্ম টোকেনটি ব্যবহার করুন।',
    'Needs a project access token — scoped to just this project, not your whole account — with the "read_repository" and "write_repository" scopes. Create one from the project\'s own Settings → Access tokens page (there is no single account-wide page for these).':
      'পুরো অ্যাকাউন্ট নয়, শুধুমাত্র এই প্রকল্পের মধ্যে সীমাবদ্ধ একটি প্রকল্প অ্যাক্সেস টোকেন প্রয়োজন, যেখানে "read_repository" এবং "write_repository" স্কোপ থাকবে। এটি প্রকল্পের নিজস্ব Settings → Access tokens পৃষ্ঠা থেকে তৈরি করুন (পুরো অ্যাকাউন্টের জন্য একটিমাত্র পৃষ্ঠা নেই)।',
    'Needs a Bitbucket API token scoped to repository access only (the "read:repository:bitbucket" and "write:repository:bitbucket" scopes), plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the token alone.':
      'শুধুমাত্র রিপোজিটরি অ্যাক্সেসের মধ্যে সীমাবদ্ধ একটি Bitbucket API টোকেন ("read:repository:bitbucket" এবং "write:repository:bitbucket" স্কোপ), এবং যে Bitbucket ব্যবহারকারীর নামের সাথে এটি সম্পর্কিত তা প্রয়োজন — Bitbucket শুধু টোকেন নয়, এই জোড়াটি যাচাই করে।',
  },
};

const ACCESS_TOKEN_LINK_TRANSLATIONS: Record<string, Record<string, string>> = {
  es: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "¿Necesitas guardar más de un token, cambiarle el nombre a uno o administrar todas las credenciales guardadas en un solo lugar?", "Create access token": "Crear token de acceso" },
  id: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "Perlu menyimpan lebih dari satu token, mengganti namanya, atau mengelola semua kredensial tersimpan di satu tempat?", "Create access token": "Buat token akses" },
  de: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "Möchten Sie mehr als ein Token speichern, eines umbenennen oder alle gespeicherten Zugangsdaten an einem Ort verwalten?", "Create access token": "Zugriffstoken erstellen" },
  "zh-CN": { "Need to save more than one token, rename one, or manage every saved credential in one place?": "需要保存多个令牌、重命名令牌，或在一个地方管理所有已保存的凭据吗？", "Create access token": "创建访问令牌" },
  "zh-TW": { "Need to save more than one token, rename one, or manage every saved credential in one place?": "需要儲存多個權杖、重新命名權杖，或在同一處管理所有已儲存的認證嗎？", "Create access token": "建立存取權杖" },
  "pt-BR": { "Need to save more than one token, rename one, or manage every saved credential in one place?": "Precisa salvar mais de um token, renomear um ou gerenciar todas as credenciais salvas em um só lugar?", "Create access token": "Criar token de acesso" },
  ru: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "Нужно сохранить несколько токенов, переименовать один или управлять всеми сохранёнными учётными данными в одном месте?", "Create access token": "Создать токен доступа" },
  fa: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "می‌خواهید بیش از یک توکن ذخیره کنید، نام یکی را تغییر دهید یا همهٔ اعتبارنامه‌های ذخیره‌شده را در یک جا مدیریت کنید؟", "Create access token": "ایجاد توکن دسترسی" },
  ar: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "هل تحتاج إلى حفظ أكثر من رمز مميز واحد أو إعادة تسمية أحدها أو إدارة كل بيانات الاعتماد المحفوظة في مكان واحد؟", "Create access token": "إنشاء رمز وصول" },
  ja: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "複数のトークンを保存したり、名前を変更したり、保存済みの認証情報を一か所で管理したりする必要がありますか？", "Create access token": "アクセストークンを作成" },
  ko: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "토큰을 여러 개 저장하거나 이름을 바꾸거나 저장된 모든 자격 증명을 한곳에서 관리해야 하나요?", "Create access token": "액세스 토큰 만들기" },
  pl: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "Chcesz zapisać więcej niż jeden token, zmienić nazwę tokenu lub zarządzać wszystkimi zapisanymi poświadczeniami w jednym miejscu?", "Create access token": "Utwórz token dostępu" },
  hu: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "Több tokent szeretne menteni, átnevezni egyet, vagy minden mentett hitelesítő adatot egy helyen kezelni?", "Create access token": "Hozzáférési token létrehozása" },
  fr: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "Besoin d’enregistrer plusieurs jetons, d’en renommer un ou de gérer tous les identifiants enregistrés au même endroit ?", "Create access token": "Créer un jeton d’accès" },
  uk: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "Потрібно зберегти кілька токенів, перейменувати один або керувати всіма збереженими обліковими даними в одному місці?", "Create access token": "Створити токен доступу" },
  tr: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "Birden fazla belirteç kaydetmeniz, birinin adını değiştirmeniz veya tüm kayıtlı kimlik bilgilerini tek yerde yönetmeniz mi gerekiyor?", "Create access token": "Erişim belirteci oluştur" },
  th: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "ต้องการบันทึกโทเค็นมากกว่าหนึ่งรายการ เปลี่ยนชื่อ หรือจัดการข้อมูลรับรองที่บันทึกไว้ทั้งหมดในที่เดียวหรือไม่?", "Create access token": "สร้างโทเค็นการเข้าถึง" },
  it: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "Devi salvare più di un token, rinominarne uno o gestire tutte le credenziali salvate in un unico posto?", "Create access token": "Crea token di accesso" },
  hi: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "क्या आपको एक से अधिक टोकन सहेजने, किसी का नाम बदलने या सभी सहेजे गए क्रेडेंशियल एक ही जगह प्रबंधित करने हैं?", "Create access token": "एक्सेस टोकन बनाएँ" },
  ur: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "کیا آپ کو ایک سے زیادہ ٹوکن محفوظ کرنے، کسی کا نام بدلنے، یا تمام محفوظ اسناد ایک جگہ منظم کرنے کی ضرورت ہے؟", "Create access token": "رسائی ٹوکن بنائیں" },
  bn: { "Need to save more than one token, rename one, or manage every saved credential in one place?": "একাধিক টোকেন সংরক্ষণ, কোনোটি পুনঃনামকরণ বা সব সংরক্ষিত পরিচয়পত্র এক জায়গায় পরিচালনা করতে চান?", "Create access token": "অ্যাক্সেস টোকেন তৈরি করুন" },
};

const SOURCE_CONTROL_DICT: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(SOURCE_CONTROL_TRANSLATIONS).map(([locale, entries]) => [
    locale,
    { ...entries, ...(ACCESS_TOKEN_LINK_TRANSLATIONS[locale] ?? {}) },
  ]),
);

export const t = createDictionaryTranslator(SOURCE_CONTROL_DICT);

/**
 * The row list's LOAD-error banner (`GET .../system/source-control/credentials`) — English only,
 * mirroring `deployment-i18n.tsx`'s own `publishCredentialsLoadErrorMessage` and its documented
 * "partial-coverage precedent": an English banner in an otherwise-translated page degrades legibly.
 */
const SOURCE_CONTROL_CREDENTIALS_LOAD_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not load source control connections ({error}).",
};

export function sourceControlCredentialsLoadErrorMessage(locale: string, error: string): string {
  return interpolate(
    SOURCE_CONTROL_CREDENTIALS_LOAD_ERROR_TEMPLATE[locale] ?? SOURCE_CONTROL_CREDENTIALS_LOAD_ERROR_TEMPLATE.en,
    { error }
  );
}

/**
 * One row's save-error banner. Also carries a rejected VALIDATION failure's `detail` text, routed
 * here by `classifySourceControlCredentialSubmitError` (`rules.ts`) instead of the generic
 * `describeApiError` fallback — same shape `publishCredentialSaveErrorMessage` uses.
 */
const SOURCE_CONTROL_CREDENTIAL_SAVE_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not save this connection ({error}).",
};

export function sourceControlCredentialSaveErrorMessage(locale: string, error: string): string {
  return interpolate(
    SOURCE_CONTROL_CREDENTIAL_SAVE_ERROR_TEMPLATE[locale] ?? SOURCE_CONTROL_CREDENTIAL_SAVE_ERROR_TEMPLATE.en,
    { error }
  );
}
