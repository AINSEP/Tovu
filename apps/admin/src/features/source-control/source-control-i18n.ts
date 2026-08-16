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

const SOURCE_CONTROL_DICT: Record<string, Record<string, string>> = {
  es: {
    "Source Control": "Control de código fuente",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Conecta una cuenta para que Tovu pueda leer tus repositorios, y más adelante enviar cambios a ellos. Esto no convierte tu contenido en archivos versionados con git — eso es una función aparte, que aún no está construida.",
    "Loading connections…": "Cargando conexiones…",
    Connect: "Conectar",
    "Save a personal access token so Tovu can use this account.": "Guarda un token de acceso personal para que Tovu pueda usar esta cuenta.",
    "Access token": "Token de acceso",
    "Leave blank to keep the current token.": "Déjalo en blanco para conservar el token actual.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Se guarda cifrado en el servidor. Una vez guardado, Tovu nunca vuelve a mostrarlo.",
    "Create a token": "Crear un token",
    Username: "Nombre de usuario",
    "The Bitbucket username this app password belongs to.": "El nombre de usuario de Bitbucket al que pertenece esta contraseña de aplicación.",
    Save: "Guardar",
    "Saving…": "Guardando…",
    connected: "conectado",
    "token stored, encrypted": "token guardado, cifrado",
    saved: "guardado",
    "Replace token": "Reemplazar token",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'Necesita un token de acceso personal clásico con el alcance "repo", o un token detallado con el permiso Contents en Lectura y escritura.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'Necesita un token de acceso personal con los alcances "read_repository" y "write_repository".',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Necesita una contraseña de aplicación con permisos de Repositories: Read y Write, más el nombre de usuario de Bitbucket al que pertenece — Bitbucket autentica el par, no la contraseña de aplicación por sí sola.",
  },
  id: {
    "Source Control": "Kontrol Kode Sumber",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Hubungkan akun agar Tovu dapat membaca repositori Anda, dan mendorong perubahan ke sana nanti. Ini tidak mengubah konten Anda menjadi berkas berversi git — itu fitur terpisah, yang belum dibuat.",
    "Loading connections…": "Memuat koneksi…",
    Connect: "Hubungkan",
    "Save a personal access token so Tovu can use this account.": "Simpan token akses pribadi agar Tovu dapat menggunakan akun ini.",
    "Access token": "Token akses",
    "Leave blank to keep the current token.": "Biarkan kosong untuk mempertahankan token saat ini.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Disimpan terenkripsi di server. Setelah disimpan, Tovu tidak akan pernah menampilkannya lagi.",
    "Create a token": "Buat token",
    Username: "Nama pengguna",
    "The Bitbucket username this app password belongs to.": "Nama pengguna Bitbucket tempat kata sandi aplikasi ini berasal.",
    Save: "Simpan",
    "Saving…": "Menyimpan…",
    connected: "terhubung",
    "token stored, encrypted": "token tersimpan, terenkripsi",
    saved: "disimpan",
    "Replace token": "Ganti token",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'Memerlukan token akses pribadi klasik dengan cakupan "repo", atau token terperinci dengan izin Contents diatur ke Read and write.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'Memerlukan token akses pribadi dengan cakupan "read_repository" dan "write_repository".',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Memerlukan kata sandi aplikasi dengan izin Repositories: Read and Write, ditambah nama pengguna Bitbucket tempat asalnya — Bitbucket mengautentikasi pasangan ini, bukan hanya kata sandi aplikasinya.",
  },
  de: {
    "Source Control": "Quellcodeverwaltung",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Verbinde ein Konto, damit Tovu deine Repositories lesen und später Änderungen dorthin pushen kann. Dadurch werden deine Inhalte nicht in git-versionierte Dateien umgewandelt — das ist eine separate Funktion, die noch nicht gebaut ist.",
    "Loading connections…": "Verbindungen werden geladen…",
    Connect: "Verbinden",
    "Save a personal access token so Tovu can use this account.": "Speichere ein persönliches Zugriffstoken, damit Tovu dieses Konto nutzen kann.",
    "Access token": "Zugriffstoken",
    "Leave blank to keep the current token.": "Leer lassen, um das aktuelle Token zu behalten.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Wird verschlüsselt auf dem Server gespeichert. Nach dem Speichern zeigt Tovu es nie wieder an.",
    "Create a token": "Token erstellen",
    Username: "Benutzername",
    "The Bitbucket username this app password belongs to.": "Der Bitbucket-Benutzername, zu dem dieses App-Passwort gehört.",
    Save: "Speichern",
    "Saving…": "Wird gespeichert…",
    connected: "verbunden",
    "token stored, encrypted": "Token gespeichert, verschlüsselt",
    saved: "gespeichert",
    "Replace token": "Token ersetzen",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'Benötigt ein klassisches persönliches Zugriffstoken mit dem Bereich "repo", oder ein feingranulares Token mit der Berechtigung Contents auf Lesen und Schreiben.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'Benötigt ein persönliches Zugriffstoken mit den Bereichen "read_repository" und "write_repository".',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Benötigt ein App-Passwort mit den Berechtigungen Repositories: Read und Write, plus den Bitbucket-Benutzernamen, zu dem es gehört — Bitbucket authentifiziert das Paar, nicht nur das App-Passwort.",
  },
  "zh-CN": {
    "Source Control": "源代码管理",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "连接一个账户，让 Tovu 可以读取你的仓库，之后再推送更改。这不会把你的内容变成 git 版本化文件——那是一个单独的功能，尚未构建。",
    "Loading connections…": "正在加载连接…",
    Connect: "连接",
    "Save a personal access token so Tovu can use this account.": "保存个人访问令牌，让 Tovu 可以使用此账户。",
    "Access token": "访问令牌",
    "Leave blank to keep the current token.": "留空以保留当前令牌。",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "以加密方式存储在服务器上。保存后，Tovu 不会再次显示它。",
    "Create a token": "创建令牌",
    Username: "用户名",
    "The Bitbucket username this app password belongs to.": "此应用密码所属的 Bitbucket 用户名。",
    Save: "保存",
    "Saving…": "正在保存…",
    connected: "已连接",
    "token stored, encrypted": "令牌已存储，已加密",
    saved: "已保存于",
    "Replace token": "更换令牌",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      '需要一个具有 "repo" 范围的经典个人访问令牌，或一个将 Contents 权限设为读写的精细令牌。',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      '需要一个具有 "read_repository" 和 "write_repository" 范围的个人访问令牌。',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "需要一个具有 Repositories: Read 和 Write 权限的应用密码，以及其所属的 Bitbucket 用户名——Bitbucket 验证的是这一对信息，而不仅仅是应用密码本身。",
  },
  "zh-TW": {
    "Source Control": "原始碼管理",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "連接一個帳戶，讓 Tovu 可以讀取你的儲存庫，之後再推送變更。這不會把你的內容變成 git 版本化檔案——那是另一項功能，尚未建置。",
    "Loading connections…": "正在載入連線…",
    Connect: "連接",
    "Save a personal access token so Tovu can use this account.": "儲存個人存取權杖，讓 Tovu 可以使用此帳戶。",
    "Access token": "存取權杖",
    "Leave blank to keep the current token.": "留空以保留目前的權杖。",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "以加密方式儲存於伺服器上。儲存後，Tovu 不會再次顯示它。",
    "Create a token": "建立權杖",
    Username: "使用者名稱",
    "The Bitbucket username this app password belongs to.": "此應用程式密碼所屬的 Bitbucket 使用者名稱。",
    Save: "儲存",
    "Saving…": "正在儲存…",
    connected: "已連接",
    "token stored, encrypted": "權杖已儲存，已加密",
    saved: "已儲存於",
    "Replace token": "更換權杖",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      '需要具有 "repo" 範圍的傳統個人存取權杖，或將 Contents 權限設為讀寫的精細權杖。',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      '需要具有 "read_repository" 與 "write_repository" 範圍的個人存取權杖。',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "需要具有 Repositories: Read 與 Write 權限的應用程式密碼，以及其所屬的 Bitbucket 使用者名稱——Bitbucket 驗證的是這一對資訊，而非僅是應用程式密碼本身。",
  },
  "pt-BR": {
    "Source Control": "Controle de código-fonte",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Conecte uma conta para que o Tovu possa ler seus repositórios e, mais tarde, enviar alterações a eles. Isso não transforma seu conteúdo em arquivos versionados com git — isso é um recurso separado, ainda não construído.",
    "Loading connections…": "Carregando conexões…",
    Connect: "Conectar",
    "Save a personal access token so Tovu can use this account.": "Salve um token de acesso pessoal para que o Tovu possa usar esta conta.",
    "Access token": "Token de acesso",
    "Leave blank to keep the current token.": "Deixe em branco para manter o token atual.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Armazenado de forma criptografada no servidor. Depois de salvo, o Tovu nunca o exibe novamente.",
    "Create a token": "Criar um token",
    Username: "Nome de usuário",
    "The Bitbucket username this app password belongs to.": "O nome de usuário do Bitbucket ao qual esta senha de aplicativo pertence.",
    Save: "Salvar",
    "Saving…": "Salvando…",
    connected: "conectado",
    "token stored, encrypted": "token salvo, criptografado",
    saved: "salvo em",
    "Replace token": "Substituir token",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'Requer um token de acesso pessoal clássico com o escopo "repo", ou um token refinado com a permissão Contents definida como Leitura e escrita.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'Requer um token de acesso pessoal com os escopos "read_repository" e "write_repository".',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Requer uma senha de aplicativo com as permissões Repositories: Read e Write, além do nome de usuário do Bitbucket ao qual pertence — o Bitbucket autentica o par, não apenas a senha de aplicativo.",
  },
  ru: {
    "Source Control": "Управление исходным кодом",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Подключите аккаунт, чтобы Tovu мог читать ваши репозитории, а позже отправлять в них изменения. Это не превращает ваш контент в файлы, версионируемые в git — это отдельная функция, которая ещё не реализована.",
    "Loading connections…": "Загрузка подключений…",
    Connect: "Подключить",
    "Save a personal access token so Tovu can use this account.": "Сохраните персональный токен доступа, чтобы Tovu мог использовать этот аккаунт.",
    "Access token": "Токен доступа",
    "Leave blank to keep the current token.": "Оставьте пустым, чтобы сохранить текущий токен.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Хранится в зашифрованном виде на сервере. После сохранения Tovu больше никогда его не показывает.",
    "Create a token": "Создать токен",
    Username: "Имя пользователя",
    "The Bitbucket username this app password belongs to.": "Имя пользователя Bitbucket, которому принадлежит этот пароль приложения.",
    Save: "Сохранить",
    "Saving…": "Сохранение…",
    connected: "подключено",
    "token stored, encrypted": "токен сохранён, зашифрован",
    saved: "сохранено",
    "Replace token": "Заменить токен",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'Требуется классический персональный токен доступа с областью "repo" или детализированный токен с правом Contents на чтение и запись.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'Требуется персональный токен доступа с областями "read_repository" и "write_repository".',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Требуется пароль приложения с правами Repositories: Read и Write, а также имя пользователя Bitbucket, которому он принадлежит — Bitbucket проверяет именно эту пару, а не только пароль приложения.",
  },
  fa: {
    "Source Control": "کنترل کد منبع",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "یک حساب کاربری متصل کنید تا Tovu بتواند مخازن شما را بخواند و بعداً تغییرات را به آن‌ها push کند. این کار محتوای شما را به فایل‌های نسخه‌بندی‌شده با git تبدیل نمی‌کند — آن یک ویژگی جداگانه است که هنوز ساخته نشده است.",
    "Loading connections…": "در حال بارگذاری اتصال‌ها…",
    Connect: "اتصال",
    "Save a personal access token so Tovu can use this account.": "یک توکن دسترسی شخصی ذخیره کنید تا Tovu بتواند از این حساب استفاده کند.",
    "Access token": "توکن دسترسی",
    "Leave blank to keep the current token.": "برای نگه‌داشتن توکن فعلی، آن را خالی بگذارید.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "به‌صورت رمزگذاری‌شده روی سرور ذخیره می‌شود. پس از ذخیره، Tovu دیگر هرگز آن را نمایش نمی‌دهد.",
    "Create a token": "ایجاد توکن",
    Username: "نام کاربری",
    "The Bitbucket username this app password belongs to.": "نام کاربری Bitbucket که این رمز عبور برنامه به آن تعلق دارد.",
    Save: "ذخیره",
    "Saving…": "در حال ذخیره…",
    connected: "متصل شد",
    "token stored, encrypted": "توکن ذخیره شد، رمزگذاری‌شده",
    saved: "ذخیره‌شده در",
    "Replace token": "جایگزینی توکن",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'به یک توکن دسترسی شخصی کلاسیک با محدوده "repo"، یا یک توکن دقیق با مجوز Contents تنظیم‌شده روی خواندن و نوشتن نیاز دارد.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'به یک توکن دسترسی شخصی با محدوده‌های "read_repository" و "write_repository" نیاز دارد.',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "به یک رمز عبور برنامه با مجوزهای Repositories: Read و Write، به‌همراه نام کاربری Bitbucket که به آن تعلق دارد نیاز است — Bitbucket این جفت را احراز هویت می‌کند، نه فقط رمز عبور برنامه را.",
  },
  ar: {
    "Source Control": "إدارة الشيفرة المصدرية",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "اربط حسابًا حتى يتمكن Tovu من قراءة مستودعاتك، ودفع التغييرات إليها لاحقًا. هذا لا يحوّل محتواك إلى ملفات مُدارة بالإصدارات عبر git — تلك ميزة منفصلة لم تُبنَ بعد.",
    "Loading connections…": "جارٍ تحميل الاتصالات…",
    Connect: "اتصال",
    "Save a personal access token so Tovu can use this account.": "احفظ رمز وصول شخصي حتى يتمكن Tovu من استخدام هذا الحساب.",
    "Access token": "رمز الوصول",
    "Leave blank to keep the current token.": "اتركه فارغًا للاحتفاظ بالرمز الحالي.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "يُخزَّن مشفّرًا على الخادم. بعد الحفظ، لن يعرضه Tovu مرة أخرى أبدًا.",
    "Create a token": "إنشاء رمز",
    Username: "اسم المستخدم",
    "The Bitbucket username this app password belongs to.": "اسم مستخدم Bitbucket الذي تنتمي إليه كلمة مرور التطبيق هذه.",
    Save: "حفظ",
    "Saving…": "جارٍ الحفظ…",
    connected: "متصل",
    "token stored, encrypted": "الرمز محفوظ، مشفّر",
    saved: "تم الحفظ في",
    "Replace token": "استبدال الرمز",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'يتطلب رمز وصول شخصي تقليدي بنطاق "repo"، أو رمزًا دقيقًا بصلاحية Contents مضبوطة على القراءة والكتابة.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'يتطلب رمز وصول شخصي بنطاقي "read_repository" و"write_repository".',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "يتطلب كلمة مرور تطبيق بصلاحيات Repositories: Read وWrite، إضافةً إلى اسم مستخدم Bitbucket الذي تنتمي إليه — يتحقق Bitbucket من هذا الزوج معًا، وليس من كلمة مرور التطبيق وحدها.",
  },
  ja: {
    "Source Control": "ソースコード管理",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "アカウントを接続すると、Tovu はリポジトリを読み取り、後で変更を push できるようになります。これによってコンテンツが git 管理のファイルになるわけではありません — それは別の、まだ未実装の機能です。",
    "Loading connections…": "接続を読み込み中…",
    Connect: "接続",
    "Save a personal access token so Tovu can use this account.": "このアカウントを Tovu が使用できるよう、個人アクセストークンを保存してください。",
    "Access token": "アクセストークン",
    "Leave blank to keep the current token.": "現在のトークンを維持するには空欄のままにしてください。",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "サーバー上に暗号化して保存されます。保存後、Tovu が再び表示することはありません。",
    "Create a token": "トークンを作成",
    Username: "ユーザー名",
    "The Bitbucket username this app password belongs to.": "このアプリパスワードが属する Bitbucket のユーザー名。",
    Save: "保存",
    "Saving…": "保存中…",
    connected: "接続済み",
    "token stored, encrypted": "トークン保存済み・暗号化済み",
    saved: "保存日時",
    "Replace token": "トークンを置き換える",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      '"repo" スコープを持つクラシックな個人アクセストークン、または Contents 権限を読み書きに設定したきめ細かいトークンが必要です。',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      '"read_repository" と "write_repository" スコープを持つ個人アクセストークンが必要です。',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Repositories: Read と Write の権限を持つアプリパスワードと、それが属する Bitbucket のユーザー名が必要です — Bitbucket はアプリパスワード単体ではなく、この組み合わせを認証します。",
  },
  ko: {
    "Source Control": "소스 코드 관리",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "계정을 연결하면 Tovu가 저장소를 읽고 나중에 변경 사항을 push할 수 있습니다. 이 기능은 콘텐츠를 git 버전 관리 파일로 바꾸지 않습니다 — 그것은 아직 구축되지 않은 별도의 기능입니다.",
    "Loading connections…": "연결을 불러오는 중…",
    Connect: "연결",
    "Save a personal access token so Tovu can use this account.": "Tovu가 이 계정을 사용할 수 있도록 개인 액세스 토큰을 저장하세요.",
    "Access token": "액세스 토큰",
    "Leave blank to keep the current token.": "현재 토큰을 유지하려면 비워 두세요.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "서버에 암호화되어 저장됩니다. 저장 후에는 Tovu가 다시는 표시하지 않습니다.",
    "Create a token": "토큰 만들기",
    Username: "사용자 이름",
    "The Bitbucket username this app password belongs to.": "이 앱 비밀번호가 속한 Bitbucket 사용자 이름입니다.",
    Save: "저장",
    "Saving…": "저장 중…",
    connected: "연결됨",
    "token stored, encrypted": "토큰 저장됨, 암호화됨",
    saved: "저장 시각",
    "Replace token": "토큰 교체",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      '"repo" 범위를 가진 클래식 개인 액세스 토큰이나, Contents 권한을 읽기/쓰기로 설정한 세분화된 토큰이 필요합니다.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      '"read_repository" 및 "write_repository" 범위를 가진 개인 액세스 토큰이 필요합니다.',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Repositories: Read 및 Write 권한을 가진 앱 비밀번호와 그것이 속한 Bitbucket 사용자 이름이 필요합니다 — Bitbucket은 앱 비밀번호 단독이 아니라 이 조합을 인증합니다.",
  },
  pl: {
    "Source Control": "Kontrola kodu źródłowego",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Połącz konto, aby Tovu mógł odczytywać Twoje repozytoria, a później wysyłać do nich zmiany. Nie zamienia to Twoich treści w pliki wersjonowane przez git — to osobna funkcja, jeszcze niezbudowana.",
    "Loading connections…": "Wczytywanie połączeń…",
    Connect: "Połącz",
    "Save a personal access token so Tovu can use this account.": "Zapisz osobisty token dostępu, aby Tovu mógł korzystać z tego konta.",
    "Access token": "Token dostępu",
    "Leave blank to keep the current token.": "Pozostaw puste, aby zachować bieżący token.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Przechowywany zaszyfrowany na serwerze. Po zapisaniu Tovu nigdy więcej go nie wyświetli.",
    "Create a token": "Utwórz token",
    Username: "Nazwa użytkownika",
    "The Bitbucket username this app password belongs to.": "Nazwa użytkownika Bitbucket, do którego należy to hasło aplikacji.",
    Save: "Zapisz",
    "Saving…": "Zapisywanie…",
    connected: "połączono",
    "token stored, encrypted": "token zapisany, zaszyfrowany",
    saved: "zapisano",
    "Replace token": "Zastąp token",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'Wymaga klasycznego osobistego tokenu dostępu o zakresie "repo" lub tokenu precyzyjnego z uprawnieniem Contents ustawionym na odczyt i zapis.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'Wymaga osobistego tokenu dostępu o zakresach "read_repository" i "write_repository".',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Wymaga hasła aplikacji z uprawnieniami Repositories: Read i Write, a także nazwy użytkownika Bitbucket, do którego należy — Bitbucket uwierzytelnia tę parę, a nie samo hasło aplikacji.",
  },
  hu: {
    "Source Control": "Forráskód-kezelés",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Kapcsolj össze egy fiókot, hogy a Tovu olvasni tudja a tárolóidat, később pedig változtatásokat küldhessen beléjük. Ez nem alakítja a tartalmadat git által verziózott fájlokká — az egy külön, még meg nem épített funkció.",
    "Loading connections…": "Kapcsolatok betöltése…",
    Connect: "Kapcsolódás",
    "Save a personal access token so Tovu can use this account.": "Mentsd el a személyes hozzáférési tokent, hogy a Tovu használhassa ezt a fiókot.",
    "Access token": "Hozzáférési token",
    "Leave blank to keep the current token.": "Hagyd üresen a jelenlegi token megtartásához.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Titkosítva tárolódik a szerveren. Mentés után a Tovu soha többé nem jeleníti meg.",
    "Create a token": "Token létrehozása",
    Username: "Felhasználónév",
    "The Bitbucket username this app password belongs to.": "A Bitbucket felhasználónév, amelyhez ez az alkalmazásjelszó tartozik.",
    Save: "Mentés",
    "Saving…": "Mentés…",
    connected: "kapcsolódva",
    "token stored, encrypted": "token elmentve, titkosítva",
    saved: "mentve",
    "Replace token": "Token cseréje",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'Klasszikus személyes hozzáférési token szükséges "repo" hatókörrel, vagy finomhangolt token, amelyben a Contents jogosultság olvasásra és írásra van állítva.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'Személyes hozzáférési token szükséges "read_repository" és "write_repository" hatókörrel.',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Alkalmazásjelszó szükséges Repositories: Read és Write jogosultsággal, valamint a Bitbucket felhasználónév, amelyhez tartozik — a Bitbucket ezt a párost hitelesíti, nem csak az alkalmazásjelszót.",
  },
  fr: {
    "Source Control": "Gestion du code source",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Connecte un compte pour que Tovu puisse lire tes dépôts, puis y pousser des modifications plus tard. Cela ne transforme pas ton contenu en fichiers versionnés par git — c'est une fonctionnalité distincte, pas encore construite.",
    "Loading connections…": "Chargement des connexions…",
    Connect: "Connecter",
    "Save a personal access token so Tovu can use this account.": "Enregistre un jeton d'accès personnel pour que Tovu puisse utiliser ce compte.",
    "Access token": "Jeton d'accès",
    "Leave blank to keep the current token.": "Laisser vide pour conserver le jeton actuel.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Stocké chiffré sur le serveur. Une fois enregistré, Tovu ne l'affiche plus jamais.",
    "Create a token": "Créer un jeton",
    Username: "Nom d'utilisateur",
    "The Bitbucket username this app password belongs to.": "Le nom d'utilisateur Bitbucket auquel ce mot de passe d'application appartient.",
    Save: "Enregistrer",
    "Saving…": "Enregistrement…",
    connected: "connecté",
    "token stored, encrypted": "jeton enregistré, chiffré",
    saved: "enregistré le",
    "Replace token": "Remplacer le jeton",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'Nécessite un jeton d\'accès personnel classique avec le champ "repo", ou un jeton précis avec la permission Contents réglée sur lecture et écriture.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'Nécessite un jeton d\'accès personnel avec les champs "read_repository" et "write_repository".',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Nécessite un mot de passe d'application avec les permissions Repositories : Read et Write, ainsi que le nom d'utilisateur Bitbucket auquel il appartient — Bitbucket authentifie cette paire, pas seulement le mot de passe d'application.",
  },
  uk: {
    "Source Control": "Керування вихідним кодом",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Підключіть обліковий запис, щоб Tovu міг читати ваші репозиторії, а пізніше надсилати до них зміни. Це не перетворює ваш вміст на файли, версійовані git — це окрема функція, яку ще не реалізовано.",
    "Loading connections…": "Завантаження підключень…",
    Connect: "Підключити",
    "Save a personal access token so Tovu can use this account.": "Збережіть особистий токен доступу, щоб Tovu міг використовувати цей обліковий запис.",
    "Access token": "Токен доступу",
    "Leave blank to keep the current token.": "Залиште порожнім, щоб зберегти поточний токен.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Зберігається в зашифрованому вигляді на сервері. Після збереження Tovu більше ніколи його не показує.",
    "Create a token": "Створити токен",
    Username: "Ім'я користувача",
    "The Bitbucket username this app password belongs to.": "Ім'я користувача Bitbucket, якому належить цей пароль додатка.",
    Save: "Зберегти",
    "Saving…": "Збереження…",
    connected: "підключено",
    "token stored, encrypted": "токен збережено, зашифровано",
    saved: "збережено",
    "Replace token": "Замінити токен",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'Потрібен класичний особистий токен доступу з областю "repo" або деталізований токен із правом Contents на читання й запис.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'Потрібен особистий токен доступу з областями "read_repository" та "write_repository".',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Потрібен пароль додатка з правами Repositories: Read і Write, а також ім'я користувача Bitbucket, якому він належить — Bitbucket перевіряє саме цю пару, а не лише пароль додатка.",
  },
  tr: {
    "Source Control": "Kaynak kod yönetimi",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Tovu'nun depolarınızı okuyabilmesi ve daha sonra değişiklikleri bunlara gönderebilmesi için bir hesap bağlayın. Bu, içeriğinizi git ile sürümlenen dosyalara dönüştürmez — bu, henüz oluşturulmamış ayrı bir özelliktir.",
    "Loading connections…": "Bağlantılar yükleniyor…",
    Connect: "Bağlan",
    "Save a personal access token so Tovu can use this account.": "Tovu'nun bu hesabı kullanabilmesi için bir kişisel erişim belirteci kaydedin.",
    "Access token": "Erişim belirteci",
    "Leave blank to keep the current token.": "Mevcut belirteci korumak için boş bırakın.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Sunucuda şifrelenerek saklanır. Kaydedildikten sonra Tovu onu bir daha asla göstermez.",
    "Create a token": "Belirteç oluştur",
    Username: "Kullanıcı adı",
    "The Bitbucket username this app password belongs to.": "Bu uygulama parolasının ait olduğu Bitbucket kullanıcı adı.",
    Save: "Kaydet",
    "Saving…": "Kaydediliyor…",
    connected: "bağlandı",
    "token stored, encrypted": "belirteç kaydedildi, şifrelendi",
    saved: "kaydedildi",
    "Replace token": "Belirteci değiştir",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      '"repo" kapsamına sahip klasik bir kişisel erişim belirteci veya Contents izni Okuma ve yazma olarak ayarlanmış ayrıntılı bir belirteç gerekir.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      '"read_repository" ve "write_repository" kapsamlarına sahip bir kişisel erişim belirteci gerekir.',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Repositories: Read ve Write izinlerine sahip bir uygulama parolası ile ait olduğu Bitbucket kullanıcı adı gerekir — Bitbucket yalnızca uygulama parolasını değil, bu ikiliyi doğrular.",
  },
  th: {
    "Source Control": "การจัดการซอร์สโค้ด",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "เชื่อมต่อบัญชีเพื่อให้ Tovu สามารถอ่านที่เก็บโค้ดของคุณ และ push การเปลี่ยนแปลงไปยังที่เก็บเหล่านั้นได้ในภายหลัง การทำเช่นนี้ไม่ได้เปลี่ยนเนื้อหาของคุณให้เป็นไฟล์ที่ควบคุมเวอร์ชันด้วย git — นั่นเป็นฟีเจอร์แยกต่างหากที่ยังไม่ได้สร้างขึ้น",
    "Loading connections…": "กำลังโหลดการเชื่อมต่อ…",
    Connect: "เชื่อมต่อ",
    "Save a personal access token so Tovu can use this account.": "บันทึกโทเคนการเข้าถึงส่วนบุคคลเพื่อให้ Tovu ใช้บัญชีนี้ได้",
    "Access token": "โทเคนการเข้าถึง",
    "Leave blank to keep the current token.": "เว้นว่างไว้เพื่อคงโทเคนปัจจุบัน",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "จัดเก็บแบบเข้ารหัสไว้บนเซิร์ฟเวอร์ เมื่อบันทึกแล้ว Tovu จะไม่แสดงอีกเลย",
    "Create a token": "สร้างโทเคน",
    Username: "ชื่อผู้ใช้",
    "The Bitbucket username this app password belongs to.": "ชื่อผู้ใช้ Bitbucket ที่รหัสผ่านแอปนี้เป็นของ",
    Save: "บันทึก",
    "Saving…": "กำลังบันทึก…",
    connected: "เชื่อมต่อแล้ว",
    "token stored, encrypted": "บันทึกโทเคนแล้ว เข้ารหัสแล้ว",
    saved: "บันทึกเมื่อ",
    "Replace token": "แทนที่โทเคน",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'ต้องใช้โทเคนการเข้าถึงส่วนบุคคลแบบคลาสสิกที่มีขอบเขต "repo" หรือโทเคนแบบละเอียดที่ตั้งสิทธิ์ Contents เป็นอ่านและเขียน',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'ต้องใช้โทเคนการเข้าถึงส่วนบุคคลที่มีขอบเขต "read_repository" และ "write_repository"',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "ต้องใช้รหัสผ่านแอปที่มีสิทธิ์ Repositories: Read และ Write พร้อมชื่อผู้ใช้ Bitbucket ที่เป็นเจ้าของ — Bitbucket ตรวจสอบสิทธิ์จากคู่ข้อมูลนี้ ไม่ใช่รหัสผ่านแอปเพียงอย่างเดียว",
  },
  it: {
    "Source Control": "Controllo del codice sorgente",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "Collega un account per consentire a Tovu di leggere i tuoi repository e, in seguito, inviarvi modifiche. Questo non trasforma i tuoi contenuti in file versionati con git — è una funzionalità separata, non ancora realizzata.",
    "Loading connections…": "Caricamento connessioni…",
    Connect: "Collega",
    "Save a personal access token so Tovu can use this account.": "Salva un token di accesso personale in modo che Tovu possa usare questo account.",
    "Access token": "Token di accesso",
    "Leave blank to keep the current token.": "Lascia vuoto per mantenere il token attuale.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "Memorizzato in forma cifrata sul server. Una volta salvato, Tovu non lo mostrerà mai più.",
    "Create a token": "Crea un token",
    Username: "Nome utente",
    "The Bitbucket username this app password belongs to.": "Il nome utente Bitbucket a cui appartiene questa password dell'app.",
    Save: "Salva",
    "Saving…": "Salvataggio…",
    connected: "connesso",
    "token stored, encrypted": "token salvato, cifrato",
    saved: "salvato il",
    "Replace token": "Sostituisci token",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'Richiede un token di accesso personale classico con l\'ambito "repo", oppure un token granulare con il permesso Contents impostato su Lettura e scrittura.',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'Richiede un token di accesso personale con gli ambiti "read_repository" e "write_repository".',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Richiede una password dell'app con i permessi Repositories: Read e Write, oltre al nome utente Bitbucket a cui appartiene — Bitbucket autentica la coppia, non solo la password dell'app.",
  },
  hi: {
    "Source Control": "स्रोत कोड नियंत्रण",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "एक खाता कनेक्ट करें ताकि Tovu आपके रिपॉज़िटरी पढ़ सके, और बाद में उनमें बदलाव push कर सके। इससे आपकी सामग्री git-वर्ज़न वाली फ़ाइलों में नहीं बदलती — वह एक अलग सुविधा है, जो अभी बनाई नहीं गई है।",
    "Loading connections…": "कनेक्शन लोड हो रहे हैं…",
    Connect: "कनेक्ट करें",
    "Save a personal access token so Tovu can use this account.": "एक व्यक्तिगत एक्सेस टोकन सहेजें ताकि Tovu इस खाते का उपयोग कर सके।",
    "Access token": "एक्सेस टोकन",
    "Leave blank to keep the current token.": "मौजूदा टोकन बनाए रखने के लिए इसे खाली छोड़ दें।",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "सर्वर पर एन्क्रिप्ट करके संग्रहीत किया जाता है। सहेजे जाने के बाद, Tovu इसे फिर कभी नहीं दिखाता।",
    "Create a token": "टोकन बनाएं",
    Username: "उपयोगकर्ता नाम",
    "The Bitbucket username this app password belongs to.": "वह Bitbucket उपयोगकर्ता नाम जिससे यह ऐप पासवर्ड संबंधित है।",
    Save: "सहेजें",
    "Saving…": "सहेजा जा रहा है…",
    connected: "जुड़ा हुआ",
    "token stored, encrypted": "टोकन सहेजा गया, एन्क्रिप्टेड",
    saved: "सहेजा गया",
    "Replace token": "टोकन बदलें",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'इसके लिए "repo" स्कोप वाला क्लासिक व्यक्तिगत एक्सेस टोकन, या Contents अनुमति को पढ़ने और लिखने पर सेट किया गया बारीक टोकन चाहिए।',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'इसके लिए "read_repository" और "write_repository" स्कोप वाला व्यक्तिगत एक्सेस टोकन चाहिए।',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "इसके लिए Repositories: Read और Write अनुमतियों वाला ऐप पासवर्ड, साथ ही वह Bitbucket उपयोगकर्ता नाम चाहिए जिससे यह संबंधित है — Bitbucket इस जोड़ी को प्रमाणित करता है, केवल ऐप पासवर्ड को नहीं।",
  },
  ur: {
    "Source Control": "سورس کوڈ کنٹرول",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "ایک اکاؤنٹ منسلک کریں تاکہ Tovu آپ کے ریپوزٹریز پڑھ سکے، اور بعد میں ان میں تبدیلیاں push کر سکے۔ اس سے آپ کا مواد git-ورژن شدہ فائلوں میں تبدیل نہیں ہوتا — وہ ایک الگ فیچر ہے، جو ابھی تک نہیں بنایا گیا۔",
    "Loading connections…": "کنکشنز لوڈ ہو رہے ہیں…",
    Connect: "منسلک کریں",
    "Save a personal access token so Tovu can use this account.": "ایک ذاتی رسائی ٹوکن محفوظ کریں تاکہ Tovu اس اکاؤنٹ کو استعمال کر سکے۔",
    "Access token": "رسائی ٹوکن",
    "Leave blank to keep the current token.": "موجودہ ٹوکن برقرار رکھنے کے لیے اسے خالی چھوڑ دیں۔",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "سرور پر خفیہ کاری کے ساتھ محفوظ کیا جاتا ہے۔ محفوظ ہونے کے بعد، Tovu اسے دوبارہ کبھی نہیں دکھاتا۔",
    "Create a token": "ٹوکن بنائیں",
    Username: "صارف نام",
    "The Bitbucket username this app password belongs to.": "وہ Bitbucket صارف نام جس سے یہ ایپ پاس ورڈ تعلق رکھتا ہے۔",
    Save: "محفوظ کریں",
    "Saving…": "محفوظ ہو رہا ہے…",
    connected: "منسلک",
    "token stored, encrypted": "ٹوکن محفوظ، خفیہ کاری شدہ",
    saved: "محفوظ کیا گیا",
    "Replace token": "ٹوکن تبدیل کریں",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      'اس کے لیے "repo" اسکوپ کے ساتھ کلاسک ذاتی رسائی ٹوکن، یا Contents اجازت کو پڑھنے اور لکھنے پر سیٹ کیا گیا باریک ٹوکن درکار ہے۔',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      'اس کے لیے "read_repository" اور "write_repository" اسکوپس کے ساتھ ذاتی رسائی ٹوکن درکار ہے۔',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "اس کے لیے Repositories: Read اور Write اجازتوں کے ساتھ ایپ پاس ورڈ، اور وہ Bitbucket صارف نام درکار ہے جس سے یہ تعلق رکھتا ہے — Bitbucket صرف ایپ پاس ورڈ نہیں بلکہ اس جوڑے کی توثیق کرتا ہے۔",
  },
  bn: {
    "Source Control": "সোর্স কোড নিয়ন্ত্রণ",
    "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.":
      "একটি অ্যাকাউন্ট সংযুক্ত করুন যাতে Tovu আপনার রিপোজিটরি পড়তে পারে, এবং পরে সেগুলোতে পরিবর্তন push করতে পারে। এটি আপনার কন্টেন্টকে git-ভার্সনযুক্ত ফাইলে পরিণত করে না — সেটি একটি আলাদা ফিচার, যা এখনও তৈরি হয়নি।",
    "Loading connections…": "সংযোগ লোড হচ্ছে…",
    Connect: "সংযুক্ত করুন",
    "Save a personal access token so Tovu can use this account.": "একটি ব্যক্তিগত অ্যাক্সেস টোকেন সংরক্ষণ করুন যাতে Tovu এই অ্যাকাউন্ট ব্যবহার করতে পারে।",
    "Access token": "অ্যাক্সেস টোকেন",
    "Leave blank to keep the current token.": "বর্তমান টোকেন বজায় রাখতে খালি রাখুন।",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.":
      "সার্ভারে এনক্রিপ্ট করে সংরক্ষণ করা হয়। একবার সংরক্ষণ করার পর, Tovu এটি আর কখনও দেখাবে না।",
    "Create a token": "টোকেন তৈরি করুন",
    Username: "ব্যবহারকারীর নাম",
    "The Bitbucket username this app password belongs to.": "যে Bitbucket ব্যবহারকারীর নামের সাথে এই অ্যাপ পাসওয়ার্ড সম্পর্কিত।",
    Save: "সংরক্ষণ করুন",
    "Saving…": "সংরক্ষণ হচ্ছে…",
    connected: "সংযুক্ত",
    "token stored, encrypted": "টোকেন সংরক্ষিত, এনক্রিপ্টেড",
    saved: "সংরক্ষিত হয়েছে",
    "Replace token": "টোকেন প্রতিস্থাপন করুন",
    'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents permission set to Read and write.':
      '"repo" স্কোপ সহ একটি ক্লাসিক ব্যক্তিগত অ্যাক্সেস টোকেন, অথবা Contents অনুমতি Read and write-এ সেট করা একটি সূক্ষ্ম টোকেন প্রয়োজন।',
    'Needs a personal access token with the "read_repository" and "write_repository" scopes.':
      '"read_repository" এবং "write_repository" স্কোপ সহ একটি ব্যক্তিগত অ্যাক্সেস টোকেন প্রয়োজন।',
    "Needs an app password with Repositories: Read and Write permissions, plus the Bitbucket username it belongs to — Bitbucket authenticates the pair, not the app password alone.":
      "Repositories: Read এবং Write অনুমতি সহ একটি অ্যাপ পাসওয়ার্ড, এবং যে Bitbucket ব্যবহারকারীর নামের সাথে এটি সম্পর্কিত তা প্রয়োজন — Bitbucket শুধু অ্যাপ পাসওয়ার্ড নয়, এই জোড়াটি যাচাই করে।",
  },
};

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
