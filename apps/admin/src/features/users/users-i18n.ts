/**
 * @file Spanish translation for the Users screen (`Users.tsx`) — this feature's own dictionary,
 * not the shared `lib/admin-nav-i18n.ts` one, so parallel translation passes over other admin
 * sections can't collide on the same file. Same two-step fallback every other `t()` in this app
 * uses: translated value, else the English source string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";
import { interpolate } from "../../lib/template-i18n";

const USERS_DICT: Record<string, Record<string, string>> = {
  es: {
  People: "Personas",
  Users: "Usuarios",
  "Operator accounts with access to this admin — assign roles and policies, or disable access.":
    "Cuentas de operador con acceso a este panel de administración: asigna roles y políticas, o desactiva el acceso.",
  "New user": "Nuevo usuario",

  Username: "Nombre de usuario",
  "Email (optional)": "Correo electrónico (opcional)",
  Password: "Contraseña",
  "Create user": "Crear usuario",

  Email: "Correo electrónico",
  "(none)": "(ninguno)",
  "Save email": "Guardar correo",
  "Assign role": "Asignar rol",
  "Select a role…": "Selecciona un rol…",
  "(built-in)": "(integrado)",
  Assign: "Asignar",
  "Attach policy": "Adjuntar política",
  "Select a policy…": "Selecciona una política…",
  Attach: "Adjuntar",

  "Actions for user": "Acciones para el usuario",
  none: "ninguno",

  "No users yet.": "Aún no hay usuarios.",
  "Create your first operator account to get started.": "Crea tu primera cuenta de operador para comenzar.",
  Roles: "Roles",
  Policies: "Políticas",

  "Disable this user?": "¿Desactivar este usuario?",
  "They will not be able to sign in until re-enabled.": "No podrán iniciar sesión hasta que se reactive su cuenta.",
  // rules.ts's userRowMenuItems row-menu labels — outside the original `.tsx`-only pass's scope.
  Manage: "Administrar",

  "Reset password?": "¿Restablecer contraseña?",
  "Set a new password for": "Establece una nueva contraseña para",
  "Every active session for this user will be signed out.":
    "Se cerrará toda sesión activa de este usuario.",
  "New password": "Nueva contraseña",
  "Reset password": "Restablecer contraseña",

  "Loading users…": "Cargando usuarios…",

  // Hook-level notice/error strings (use-users.hooks.ts) — these never got translated during the
  // JSX-only pass since they live in `.hooks.ts` files.
  "failed to load users": "no se pudieron cargar los usuarios",
  "failed to create user": "no se pudo crear el usuario",
  "failed to assign role": "no se pudo asignar el rol",
  "failed to attach policy": "no se pudo adjuntar la política",
  "failed to update email": "no se pudo actualizar el correo electrónico",
  "failed to reset password": "no se pudo restablecer la contraseña",
  "failed to change status": "no se pudo cambiar el estado",
  },
  id: {
    People: "Orang",
    Users: "Pengguna",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "Akun operator dengan akses ke panel admin ini — tetapkan peran dan kebijakan, atau nonaktifkan akses.",
    "New user": "Pengguna baru",

    Username: "Nama pengguna",
    "Email (optional)": "Email (opsional)",
    Password: "Kata sandi",
    "Create user": "Buat pengguna",

    Email: "Email",
    "(none)": "(tidak ada)",
    "Save email": "Simpan email",
    "Assign role": "Tetapkan peran",
    "Select a role…": "Pilih peran…",
    "(built-in)": "(bawaan)",
    Assign: "Tetapkan",
    "Attach policy": "Lampirkan kebijakan",
    "Select a policy…": "Pilih kebijakan…",
    Attach: "Lampirkan",

    "Actions for user": "Tindakan untuk pengguna",
    none: "tidak ada",

    "No users yet.": "Belum ada pengguna.",
    "Create your first operator account to get started.": "Buat akun operator pertama Anda untuk memulai.",
    Roles: "Peran",
    Policies: "Kebijakan",

    "Disable this user?": "Nonaktifkan pengguna ini?",
    "They will not be able to sign in until re-enabled.": "Mereka tidak akan bisa masuk sampai diaktifkan kembali.",
    Manage: "Kelola",

    "Reset password?": "Atur ulang kata sandi?",
    "Set a new password for": "Tetapkan kata sandi baru untuk",
    "Every active session for this user will be signed out.":
      "Setiap sesi aktif pengguna ini akan dikeluarkan.",
    "New password": "Kata sandi baru",
    "Reset password": "Atur ulang kata sandi",

    "Loading users…": "Memuat pengguna…",

    "failed to load users": "gagal memuat pengguna",
    "failed to create user": "gagal membuat pengguna",
    "failed to assign role": "gagal menetapkan peran",
    "failed to attach policy": "gagal melampirkan kebijakan",
    "failed to update email": "gagal memperbarui email",
    "failed to reset password": "gagal mengatur ulang kata sandi",
    "failed to change status": "gagal mengubah status",
  },
  de: {
    People: "Personen",
    Users: "Benutzer",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "Bedienerkonten mit Zugriff auf dieses Admin-Panel — Rollen und Richtlinien zuweisen oder den Zugriff deaktivieren.",
    "New user": "Neuer Benutzer",

    Username: "Benutzername",
    "Email (optional)": "E-Mail (optional)",
    Password: "Passwort",
    "Create user": "Benutzer erstellen",

    Email: "E-Mail",
    "(none)": "(keine)",
    "Save email": "E-Mail speichern",
    "Assign role": "Rolle zuweisen",
    "Select a role…": "Rolle auswählen…",
    "(built-in)": "(integriert)",
    Assign: "Zuweisen",
    "Attach policy": "Richtlinie anhängen",
    "Select a policy…": "Richtlinie auswählen…",
    Attach: "Anhängen",

    "Actions for user": "Aktionen für Benutzer",
    none: "keine",

    "No users yet.": "Noch keine Benutzer.",
    "Create your first operator account to get started.": "Erstellen Sie Ihr erstes Bedienerkonto, um loszulegen.",
    Roles: "Rollen",
    Policies: "Richtlinien",

    "Disable this user?": "Diesen Benutzer deaktivieren?",
    "They will not be able to sign in until re-enabled.": "Er kann sich erst wieder anmelden, wenn das Konto reaktiviert wird.",
    Manage: "Verwalten",

    "Reset password?": "Passwort zurücksetzen?",
    "Set a new password for": "Neues Passwort festlegen für",
    "Every active session for this user will be signed out.":
      "Alle aktiven Sitzungen dieses Benutzers werden abgemeldet.",
    "New password": "Neues Passwort",
    "Reset password": "Passwort zurücksetzen",

    "Loading users…": "Benutzer werden geladen…",

    "failed to load users": "Benutzer konnten nicht geladen werden",
    "failed to create user": "Benutzer konnte nicht erstellt werden",
    "failed to assign role": "Rolle konnte nicht zugewiesen werden",
    "failed to attach policy": "Richtlinie konnte nicht angehängt werden",
    "failed to update email": "E-Mail konnte nicht aktualisiert werden",
    "failed to reset password": "Passwort konnte nicht zurückgesetzt werden",
    "failed to change status": "Status konnte nicht geändert werden",
  },
  "zh-CN": {
    People: "人员",
    Users: "用户",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "拥有此管理后台访问权限的操作员账户 — 分配角色和策略，或禁用访问权限。",
    "New user": "新建用户",

    Username: "用户名",
    "Email (optional)": "电子邮箱（可选）",
    Password: "密码",
    "Create user": "创建用户",

    Email: "电子邮箱",
    "(none)": "（无）",
    "Save email": "保存邮箱",
    "Assign role": "分配角色",
    "Select a role…": "选择角色…",
    "(built-in)": "（内置）",
    Assign: "分配",
    "Attach policy": "附加策略",
    "Select a policy…": "选择策略…",
    Attach: "附加",

    "Actions for user": "用户操作",
    none: "无",

    "No users yet.": "暂无用户。",
    "Create your first operator account to get started.": "创建您的第一个操作员账户以开始使用。",
    Roles: "角色",
    Policies: "策略",

    "Disable this user?": "禁用此用户？",
    "They will not be able to sign in until re-enabled.": "在重新启用之前，该用户将无法登录。",
    Manage: "管理",

    "Reset password?": "重置密码？",
    "Set a new password for": "为以下用户设置新密码：",
    "Every active session for this user will be signed out.":
      "该用户的所有活动会话都将被登出。",
    "New password": "新密码",
    "Reset password": "重置密码",

    "Loading users…": "正在加载用户…",

    "failed to load users": "加载用户失败",
    "failed to create user": "创建用户失败",
    "failed to assign role": "分配角色失败",
    "failed to attach policy": "附加策略失败",
    "failed to update email": "更新邮箱失败",
    "failed to reset password": "重置密码失败",
    "failed to change status": "更改状态失败",
  },
  "zh-TW": {
    People: "人員",
    Users: "使用者",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "擁有此管理後台存取權限的操作員帳戶 — 指派角色與政策，或停用存取權限。",
    "New user": "新增使用者",

    Username: "使用者名稱",
    "Email (optional)": "電子郵件（選填）",
    Password: "密碼",
    "Create user": "建立使用者",

    Email: "電子郵件",
    "(none)": "（無）",
    "Save email": "儲存電子郵件",
    "Assign role": "指派角色",
    "Select a role…": "選擇角色…",
    "(built-in)": "（內建）",
    Assign: "指派",
    "Attach policy": "附加政策",
    "Select a policy…": "選擇政策…",
    Attach: "附加",

    "Actions for user": "使用者操作",
    none: "無",

    "No users yet.": "尚無使用者。",
    "Create your first operator account to get started.": "建立您的第一個操作員帳戶以開始使用。",
    Roles: "角色",
    Policies: "政策",

    "Disable this user?": "停用此使用者？",
    "They will not be able to sign in until re-enabled.": "在重新啟用之前，該使用者將無法登入。",
    Manage: "管理",

    "Reset password?": "重設密碼？",
    "Set a new password for": "為以下使用者設定新密碼：",
    "Every active session for this user will be signed out.":
      "該使用者的所有現行工作階段都將被登出。",
    "New password": "新密碼",
    "Reset password": "重設密碼",

    "Loading users…": "正在載入使用者…",

    "failed to load users": "載入使用者失敗",
    "failed to create user": "建立使用者失敗",
    "failed to assign role": "指派角色失敗",
    "failed to attach policy": "附加政策失敗",
    "failed to update email": "更新電子郵件失敗",
    "failed to reset password": "重設密碼失敗",
    "failed to change status": "變更狀態失敗",
  },
  "pt-BR": {
    People: "Pessoas",
    Users: "Usuários",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "Contas de operador com acesso a este painel de administração — atribua funções e políticas, ou desative o acesso.",
    "New user": "Novo usuário",

    Username: "Nome de usuário",
    "Email (optional)": "E-mail (opcional)",
    Password: "Senha",
    "Create user": "Criar usuário",

    Email: "E-mail",
    "(none)": "(nenhum)",
    "Save email": "Salvar e-mail",
    "Assign role": "Atribuir função",
    "Select a role…": "Selecione uma função…",
    "(built-in)": "(integrada)",
    Assign: "Atribuir",
    "Attach policy": "Anexar política",
    "Select a policy…": "Selecione uma política…",
    Attach: "Anexar",

    "Actions for user": "Ações para o usuário",
    none: "nenhum",

    "No users yet.": "Ainda não há usuários.",
    "Create your first operator account to get started.": "Crie sua primeira conta de operador para começar.",
    Roles: "Funções",
    Policies: "Políticas",

    "Disable this user?": "Desativar este usuário?",
    "They will not be able to sign in until re-enabled.": "Ele não poderá entrar até que a conta seja reativada.",
    Manage: "Gerenciar",

    "Reset password?": "Redefinir senha?",
    "Set a new password for": "Definir uma nova senha para",
    "Every active session for this user will be signed out.":
      "Todas as sessões ativas deste usuário serão encerradas.",
    "New password": "Nova senha",
    "Reset password": "Redefinir senha",

    "Loading users…": "Carregando usuários…",

    "failed to load users": "não foi possível carregar os usuários",
    "failed to create user": "não foi possível criar o usuário",
    "failed to assign role": "não foi possível atribuir a função",
    "failed to attach policy": "não foi possível anexar a política",
    "failed to update email": "não foi possível atualizar o e-mail",
    "failed to reset password": "não foi possível redefinir a senha",
    "failed to change status": "não foi possível alterar o status",
  },
  ru: {
    People: "Люди",
    Users: "Пользователи",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "Учётные записи операторов с доступом к этой админ-панели — назначайте роли и политики или отключайте доступ.",
    "New user": "Новый пользователь",

    Username: "Имя пользователя",
    "Email (optional)": "Email (необязательно)",
    Password: "Пароль",
    "Create user": "Создать пользователя",

    Email: "Email",
    "(none)": "(нет)",
    "Save email": "Сохранить email",
    "Assign role": "Назначить роль",
    "Select a role…": "Выберите роль…",
    "(built-in)": "(встроенная)",
    Assign: "Назначить",
    "Attach policy": "Прикрепить политику",
    "Select a policy…": "Выберите политику…",
    Attach: "Прикрепить",

    "Actions for user": "Действия для пользователя",
    none: "нет",

    "No users yet.": "Пользователей пока нет.",
    "Create your first operator account to get started.": "Создайте свою первую учётную запись оператора, чтобы начать.",
    Roles: "Роли",
    Policies: "Политики",

    "Disable this user?": "Отключить этого пользователя?",
    "They will not be able to sign in until re-enabled.": "Он не сможет войти в систему, пока учётная запись не будет снова включена.",
    Manage: "Управлять",

    "Reset password?": "Сбросить пароль?",
    "Set a new password for": "Установить новый пароль для",
    "Every active session for this user will be signed out.":
      "Все активные сеансы этого пользователя будут завершены.",
    "New password": "Новый пароль",
    "Reset password": "Сбросить пароль",

    "Loading users…": "Загрузка пользователей…",

    "failed to load users": "не удалось загрузить пользователей",
    "failed to create user": "не удалось создать пользователя",
    "failed to assign role": "не удалось назначить роль",
    "failed to attach policy": "не удалось прикрепить политику",
    "failed to update email": "не удалось обновить email",
    "failed to reset password": "не удалось сбросить пароль",
    "failed to change status": "не удалось изменить статус",
  },
  fa: {
    People: "افراد",
    Users: "کاربران",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "حساب‌های اپراتور با دسترسی به این پنل مدیریت — نقش و خط‌مشی تعیین کنید یا دسترسی را غیرفعال کنید.",
    "New user": "کاربر جدید",

    Username: "نام کاربری",
    "Email (optional)": "ایمیل (اختیاری)",
    Password: "رمز عبور",
    "Create user": "ایجاد کاربر",

    Email: "ایمیل",
    "(none)": "(هیچ‌کدام)",
    "Save email": "ذخیره ایمیل",
    "Assign role": "تعیین نقش",
    "Select a role…": "یک نقش انتخاب کنید…",
    "(built-in)": "(داخلی)",
    Assign: "تعیین",
    "Attach policy": "پیوست خط‌مشی",
    "Select a policy…": "یک خط‌مشی انتخاب کنید…",
    Attach: "پیوست",

    "Actions for user": "عملیات مربوط به کاربر",
    none: "هیچ‌کدام",

    "No users yet.": "هنوز کاربری وجود ندارد.",
    "Create your first operator account to get started.": "برای شروع، اولین حساب اپراتور خود را ایجاد کنید.",
    Roles: "نقش‌ها",
    Policies: "خط‌مشی‌ها",

    "Disable this user?": "این کاربر غیرفعال شود؟",
    "They will not be able to sign in until re-enabled.": "تا زمانی که دوباره فعال نشود، امکان ورود نخواهد داشت.",
    Manage: "مدیریت",

    "Reset password?": "رمز عبور بازنشانی شود؟",
    "Set a new password for": "تنظیم رمز عبور جدید برای",
    "Every active session for this user will be signed out.":
      "تمام نشست‌های فعال این کاربر خاتمه خواهد یافت.",
    "New password": "رمز عبور جدید",
    "Reset password": "بازنشانی رمز عبور",

    "Loading users…": "در حال بارگذاری کاربران…",

    "failed to load users": "بارگذاری کاربران ناموفق بود",
    "failed to create user": "ایجاد کاربر ناموفق بود",
    "failed to assign role": "تعیین نقش ناموفق بود",
    "failed to attach policy": "پیوست خط‌مشی ناموفق بود",
    "failed to update email": "به‌روزرسانی ایمیل ناموفق بود",
    "failed to reset password": "بازنشانی رمز عبور ناموفق بود",
    "failed to change status": "تغییر وضعیت ناموفق بود",
  },
  ar: {
    People: "الأشخاص",
    Users: "المستخدمون",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "حسابات المشغّلين التي لديها وصول إلى لوحة الإدارة هذه — عيّن أدوارًا وسياسات، أو عطّل الوصول.",
    "New user": "مستخدم جديد",

    Username: "اسم المستخدم",
    "Email (optional)": "البريد الإلكتروني (اختياري)",
    Password: "كلمة المرور",
    "Create user": "إنشاء مستخدم",

    Email: "البريد الإلكتروني",
    "(none)": "(بلا)",
    "Save email": "حفظ البريد الإلكتروني",
    "Assign role": "تعيين دور",
    "Select a role…": "اختر دورًا…",
    "(built-in)": "(مدمج)",
    Assign: "تعيين",
    "Attach policy": "إرفاق سياسة",
    "Select a policy…": "اختر سياسة…",
    Attach: "إرفاق",

    "Actions for user": "إجراءات المستخدم",
    none: "بلا",

    "No users yet.": "لا يوجد مستخدمون بعد.",
    "Create your first operator account to get started.": "أنشئ أول حساب مشغّل لك للبدء.",
    Roles: "الأدوار",
    Policies: "السياسات",

    "Disable this user?": "تعطيل هذا المستخدم؟",
    "They will not be able to sign in until re-enabled.": "لن يتمكن من تسجيل الدخول حتى تتم إعادة تفعيل الحساب.",
    Manage: "إدارة",

    "Reset password?": "إعادة تعيين كلمة المرور؟",
    "Set a new password for": "تعيين كلمة مرور جديدة لـ",
    "Every active session for this user will be signed out.":
      "سيتم تسجيل الخروج من كل جلسة نشطة لهذا المستخدم.",
    "New password": "كلمة مرور جديدة",
    "Reset password": "إعادة تعيين كلمة المرور",

    "Loading users…": "جارٍ تحميل المستخدمين…",

    "failed to load users": "تعذّر تحميل المستخدمين",
    "failed to create user": "تعذّر إنشاء المستخدم",
    "failed to assign role": "تعذّر تعيين الدور",
    "failed to attach policy": "تعذّر إرفاق السياسة",
    "failed to update email": "تعذّر تحديث البريد الإلكتروني",
    "failed to reset password": "تعذّر إعادة تعيين كلمة المرور",
    "failed to change status": "تعذّر تغيير الحالة",
  },
  ja: {
    People: "アカウント",
    Users: "ユーザー",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "この管理画面にアクセスできる運用担当者アカウントです。ロールやポリシーを割り当てたり、アクセスを無効にしたりできます。",
    "New user": "新規ユーザー",

    Username: "ユーザー名",
    "Email (optional)": "メールアドレス（任意）",
    Password: "パスワード",
    "Create user": "ユーザーを作成",

    Email: "メールアドレス",
    "(none)": "（なし）",
    "Save email": "メールアドレスを保存",
    "Assign role": "ロールを割り当て",
    "Select a role…": "ロールを選択…",
    "(built-in)": "（組み込み）",
    Assign: "割り当て",
    "Attach policy": "ポリシーを付与",
    "Select a policy…": "ポリシーを選択…",
    Attach: "付与",

    "Actions for user": "ユーザーの操作",
    none: "なし",

    "No users yet.": "まだユーザーがいません。",
    "Create your first operator account to get started.": "最初の運用担当者アカウントを作成して開始しましょう。",
    Roles: "ロール",
    Policies: "ポリシー",

    "Disable this user?": "このユーザーを無効にしますか？",
    "They will not be able to sign in until re-enabled.": "再度有効にするまでサインインできなくなります。",
    Manage: "管理",

    "Reset password?": "パスワードをリセットしますか？",
    "Set a new password for": "新しいパスワードの設定対象：",
    "Every active session for this user will be signed out.":
      "このユーザーのすべてのアクティブなセッションがサインアウトされます。",
    "New password": "新しいパスワード",
    "Reset password": "パスワードをリセット",

    "Loading users…": "ユーザーを読み込み中…",

    "failed to load users": "ユーザーの読み込みに失敗しました",
    "failed to create user": "ユーザーの作成に失敗しました",
    "failed to assign role": "ロールの割り当てに失敗しました",
    "failed to attach policy": "ポリシーの付与に失敗しました",
    "failed to update email": "メールアドレスの更新に失敗しました",
    "failed to reset password": "パスワードのリセットに失敗しました",
    "failed to change status": "ステータスの変更に失敗しました",
  },
  ko: {
    People: "계정",
    Users: "사용자",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "이 관리자 화면에 접근할 수 있는 운영자 계정입니다 — 역할과 정책을 할당하거나 접근을 비활성화하세요.",
    "New user": "새 사용자",

    Username: "사용자 이름",
    "Email (optional)": "이메일(선택 사항)",
    Password: "비밀번호",
    "Create user": "사용자 생성",

    Email: "이메일",
    "(none)": "(없음)",
    "Save email": "이메일 저장",
    "Assign role": "역할 할당",
    "Select a role…": "역할 선택…",
    "(built-in)": "(내장)",
    Assign: "할당",
    "Attach policy": "정책 연결",
    "Select a policy…": "정책 선택…",
    Attach: "연결",

    "Actions for user": "사용자 작업",
    none: "없음",

    "No users yet.": "아직 사용자가 없습니다.",
    "Create your first operator account to get started.": "시작하려면 첫 운영자 계정을 생성하세요.",
    Roles: "역할",
    Policies: "정책",

    "Disable this user?": "이 사용자를 비활성화하시겠습니까?",
    "They will not be able to sign in until re-enabled.": "다시 활성화될 때까지 로그인할 수 없습니다.",
    Manage: "관리",

    "Reset password?": "비밀번호를 재설정하시겠습니까?",
    "Set a new password for": "새 비밀번호 설정 대상:",
    "Every active session for this user will be signed out.":
      "이 사용자의 모든 활성 세션이 로그아웃됩니다.",
    "New password": "새 비밀번호",
    "Reset password": "비밀번호 재설정",

    "Loading users…": "사용자를 불러오는 중…",

    "failed to load users": "사용자를 불러오지 못했습니다",
    "failed to create user": "사용자를 생성하지 못했습니다",
    "failed to assign role": "역할을 할당하지 못했습니다",
    "failed to attach policy": "정책을 연결하지 못했습니다",
    "failed to update email": "이메일을 업데이트하지 못했습니다",
    "failed to reset password": "비밀번호를 재설정하지 못했습니다",
    "failed to change status": "상태를 변경하지 못했습니다",
  },
  pl: {
    People: "Osoby",
    Users: "Użytkownicy",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "Konta operatorów z dostępem do tego panelu administracyjnego — przypisuj role i zasady lub wyłączaj dostęp.",
    "New user": "Nowy użytkownik",

    Username: "Nazwa użytkownika",
    "Email (optional)": "E-mail (opcjonalnie)",
    Password: "Hasło",
    "Create user": "Utwórz użytkownika",

    Email: "E-mail",
    "(none)": "(brak)",
    "Save email": "Zapisz e-mail",
    "Assign role": "Przypisz rolę",
    "Select a role…": "Wybierz rolę…",
    "(built-in)": "(wbudowana)",
    Assign: "Przypisz",
    "Attach policy": "Dołącz zasadę",
    "Select a policy…": "Wybierz zasadę…",
    Attach: "Dołącz",

    "Actions for user": "Działania dla użytkownika",
    none: "brak",

    "No users yet.": "Nie ma jeszcze żadnych użytkowników.",
    "Create your first operator account to get started.": "Utwórz swoje pierwsze konto operatora, aby zacząć.",
    Roles: "Role",
    Policies: "Zasady",

    "Disable this user?": "Wyłączyć tego użytkownika?",
    "They will not be able to sign in until re-enabled.": "Nie będzie mógł się zalogować, dopóki konto nie zostanie ponownie włączone.",
    Manage: "Zarządzaj",

    "Reset password?": "Zresetować hasło?",
    "Set a new password for": "Ustaw nowe hasło dla",
    "Every active session for this user will be signed out.":
      "Wszystkie aktywne sesje tego użytkownika zostaną zakończone.",
    "New password": "Nowe hasło",
    "Reset password": "Zresetuj hasło",

    "Loading users…": "Wczytywanie użytkowników…",

    "failed to load users": "nie udało się wczytać użytkowników",
    "failed to create user": "nie udało się utworzyć użytkownika",
    "failed to assign role": "nie udało się przypisać roli",
    "failed to attach policy": "nie udało się dołączyć zasady",
    "failed to update email": "nie udało się zaktualizować adresu e-mail",
    "failed to reset password": "nie udało się zresetować hasła",
    "failed to change status": "nie udało się zmienić statusu",
  },
  hu: {
    People: "Személyek",
    Users: "Felhasználók",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "Az adminfelülethez hozzáféréssel rendelkező üzemeltetői fiókok — rendelj hozzájuk szerepkört és szabályzatot, vagy tiltsd le a hozzáférésüket.",
    "New user": "Új felhasználó",

    Username: "Felhasználónév",
    "Email (optional)": "E-mail (nem kötelező)",
    Password: "Jelszó",
    "Create user": "Felhasználó létrehozása",

    Email: "E-mail",
    "(none)": "(nincs)",
    "Save email": "E-mail mentése",
    "Assign role": "Szerepkör hozzárendelése",
    "Select a role…": "Válassz szerepkört…",
    "(built-in)": "(beépített)",
    Assign: "Hozzárendelés",
    "Attach policy": "Szabályzat csatolása",
    "Select a policy…": "Válassz szabályzatot…",
    Attach: "Csatolás",

    "Actions for user": "Műveletek a felhasználóval",
    none: "nincs",

    "No users yet.": "Még nincs felhasználó.",
    "Create your first operator account to get started.": "Hozd létre az első üzemeltetői fiókodat a kezdéshez.",
    Roles: "Szerepkörök",
    Policies: "Szabályzatok",

    "Disable this user?": "Letiltod ezt a felhasználót?",
    "They will not be able to sign in until re-enabled.": "Nem tud majd bejelentkezni, amíg újra nem engedélyezed.",
    Manage: "Kezelés",

    "Reset password?": "Visszaállítod a jelszót?",
    "Set a new password for": "Új jelszó beállítása ehhez:",
    "Every active session for this user will be signed out.":
      "A felhasználó minden aktív munkamenete kijelentkezik.",
    "New password": "Új jelszó",
    "Reset password": "Jelszó visszaállítása",

    "Loading users…": "Felhasználók betöltése…",

    "failed to load users": "a felhasználók betöltése sikertelen",
    "failed to create user": "a felhasználó létrehozása sikertelen",
    "failed to assign role": "a szerepkör hozzárendelése sikertelen",
    "failed to attach policy": "a szabályzat csatolása sikertelen",
    "failed to update email": "az e-mail cím frissítése sikertelen",
    "failed to reset password": "a jelszó visszaállítása sikertelen",
    "failed to change status": "az állapot módosítása sikertelen",
  },
  fr: {
    People: "Personnes",
    Users: "Utilisateurs",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "Comptes d'opérateurs ayant accès à cette administration — attribuez des rôles et des politiques, ou désactivez l'accès.",
    "New user": "Nouvel utilisateur",

    Username: "Nom d'utilisateur",
    "Email (optional)": "E-mail (facultatif)",
    Password: "Mot de passe",
    "Create user": "Créer un utilisateur",

    Email: "E-mail",
    "(none)": "(aucun)",
    "Save email": "Enregistrer l'e-mail",
    "Assign role": "Attribuer un rôle",
    "Select a role…": "Sélectionnez un rôle…",
    "(built-in)": "(intégré)",
    Assign: "Attribuer",
    "Attach policy": "Associer une politique",
    "Select a policy…": "Sélectionnez une politique…",
    Attach: "Associer",

    "Actions for user": "Actions pour l'utilisateur",
    none: "aucun",

    "No users yet.": "Aucun utilisateur pour le moment.",
    "Create your first operator account to get started.": "Créez votre premier compte d'opérateur pour commencer.",
    Roles: "Rôles",
    Policies: "Politiques",

    "Disable this user?": "Désactiver cet utilisateur ?",
    "They will not be able to sign in until re-enabled.": "Il ne pourra pas se connecter tant que le compte ne sera pas réactivé.",
    Manage: "Gérer",

    "Reset password?": "Réinitialiser le mot de passe ?",
    "Set a new password for": "Définir un nouveau mot de passe pour",
    "Every active session for this user will be signed out.":
      "Toutes les sessions actives de cet utilisateur seront déconnectées.",
    "New password": "Nouveau mot de passe",
    "Reset password": "Réinitialiser le mot de passe",

    "Loading users…": "Chargement des utilisateurs…",

    "failed to load users": "échec du chargement des utilisateurs",
    "failed to create user": "échec de la création de l'utilisateur",
    "failed to assign role": "échec de l'attribution du rôle",
    "failed to attach policy": "échec de l'association de la politique",
    "failed to update email": "échec de la mise à jour de l'e-mail",
    "failed to reset password": "échec de la réinitialisation du mot de passe",
    "failed to change status": "échec de la modification du statut",
  },
  uk: {
    People: "Люди",
    Users: "Користувачі",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "Облікові записи операторів із доступом до цієї панелі адміністрування — призначайте ролі й політики або вимикайте доступ.",
    "New user": "Новий користувач",

    Username: "Ім'я користувача",
    "Email (optional)": "Ел. пошта (необов'язково)",
    Password: "Пароль",
    "Create user": "Створити користувача",

    Email: "Ел. пошта",
    "(none)": "(немає)",
    "Save email": "Зберегти ел. пошту",
    "Assign role": "Призначити роль",
    "Select a role…": "Виберіть роль…",
    "(built-in)": "(вбудована)",
    Assign: "Призначити",
    "Attach policy": "Прикріпити політику",
    "Select a policy…": "Виберіть політику…",
    Attach: "Прикріпити",

    "Actions for user": "Дії для користувача",
    none: "немає",

    "No users yet.": "Користувачів поки немає.",
    "Create your first operator account to get started.": "Створіть свій перший обліковий запис оператора, щоб почати.",
    Roles: "Ролі",
    Policies: "Політики",

    "Disable this user?": "Вимкнути цього користувача?",
    "They will not be able to sign in until re-enabled.": "Він не зможе увійти, доки обліковий запис не буде знову увімкнено.",
    Manage: "Керувати",

    "Reset password?": "Скинути пароль?",
    "Set a new password for": "Встановити новий пароль для",
    "Every active session for this user will be signed out.":
      "Усі активні сеанси цього користувача буде завершено.",
    "New password": "Новий пароль",
    "Reset password": "Скинути пароль",

    "Loading users…": "Завантаження користувачів…",

    "failed to load users": "не вдалося завантажити користувачів",
    "failed to create user": "не вдалося створити користувача",
    "failed to assign role": "не вдалося призначити роль",
    "failed to attach policy": "не вдалося прикріпити політику",
    "failed to update email": "не вдалося оновити ел. пошту",
    "failed to reset password": "не вдалося скинути пароль",
    "failed to change status": "не вдалося змінити статус",
  },
  tr: {
    People: "Kişiler",
    Users: "Kullanıcılar",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "Bu yönetim paneline erişimi olan operatör hesapları — rol ve politika atayın veya erişimi devre dışı bırakın.",
    "New user": "Yeni kullanıcı",

    Username: "Kullanıcı adı",
    "Email (optional)": "E-posta (isteğe bağlı)",
    Password: "Parola",
    "Create user": "Kullanıcı oluştur",

    Email: "E-posta",
    "(none)": "(yok)",
    "Save email": "E-postayı kaydet",
    "Assign role": "Rol ata",
    "Select a role…": "Bir rol seçin…",
    "(built-in)": "(yerleşik)",
    Assign: "Ata",
    "Attach policy": "Politika ekle",
    "Select a policy…": "Bir politika seçin…",
    Attach: "Ekle",

    "Actions for user": "Kullanıcı için işlemler",
    none: "yok",

    "No users yet.": "Henüz kullanıcı yok.",
    "Create your first operator account to get started.": "Başlamak için ilk operatör hesabınızı oluşturun.",
    Roles: "Roller",
    Policies: "Politikalar",

    "Disable this user?": "Bu kullanıcı devre dışı bırakılsın mı?",
    "They will not be able to sign in until re-enabled.": "Yeniden etkinleştirilene kadar oturum açamayacak.",
    Manage: "Yönet",

    "Reset password?": "Parola sıfırlansın mı?",
    "Set a new password for": "Şunun için yeni bir parola belirle:",
    "Every active session for this user will be signed out.":
      "Bu kullanıcının tüm etkin oturumları kapatılacak.",
    "New password": "Yeni parola",
    "Reset password": "Parolayı sıfırla",

    "Loading users…": "Kullanıcılar yükleniyor…",

    "failed to load users": "kullanıcılar yüklenemedi",
    "failed to create user": "kullanıcı oluşturulamadı",
    "failed to assign role": "rol atanamadı",
    "failed to attach policy": "politika eklenemedi",
    "failed to update email": "e-posta güncellenemedi",
    "failed to reset password": "parola sıfırlanamadı",
    "failed to change status": "durum değiştirilemedi",
  },
  th: {
    People: "บุคคล",
    Users: "ผู้ใช้",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "บัญชีผู้ควบคุมที่มีสิทธิ์เข้าถึงแผงผู้ดูแลระบบนี้ — กำหนดบทบาทและนโยบาย หรือปิดใช้งานการเข้าถึง",
    "New user": "ผู้ใช้ใหม่",

    Username: "ชื่อผู้ใช้",
    "Email (optional)": "อีเมล (ไม่บังคับ)",
    Password: "รหัสผ่าน",
    "Create user": "สร้างผู้ใช้",

    Email: "อีเมล",
    "(none)": "(ไม่มี)",
    "Save email": "บันทึกอีเมล",
    "Assign role": "กำหนดบทบาท",
    "Select a role…": "เลือกบทบาท…",
    "(built-in)": "(ในตัว)",
    Assign: "กำหนด",
    "Attach policy": "แนบนโยบาย",
    "Select a policy…": "เลือกนโยบาย…",
    Attach: "แนบ",

    "Actions for user": "การดำเนินการสำหรับผู้ใช้",
    none: "ไม่มี",

    "No users yet.": "ยังไม่มีผู้ใช้",
    "Create your first operator account to get started.": "สร้างบัญชีผู้ควบคุมแรกของคุณเพื่อเริ่มต้นใช้งาน",
    Roles: "บทบาท",
    Policies: "นโยบาย",

    "Disable this user?": "ปิดใช้งานผู้ใช้รายนี้หรือไม่?",
    "They will not be able to sign in until re-enabled.": "จะไม่สามารถลงชื่อเข้าใช้ได้จนกว่าจะเปิดใช้งานอีกครั้ง",
    Manage: "จัดการ",

    "Reset password?": "รีเซ็ตรหัสผ่านหรือไม่?",
    "Set a new password for": "ตั้งรหัสผ่านใหม่สำหรับ",
    "Every active session for this user will be signed out.":
      "ทุกเซสชันที่ใช้งานอยู่ของผู้ใช้รายนี้จะถูกออกจากระบบ",
    "New password": "รหัสผ่านใหม่",
    "Reset password": "รีเซ็ตรหัสผ่าน",

    "Loading users…": "กำลังโหลดผู้ใช้…",

    "failed to load users": "โหลดผู้ใช้ไม่สำเร็จ",
    "failed to create user": "สร้างผู้ใช้ไม่สำเร็จ",
    "failed to assign role": "กำหนดบทบาทไม่สำเร็จ",
    "failed to attach policy": "แนบนโยบายไม่สำเร็จ",
    "failed to update email": "อัปเดตอีเมลไม่สำเร็จ",
    "failed to reset password": "รีเซ็ตรหัสผ่านไม่สำเร็จ",
    "failed to change status": "เปลี่ยนสถานะไม่สำเร็จ",
  },
  it: {
    People: "Persone",
    Users: "Utenti",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "Account operatore con accesso a questo pannello di amministrazione — assegna ruoli e criteri, oppure disabilita l'accesso.",
    "New user": "Nuovo utente",

    Username: "Nome utente",
    "Email (optional)": "Email (facoltativa)",
    Password: "Password",
    "Create user": "Crea utente",

    Email: "Email",
    "(none)": "(nessuna)",
    "Save email": "Salva email",
    "Assign role": "Assegna ruolo",
    "Select a role…": "Seleziona un ruolo…",
    "(built-in)": "(integrato)",
    Assign: "Assegna",
    "Attach policy": "Collega criterio",
    "Select a policy…": "Seleziona un criterio…",
    Attach: "Collega",

    "Actions for user": "Azioni per l'utente",
    none: "nessuna",

    "No users yet.": "Ancora nessun utente.",
    "Create your first operator account to get started.": "Crea il tuo primo account operatore per iniziare.",
    Roles: "Ruoli",
    Policies: "Criteri",

    "Disable this user?": "Disabilitare questo utente?",
    "They will not be able to sign in until re-enabled.": "Non potrà accedere finché l'account non verrà riattivato.",
    Manage: "Gestisci",

    "Reset password?": "Reimpostare la password?",
    "Set a new password for": "Imposta una nuova password per",
    "Every active session for this user will be signed out.":
      "Tutte le sessioni attive di questo utente verranno disconnesse.",
    "New password": "Nuova password",
    "Reset password": "Reimposta password",

    "Loading users…": "Caricamento utenti…",

    "failed to load users": "impossibile caricare gli utenti",
    "failed to create user": "impossibile creare l'utente",
    "failed to assign role": "impossibile assegnare il ruolo",
    "failed to attach policy": "impossibile collegare il criterio",
    "failed to update email": "impossibile aggiornare l'email",
    "failed to reset password": "impossibile reimpostare la password",
    "failed to change status": "impossibile modificare lo stato",
  },
  hi: {
    People: "लोग",
    Users: "उपयोगकर्ता",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "इस एडमिन तक पहुंच वाले ऑपरेटर खाते — रोल और पॉलिसी असाइन करें, या पहुंच अक्षम करें।",
    "New user": "नया उपयोगकर्ता",

    Username: "उपयोगकर्ता नाम",
    "Email (optional)": "ईमेल (वैकल्पिक)",
    Password: "पासवर्ड",
    "Create user": "उपयोगकर्ता बनाएं",

    Email: "ईमेल",
    "(none)": "(कोई नहीं)",
    "Save email": "ईमेल सहेजें",
    "Assign role": "रोल असाइन करें",
    "Select a role…": "एक रोल चुनें…",
    "(built-in)": "(बिल्ट-इन)",
    Assign: "असाइन करें",
    "Attach policy": "पॉलिसी जोड़ें",
    "Select a policy…": "एक पॉलिसी चुनें…",
    Attach: "जोड़ें",

    "Actions for user": "उपयोगकर्ता के लिए कार्रवाइयां",
    none: "कोई नहीं",

    "No users yet.": "अभी तक कोई उपयोगकर्ता नहीं है।",
    "Create your first operator account to get started.": "शुरू करने के लिए अपना पहला ऑपरेटर खाता बनाएं।",
    Roles: "रोल",
    Policies: "पॉलिसी",

    "Disable this user?": "इस उपयोगकर्ता को अक्षम करें?",
    "They will not be able to sign in until re-enabled.": "फिर से सक्षम होने तक वे साइन इन नहीं कर पाएंगे।",
    Manage: "प्रबंधित करें",

    "Reset password?": "पासवर्ड रीसेट करें?",
    "Set a new password for": "इसके लिए नया पासवर्ड सेट करें",
    "Every active session for this user will be signed out.":
      "इस उपयोगकर्ता का हर सक्रिय सत्र साइन आउट कर दिया जाएगा।",
    "New password": "नया पासवर्ड",
    "Reset password": "पासवर्ड रीसेट करें",

    "Loading users…": "उपयोगकर्ता लोड हो रहे हैं…",

    "failed to load users": "उपयोगकर्ता लोड नहीं हो सके",
    "failed to create user": "उपयोगकर्ता नहीं बन सका",
    "failed to assign role": "रोल असाइन नहीं हो सका",
    "failed to attach policy": "पॉलिसी नहीं जोड़ी जा सकी",
    "failed to update email": "ईमेल अपडेट नहीं हो सका",
    "failed to reset password": "पासवर्ड रीसेट नहीं हो सका",
    "failed to change status": "स्थिति नहीं बदली जा सकी",
  },
  ur: {
    People: "افراد",
    Users: "صارفین",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "اس ایڈمن تک رسائی رکھنے والے آپریٹر اکاؤنٹس — رولز اور پالیسیاں تفویض کریں، یا رسائی غیرفعال کریں۔",
    "New user": "نیا صارف",

    Username: "صارف نام",
    "Email (optional)": "ای میل (اختیاری)",
    Password: "پاس ورڈ",
    "Create user": "صارف بنائیں",

    Email: "ای میل",
    "(none)": "(کوئی نہیں)",
    "Save email": "ای میل محفوظ کریں",
    "Assign role": "رول تفویض کریں",
    "Select a role…": "ایک رول منتخب کریں…",
    "(built-in)": "(بلٹ اِن)",
    Assign: "تفویض کریں",
    "Attach policy": "پالیسی منسلک کریں",
    "Select a policy…": "ایک پالیسی منتخب کریں…",
    Attach: "منسلک کریں",

    "Actions for user": "صارف کے لیے کارروائیاں",
    none: "کوئی نہیں",

    "No users yet.": "ابھی تک کوئی صارف نہیں ہے۔",
    "Create your first operator account to get started.": "شروع کرنے کے لیے اپنا پہلا آپریٹر اکاؤنٹ بنائیں۔",
    Roles: "رولز",
    Policies: "پالیسیاں",

    "Disable this user?": "اس صارف کو غیرفعال کریں؟",
    "They will not be able to sign in until re-enabled.": "دوبارہ فعال ہونے تک وہ سائن ان نہیں کر سکیں گے۔",
    Manage: "منظم کریں",

    "Reset password?": "پاس ورڈ ری سیٹ کریں؟",
    "Set a new password for": "اس کے لیے نیا پاس ورڈ سیٹ کریں",
    "Every active session for this user will be signed out.":
      "اس صارف کا ہر فعال سیشن سائن آؤٹ کر دیا جائے گا۔",
    "New password": "نیا پاس ورڈ",
    "Reset password": "پاس ورڈ ری سیٹ کریں",

    "Loading users…": "صارفین لوڈ ہو رہے ہیں…",

    "failed to load users": "صارفین لوڈ نہ ہو سکے",
    "failed to create user": "صارف نہ بن سکا",
    "failed to assign role": "رول تفویض نہ ہو سکا",
    "failed to attach policy": "پالیسی منسلک نہ ہو سکی",
    "failed to update email": "ای میل اپ ڈیٹ نہ ہو سکی",
    "failed to reset password": "پاس ورڈ ری سیٹ نہ ہو سکا",
    "failed to change status": "حیثیت تبدیل نہ ہو سکی",
  },
  bn: {
    People: "ব্যক্তি",
    Users: "ব্যবহারকারী",
    "Operator accounts with access to this admin — assign roles and policies, or disable access.":
      "এই অ্যাডমিনে অ্যাক্সেস থাকা অপারেটর অ্যাকাউন্ট — রোল ও পলিসি নির্ধারণ করুন, অথবা অ্যাক্সেস নিষ্ক্রিয় করুন।",
    "New user": "নতুন ব্যবহারকারী",

    Username: "ইউজারনেম",
    "Email (optional)": "ইমেইল (ঐচ্ছিক)",
    Password: "পাসওয়ার্ড",
    "Create user": "ব্যবহারকারী তৈরি করুন",

    Email: "ইমেইল",
    "(none)": "(কোনোটি না)",
    "Save email": "ইমেইল সংরক্ষণ করুন",
    "Assign role": "রোল নির্ধারণ করুন",
    "Select a role…": "একটি রোল বেছে নিন…",
    "(built-in)": "(বিল্ট-ইন)",
    Assign: "নির্ধারণ করুন",
    "Attach policy": "পলিসি সংযুক্ত করুন",
    "Select a policy…": "একটি পলিসি বেছে নিন…",
    Attach: "সংযুক্ত করুন",

    "Actions for user": "ব্যবহারকারীর জন্য কার্যক্রম",
    none: "কোনোটি না",

    "No users yet.": "এখনো কোনো ব্যবহারকারী নেই।",
    "Create your first operator account to get started.": "শুরু করতে আপনার প্রথম অপারেটর অ্যাকাউন্ট তৈরি করুন।",
    Roles: "রোল",
    Policies: "পলিসি",

    "Disable this user?": "এই ব্যবহারকারীকে নিষ্ক্রিয় করবেন?",
    "They will not be able to sign in until re-enabled.": "পুনরায় সক্ষম না করা পর্যন্ত তিনি সাইন ইন করতে পারবেন না।",
    Manage: "পরিচালনা করুন",

    "Reset password?": "পাসওয়ার্ড রিসেট করবেন?",
    "Set a new password for": "এর জন্য নতুন পাসওয়ার্ড সেট করুন",
    "Every active session for this user will be signed out.":
      "এই ব্যবহারকারীর প্রতিটি সক্রিয় সেশন সাইন আউট করা হবে।",
    "New password": "নতুন পাসওয়ার্ড",
    "Reset password": "পাসওয়ার্ড রিসেট করুন",

    "Loading users…": "ব্যবহারকারী লোড হচ্ছে…",

    "failed to load users": "ব্যবহারকারী লোড করা যায়নি",
    "failed to create user": "ব্যবহারকারী তৈরি করা যায়নি",
    "failed to assign role": "রোল নির্ধারণ করা যায়নি",
    "failed to attach policy": "পলিসি সংযুক্ত করা যায়নি",
    "failed to update email": "ইমেইল আপডেট করা যায়নি",
    "failed to reset password": "পাসওয়ার্ড রিসেট করা যায়নি",
    "failed to change status": "অবস্থা পরিবর্তন করা যায়নি",
  },
};

export const t = createDictionaryTranslator(USERS_DICT);

const PASSWORD_RESET_NOTICE_TEMPLATE: Record<string, string> = {
  en: 'Password reset for "{username}" — every active session for this user was revoked.',
  es: 'Se restableció la contraseña de "{username}" — se revocó toda sesión activa de este usuario.',
  id: 'Kata sandi untuk "{username}" telah diatur ulang — semua sesi aktif pengguna ini telah dicabut.',
  de: 'Passwort für „{username}" wurde zurückgesetzt — alle aktiven Sitzungen dieses Benutzers wurden widerrufen.',
  "zh-CN": '已重置 "{username}" 的密码 — 该用户的所有活动会话均已被撤销。',
  "zh-TW": '已重設「{username}」的密碼 — 該使用者的所有現行工作階段均已被撤銷。',
  "pt-BR": 'Senha redefinida para "{username}" — todas as sessões ativas deste usuário foram revogadas.',
  ru: 'Пароль для «{username}» сброшен — все активные сеансы этого пользователя были аннулированы.',
  fa: 'رمز عبور «{username}» بازنشانی شد — تمام نشست‌های فعال این کاربر لغو شد.',
  ar: 'تمت إعادة تعيين كلمة المرور لـ "{username}" — تم إلغاء كل جلسة نشطة لهذا المستخدم.',
  ja: '「{username}」のパスワードをリセットしました — このユーザーのすべてのアクティブなセッションが無効になりました。',
  ko: '"{username}"의 비밀번호가 재설정되었습니다 — 이 사용자의 모든 활성 세션이 취소되었습니다.',
  pl: 'Zresetowano hasło dla „{username}" — wszystkie aktywne sesje tego użytkownika zostały unieważnione.',
  hu: 'A(z) „{username}" jelszava visszaállítva — a felhasználó minden aktív munkamenete visszavonásra került.',
  fr: 'Mot de passe réinitialisé pour « {username} » — toutes les sessions actives de cet utilisateur ont été révoquées.',
  uk: 'Пароль для «{username}» скинуто — усі активні сеанси цього користувача було анульовано.',
  tr: '"{username}" için parola sıfırlandı — bu kullanıcının tüm etkin oturumları iptal edildi.',
  th: 'รีเซ็ตรหัสผ่านสำหรับ "{username}" แล้ว — เซสชันที่ใช้งานอยู่ทั้งหมดของผู้ใช้รายนี้ถูกเพิกถอนแล้ว',
  it: 'Password reimpostata per "{username}" — tutte le sessioni attive di questo utente sono state revocate.',
  hi: '"{username}" के लिए पासवर्ड रीसेट कर दिया गया — इस उपयोगकर्ता का हर सक्रिय सत्र रद्द कर दिया गया।',
  ur: '"{username}" کے لیے پاس ورڈ ری سیٹ کر دیا گیا — اس صارف کا ہر فعال سیشن منسوخ کر دیا گیا۔',
  bn: '"{username}"-এর জন্য পাসওয়ার্ড রিসেট করা হয়েছে — এই ব্যবহারকারীর প্রতিটি সক্রিয় সেশন প্রত্যাহার করা হয়েছে।',
};

/** The reset-password success toast — embeds the user's own (untranslated) `username`
 *  mid-sentence, so it can't be a flat `ES` entry the way `roles-i18n.ts`'s
 *  `roleDeleteBodyParts` etc. handle the same shape. */
export function passwordResetNotice(locale: string, username: string): string {
  return interpolate(PASSWORD_RESET_NOTICE_TEMPLATE[locale] ?? PASSWORD_RESET_NOTICE_TEMPLATE.en, { username });
}
