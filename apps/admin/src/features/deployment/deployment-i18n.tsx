import { interpolate, localeEntry } from "../../lib/template-i18n";
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

/**
 * @file Translations for the Deployment panel (`/admin/deployment`) — five tabs (Overview, Static
 * Site, Full Site, Dockerfile, History). Same shape as `integrations-i18n.tsx`/`recovery-i18n.tsx`:
 * a flat `DICT[locale][englishKey] = translation` map, `t = createDictionaryTranslator(DICT)`, and
 * two `{error}`-carrying templates handled the same way `actionsForWebhookLabel` handles its own
 * (`interpolate` + a per-locale template map, not embedded in the flat dict).
 *
 * Every string here is chrome/explanatory copy, not data — the actual runtime values (paths, env
 * var names, provider names) are never translated, matching how `AdminExternalMcpServer.serverId`
 * or a webhook's own `label` are rendered verbatim elsewhere in this app.
 */

const DEPLOYMENT_TRANSLATIONS: Record<string, Record<string, string>> = {
  es: {
    Operations: "Operaciones",
    Deployment: "Despliegue",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "Elige cómo se publica este sitio y descubre qué implica alojarlo tú mismo.",
    Overview: "Resumen",
    "Static Site": "Sitio estático",
    "Full Site": "Sitio completo",
    Dockerfile: "Dockerfile",
    History: "Historial",
    "Loading deployment status…": "Cargando el estado del despliegue…",
    "How this instance is running": "Cómo se está ejecutando esta instancia",
    "Runtime mode": "Modo de ejecución",
    Production: "Producción",
    Local: "Local",
    "Production readiness gate": "Verificación de preparación para producción",
    Passed: "Superada",
    "Not applicable (local mode)": "No aplica (modo local)",
    "Owner password": "Contraseña del propietario",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "Sigue siendo la predeterminada — configura TOVU_ADMIN_PASSWORD.",
    "Changed from the default.": "Se cambió la predeterminada.",
    "Agent daemon": "Daemon del agente",
    "No known failure": "Sin fallos conocidos",
    "Known failure — check server logs.": "Fallo conocido — revisa los registros del servidor.",
    "Database file": "Archivo de base de datos",
    "Uploads folder": "Carpeta de subidas",
    "Environment variables": "Variables de entorno",
    Set: "Configurada",
    "Not set": "Sin configurar",
    "Set (generated key file)": "Configurada (archivo de clave generado)",
    "Invalid — the keyring rejects it": "No válida — el llavero la rechaza",
    "Falls back to a public default.": "Usa un valor predeterminado público si falta.",
    'Falls back to "admin".': 'Usa "admin" si falta.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Necesaria para iniciar en producción. Si falta en local, aparece como un 503 en la pantalla del Asistente de IA.",
    "Falls back to port 4319.": "Usa el puerto 4319 si falta.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Una copia rápida y de solo lectura de las páginas publicadas de este sitio — sin servidor detrás.",
    "Not built yet": "Aún no está implementado",
    "Build it from a terminal": "Constrúyelo desde una terminal",
    "Build static export": "Generar exportación estática",
    "What Full Site gives you": "Qué te ofrece el sitio completo",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "El servidor completo de Tovu — administración, asistente, pago, todo funciona.",
    Providers: "Proveedores",
    Planned: "Planeado",
    "Loading Dockerfile…": "Cargando el Dockerfile…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "Todavía no existe un Dockerfile en la raíz del repositorio. En cuanto se agregue uno, su contenido aparecerá aquí.",
    Copy: "Copiar",
    "Copied!": "¡Copiado!",
    Download: "Descargar",
    "Building is a terminal command (docker build …), not a button here.":
      "Construir la imagen es un comando de terminal (docker build …), no un botón aquí.",
    "Unsaved changes": "Cambios sin guardar",
    Saved: "Guardado",
    "Dockerfile contents": "Contenido del Dockerfile",
    "Saving here only replaces the file's contents — it does not build or deploy anything.":
      "Guardar aquí solo reemplaza el contenido del archivo — no construye ni despliega nada.",
    "No Dockerfile exists yet. Write one below, then save to create it.":
      "Todavía no existe un Dockerfile. Escribe uno a continuación y luego guarda para crearlo.",
    "No deploys yet": "Aún no hay despliegues",
    "Not wired up yet": "Aún no conectado",
    "What you keep": "Lo que conservas",
    "What it needs": "Lo que necesita",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "Un alojamiento que pueda ejecutar un contenedor y conservar un disco — la pestaña Dockerfile contiene la imagen desde la que se ejecuta.",
    "View the Dockerfile": "Ver el Dockerfile",
    "None connectable yet": "Aún no se puede conectar ninguno",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "Aún no hay campos de credenciales — esta instancia no tiene backend para almacenarlas, así que no se puede conectar nada desde esta pantalla.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "No se ha desplegado nada desde esta pantalla — y todavía no puede hacerse. Cuando se conecte un alojamiento, aquí aparecerán todas las compilaciones y despliegues con su resultado.",
    "See how to publish today": "Consulta cómo publicar hoy",
    "What a static export gives you": "Lo que te ofrece una exportación estática",
    "Available from a terminal": "Disponible desde una terminal",
    "What survives the export": "Qué se conserva en la exportación",
    "Where it runs": "Dónde se ejecuta",
    "The output is a plain folder of files — any static host will serve it.": "La salida es una carpeta sencilla de archivos — cualquier alojamiento estático puede servirla.",
  },
  id: {
    Operations: "Operasi",
    Deployment: "Penerapan",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "Pilih bagaimana situs ini dipublikasikan, dan lihat apa yang terlibat dalam hosting mandiri.",
    Overview: "Ringkasan",
    "Static Site": "Situs Statis",
    "Full Site": "Situs Lengkap",
    Dockerfile: "Dockerfile",
    History: "Riwayat",
    "Loading deployment status…": "Memuat status deployment…",
    "How this instance is running": "Bagaimana instans ini berjalan",
    "Runtime mode": "Mode runtime",
    Production: "Produksi",
    Local: "Lokal",
    "Production readiness gate": "Gerbang kesiapan produksi",
    Passed: "Lolos",
    "Not applicable (local mode)": "Tidak berlaku (mode lokal)",
    "Owner password": "Kata sandi pemilik",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "Masih default — atur TOVU_ADMIN_PASSWORD.",
    "Changed from the default.": "Sudah diubah dari default.",
    "Agent daemon": "Daemon agen",
    "No known failure": "Tidak ada kegagalan yang diketahui",
    "Known failure — check server logs.": "Kegagalan diketahui — periksa log server.",
    "Database file": "Berkas basis data",
    "Uploads folder": "Folder unggahan",
    "Environment variables": "Variabel lingkungan",
    Set: "Diatur",
    "Not set": "Belum diatur",
    "Set (generated key file)": "Diatur (file kunci yang dibuat)",
    "Invalid — the keyring rejects it": "Tidak valid — keyring menolaknya",
    "Falls back to a public default.": "Kembali ke default publik jika kosong.",
    'Falls back to "admin".': 'Kembali ke "admin" jika kosong.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Wajib untuk boot di produksi. Jika hilang secara lokal, muncul sebagai 503 di layar Asisten AI.",
    "Falls back to port 4319.": "Kembali ke port 4319 jika kosong.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Salinan cepat dan hanya-baca dari halaman situs yang dipublikasikan — tanpa server di baliknya.",
    "Not built yet": "Belum dibangun",
    "Build it from a terminal": "Bangun dari terminal",
    "Build static export": "Bangun ekspor statis",
    "What Full Site gives you": "Apa yang diberikan Situs Lengkap",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Server Tovu yang lengkap — admin, asisten, checkout, semuanya berfungsi.",
    Providers: "Penyedia",
    Planned: "Direncanakan",
    "Loading Dockerfile…": "Memuat Dockerfile…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "Belum ada Dockerfile di akar repositori. Setelah ditambahkan, isinya akan muncul di sini.",
    Copy: "Salin",
    "Copied!": "Tersalin!",
    Download: "Unduh",
    "Building is a terminal command (docker build …), not a button here.":
      "Membangun image adalah perintah terminal (docker build …), bukan tombol di sini.",
    "Unsaved changes": "Perubahan belum disimpan",
    Saved: "Tersimpan",
    "Dockerfile contents": "Isi Dockerfile",
    "Saving here only replaces the file's contents — it does not build or deploy anything.":
      "Menyimpan di sini hanya mengganti isi berkas — tidak membangun atau men-deploy apa pun.",
    "No Dockerfile exists yet. Write one below, then save to create it.":
      "Belum ada Dockerfile. Tulis satu di bawah ini, lalu simpan untuk membuatnya.",
    "No deploys yet": "Belum ada deployment",
    "Not wired up yet": "Belum terhubung",
    "What you keep": "Yang tetap Anda miliki",
    "What it needs": "Yang dibutuhkannya",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "Host yang dapat menjalankan kontainer dan menyimpan disk — tab Dockerfile berisi image yang dijalankan.",
    "View the Dockerfile": "Lihat Dockerfile",
    "None connectable yet": "Belum ada yang dapat dihubungkan",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "Belum ada kolom kredensial — instans ini tidak memiliki backend untuk menyimpannya, jadi tidak ada yang dapat dihubungkan dari layar ini.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "Belum ada yang di-deploy dari layar ini — dan belum bisa. Setelah host terhubung, setiap build dan deploy akan tercantum di sini beserta hasilnya.",
    "See how to publish today": "Lihat cara menerbitkan hari ini",
    "What a static export gives you": "Yang diberikan ekspor statis",
    "Available from a terminal": "Tersedia dari terminal",
    "What survives the export": "Yang tetap ada setelah ekspor",
    "Where it runs": "Tempat berjalan",
    "The output is a plain folder of files — any static host will serve it.": "Hasilnya adalah folder berisi file biasa — host statis apa pun dapat menyajikannya.",
  },
  de: {
    Operations: "Betrieb",
    Deployment: "Bereitstellung",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "Wähle, wie diese Website veröffentlicht wird, und sieh, was Self-Hosting bedeutet.",
    Overview: "Übersicht",
    "Static Site": "Statische Seite",
    "Full Site": "Vollständige Seite",
    Dockerfile: "Dockerfile",
    History: "Verlauf",
    "Loading deployment status…": "Bereitstellungsstatus wird geladen…",
    "How this instance is running": "Wie diese Instanz läuft",
    "Runtime mode": "Laufzeitmodus",
    Production: "Produktion",
    Local: "Lokal",
    "Production readiness gate": "Produktionsbereitschafts-Prüfung",
    Passed: "Bestanden",
    "Not applicable (local mode)": "Nicht zutreffend (lokaler Modus)",
    "Owner password": "Besitzer-Passwort",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "Noch der Standard — TOVU_ADMIN_PASSWORD setzen.",
    "Changed from the default.": "Vom Standard geändert.",
    "Agent daemon": "Agent-Daemon",
    "No known failure": "Kein bekannter Fehler",
    "Known failure — check server logs.": "Bekannter Fehler — Server-Logs prüfen.",
    "Database file": "Datenbankdatei",
    "Uploads folder": "Upload-Ordner",
    "Environment variables": "Umgebungsvariablen",
    Set: "Gesetzt",
    "Not set": "Nicht gesetzt",
    "Set (generated key file)": "Gesetzt (generierte Schlüsseldatei)",
    "Invalid — the keyring rejects it": "Ungültig — der Schlüsselbund lehnt sie ab",
    "Falls back to a public default.": "Fällt auf einen öffentlichen Standard zurück.",
    'Falls back to "admin".': 'Fällt auf „admin“ zurück.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Für den Start in Produktion erforderlich. Fehlt sie lokal, erscheint stattdessen ein 503 auf dem Bildschirm des KI-Assistenten.",
    "Falls back to port 4319.": "Fällt auf Port 4319 zurück.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Eine schnelle, schreibgeschützte Kopie der veröffentlichten Seiten dieser Website — kein Server dahinter.",
    "Not built yet": "Noch nicht gebaut",
    "Build it from a terminal": "Über ein Terminal erstellen",
    "Build static export": "Statischen Export erstellen",
    "What Full Site gives you": "Was Vollständige Seite bietet",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Der vollständige Tovu-Server — Admin, Assistent, Checkout, alles funktioniert.",
    Providers: "Anbieter",
    Planned: "Geplant",
    "Loading Dockerfile…": "Dockerfile wird geladen…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "Im Repo-Root existiert noch kein Dockerfile. Sobald eines hinzugefügt wird, erscheint sein Inhalt hier.",
    Copy: "Kopieren",
    "Copied!": "Kopiert!",
    Download: "Herunterladen",
    "Building is a terminal command (docker build …), not a button here.":
      "Das Bauen ist ein Terminal-Befehl (docker build …), keine Schaltfläche hier.",
    "Unsaved changes": "Nicht gespeicherte Änderungen",
    Saved: "Gespeichert",
    "Dockerfile contents": "Dockerfile-Inhalt",
    "Saving here only replaces the file's contents — it does not build or deploy anything.":
      "Speichern hier ersetzt nur den Dateiinhalt — es baut oder deployt nichts.",
    "No Dockerfile exists yet. Write one below, then save to create it.":
      "Es existiert noch kein Dockerfile. Schreibe eines unten und speichere es, um es zu erstellen.",
    "No deploys yet": "Noch keine Deployments",
    "Not wired up yet": "Noch nicht verbunden",
    "What you keep": "Was Sie behalten",
    "What it needs": "Was es benötigt",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "Ein Host, der einen Container ausführen und einen Datenträger behalten kann — der Dockerfile-Tab enthält das Image, aus dem dies läuft.",
    "View the Dockerfile": "Dockerfile anzeigen",
    "None connectable yet": "Noch keines verbindbar",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "Noch keine Anmeldedatenfelder — diese Instanz hat kein Backend zum Speichern, daher kann von diesem Bildschirm nichts verbunden werden.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "Von diesem Bildschirm wurde noch nichts bereitgestellt — und es ist noch nicht möglich. Sobald ein Host verbunden ist, werden hier alle Builds und Bereitstellungen mit ihrem Ergebnis aufgeführt.",
    "See how to publish today": "So veröffentlichen Sie heute",
    "What a static export gives you": "Was ein statischer Export bietet",
    "Available from a terminal": "Über ein Terminal verfügbar",
    "What survives the export": "Was den Export übersteht",
    "Where it runs": "Wo es läuft",
    "The output is a plain folder of files — any static host will serve it.": "Die Ausgabe ist ein einfacher Ordner mit Dateien — jeder statische Host kann ihn bereitstellen.",
  },
  "zh-CN": {
    Operations: "运维",
    Deployment: "部署",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "选择此网站的发布方式,并了解自托管涉及的内容。",
    Overview: "概览",
    "Static Site": "静态站点",
    "Full Site": "完整站点",
    Dockerfile: "Dockerfile",
    History: "历史记录",
    "Loading deployment status…": "正在加载部署状态…",
    "How this instance is running": "此实例的运行方式",
    "Runtime mode": "运行模式",
    Production: "生产环境",
    Local: "本地",
    "Production readiness gate": "生产就绪检查",
    Passed: "已通过",
    "Not applicable (local mode)": "不适用(本地模式)",
    "Owner password": "所有者密码",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "仍是默认值 — 请设置 TOVU_ADMIN_PASSWORD。",
    "Changed from the default.": "已更改默认值。",
    "Agent daemon": "代理守护进程",
    "No known failure": "未发现已知故障",
    "Known failure — check server logs.": "存在已知故障 — 请查看服务器日志。",
    "Database file": "数据库文件",
    "Uploads folder": "上传文件夹",
    "Environment variables": "环境变量",
    Set: "已设置",
    "Not set": "未设置",
    "Set (generated key file)": "已设置（生成的密钥文件）",
    "Invalid — the keyring rejects it": "无效 — 密钥环拒绝了它",
    "Falls back to a public default.": "未设置时使用公开的默认值。",
    'Falls back to "admin".': '未设置时使用 "admin"。',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "生产环境下启动必需。本地缺失时,会改为在 AI 助手页面显示为 503。",
    "Falls back to port 4319.": "未设置时使用端口 4319。",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "此站点已发布页面的快速只读副本 — 背后没有服务器。",
    "Not built yet": "尚未构建",
    "Build it from a terminal": "从终端构建",
    "Build static export": "生成静态导出",
    "What Full Site gives you": "完整站点能带来什么",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "完整的 Tovu 服务器 — 后台、助手、结账,一切都能正常工作。",
    Providers: "服务商",
    Planned: "计划中",
    "Loading Dockerfile…": "正在加载 Dockerfile…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "仓库根目录下还没有 Dockerfile。添加后,其内容将显示在此处。",
    Copy: "复制",
    "Copied!": "已复制!",
    Download: "下载",
    "Building is a terminal command (docker build …), not a button here.":
      "构建镜像是一条终端命令(docker build …),而不是此处的按钮。",
    "No deploys yet": "尚无部署记录",
    "Not wired up yet": "尚未连接",
    "What you keep": "保留的内容",
    "What it needs": "所需条件",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "能够运行容器并保留磁盘的托管环境——Dockerfile 标签页包含其运行所用的镜像。",
    "View the Dockerfile": "查看 Dockerfile",
    "None connectable yet": "暂时没有可连接的项",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "尚无凭据字段——此实例没有用于存储凭据的后端，因此无法从此屏幕连接任何内容。",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "尚未从此屏幕部署任何内容——目前也还不能部署。连接托管环境后，每次构建和部署都会连同结果列在这里。",
    "See how to publish today": "了解当前发布方式",
    "What a static export gives you": "静态导出提供的内容",
    "Available from a terminal": "可从终端使用",
    "What survives the export": "导出后保留的内容",
    "Where it runs": "运行位置",
    "The output is a plain folder of files — any static host will serve it.": "输出是一个普通文件夹——任何静态托管服务都可以提供它。",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "未保存的更改",
    "Saved": "已保存",
    "Dockerfile contents": "Dockerfile 内容",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "在此保存只会替换该文件的内容——不会构建或部署任何内容。",
    "No Dockerfile exists yet. Write one below, then save to create it.": "还没有 Dockerfile。请在下方编写一个，然后保存以创建它。",
  },
  "zh-TW": {
    Operations: "維運",
    Deployment: "部署",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "選擇此網站的發佈方式,並瞭解自行架設所涉及的內容。",
    Overview: "總覽",
    "Static Site": "靜態網站",
    "Full Site": "完整網站",
    Dockerfile: "Dockerfile",
    History: "歷史紀錄",
    "Loading deployment status…": "正在載入部署狀態…",
    "How this instance is running": "此執行個體的運作方式",
    "Runtime mode": "執行模式",
    Production: "正式環境",
    Local: "本機",
    "Production readiness gate": "正式環境就緒檢查",
    Passed: "已通過",
    "Not applicable (local mode)": "不適用(本機模式)",
    "Owner password": "擁有者密碼",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "仍為預設值 — 請設定 TOVU_ADMIN_PASSWORD。",
    "Changed from the default.": "已變更預設值。",
    "Agent daemon": "代理程式常駐服務",
    "No known failure": "未發現已知故障",
    "Known failure — check server logs.": "有已知故障 — 請查看伺服器記錄。",
    "Database file": "資料庫檔案",
    "Uploads folder": "上傳資料夾",
    "Environment variables": "環境變數",
    Set: "已設定",
    "Not set": "未設定",
    "Set (generated key file)": "已設定（產生的金鑰檔案）",
    "Invalid — the keyring rejects it": "無效 — 金鑰環拒絕了它",
    "Falls back to a public default.": "未設定時會使用公開的預設值。",
    'Falls back to "admin".': '未設定時會使用「admin」。',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "正式環境啟動時為必要項目。本機缺少時,會改為在 AI 助理畫面顯示為 503。",
    "Falls back to port 4319.": "未設定時會使用連接埠 4319。",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "此網站已發佈頁面的快速唯讀副本 — 背後沒有伺服器。",
    "Not built yet": "尚未建置",
    "Build it from a terminal": "從終端機建置",
    "Build static export": "建立靜態匯出",
    "What Full Site gives you": "完整網站能帶來什麼",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "完整的 Tovu 伺服器 — 管理後台、助理、結帳,一切都能運作。",
    Providers: "服務商",
    Planned: "規劃中",
    "Loading Dockerfile…": "正在載入 Dockerfile…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "存放庫根目錄下尚無 Dockerfile。新增後,其內容將顯示於此。",
    Copy: "複製",
    "Copied!": "已複製!",
    Download: "下載",
    "Building is a terminal command (docker build …), not a button here.":
      "建置映像檔是終端機指令(docker build …),而非此處的按鈕。",
    "No deploys yet": "尚無部署紀錄",
    "Not wired up yet": "尚未連線",
    "What you keep": "保留的內容",
    "What it needs": "所需條件",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "可執行容器並保留磁碟的主機——Dockerfile 分頁包含其執行所用的映像。",
    "View the Dockerfile": "檢視 Dockerfile",
    "None connectable yet": "目前沒有可連線的項目",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "尚無憑證欄位——此執行個體沒有可儲存憑證的後端，因此無法從此畫面連線任何項目。",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "尚未從此畫面部署任何內容——目前也還不能部署。連接主機後，每次建置與部署都會連同結果列在這裡。",
    "See how to publish today": "查看今天如何發佈",
    "What a static export gives you": "靜態匯出提供的內容",
    "Available from a terminal": "可從終端機使用",
    "What survives the export": "匯出後保留的內容",
    "Where it runs": "執行位置",
    "The output is a plain folder of files — any static host will serve it.": "輸出是一個普通檔案資料夾——任何靜態主機都能提供它。",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "未儲存的變更",
    "Saved": "已儲存",
    "Dockerfile contents": "Dockerfile 內容",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "在此儲存只會取代該檔案的內容——不會建置或部署任何東西。",
    "No Dockerfile exists yet. Write one below, then save to create it.": "尚無 Dockerfile。請在下方撰寫一個，然後儲存以建立它。",
  },
  "pt-BR": {
    Operations: "Operações",
    Deployment: "Implantação",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "Escolha como este site é publicado e veja o que a hospedagem própria envolve.",
    Overview: "Visão geral",
    "Static Site": "Site estático",
    "Full Site": "Site completo",
    Dockerfile: "Dockerfile",
    History: "Histórico",
    "Loading deployment status…": "Carregando o status da implantação…",
    "How this instance is running": "Como esta instância está sendo executada",
    "Runtime mode": "Modo de execução",
    Production: "Produção",
    Local: "Local",
    "Production readiness gate": "Verificação de prontidão para produção",
    Passed: "Aprovada",
    "Not applicable (local mode)": "Não aplicável (modo local)",
    "Owner password": "Senha do proprietário",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "Ainda é a padrão — defina TOVU_ADMIN_PASSWORD.",
    "Changed from the default.": "Alterada em relação à padrão.",
    "Agent daemon": "Daemon do agente",
    "No known failure": "Nenhuma falha conhecida",
    "Known failure — check server logs.": "Falha conhecida — verifique os logs do servidor.",
    "Database file": "Arquivo do banco de dados",
    "Uploads folder": "Pasta de uploads",
    "Environment variables": "Variáveis de ambiente",
    Set: "Definida",
    "Not set": "Não definida",
    "Set (generated key file)": "Definida (arquivo de chave gerado)",
    "Invalid — the keyring rejects it": "Inválida — o chaveiro a rejeita",
    "Falls back to a public default.": "Usa um padrão público quando ausente.",
    'Falls back to "admin".': 'Usa "admin" quando ausente.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Necessária para iniciar em produção. Se ausente localmente, aparece como 503 na tela do Assistente de IA.",
    "Falls back to port 4319.": "Usa a porta 4319 quando ausente.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Uma cópia rápida e somente leitura das páginas publicadas deste site — sem servidor por trás.",
    "Not built yet": "Ainda não implementado",
    "Build it from a terminal": "Gere pelo terminal",
    "Build static export": "Gerar exportação estática",
    "What Full Site gives you": "O que o Site completo oferece",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "O servidor completo do Tovu — admin, assistente, checkout, tudo funciona.",
    Providers: "Provedores",
    Planned: "Planejado",
    "Loading Dockerfile…": "Carregando o Dockerfile…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "Ainda não existe um Dockerfile na raiz do repositório. Assim que um for adicionado, seu conteúdo aparecerá aqui.",
    Copy: "Copiar",
    "Copied!": "Copiado!",
    Download: "Baixar",
    "Building is a terminal command (docker build …), not a button here.":
      "Construir a imagem é um comando de terminal (docker build …), não um botão aqui.",
    "Unsaved changes": "Alterações não salvas",
    Saved: "Salvo",
    "Dockerfile contents": "Conteúdo do Dockerfile",
    "Saving here only replaces the file's contents — it does not build or deploy anything.":
      "Salvar aqui apenas substitui o conteúdo do arquivo — não constrói nem implanta nada.",
    "No Dockerfile exists yet. Write one below, then save to create it.":
      "Ainda não existe um Dockerfile. Escreva um abaixo e depois salve para criá-lo.",
    "No deploys yet": "Ainda não há implantações",
    "Not wired up yet": "Ainda não conectado",
    "What you keep": "O que você mantém",
    "What it needs": "Do que precisa",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "Uma hospedagem que possa executar um contêiner e manter um disco — a aba Dockerfile tem a imagem usada para isso.",
    "View the Dockerfile": "Ver o Dockerfile",
    "None connectable yet": "Nenhum conectável ainda",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "Ainda não há campos de credenciais — esta instância não tem backend para armazená-las, então nada pode ser conectado por esta tela.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "Nada foi implantado por esta tela — e ainda não pode ser. Quando uma hospedagem for conectada, cada build e implantação será listado aqui com seu resultado.",
    "See how to publish today": "Veja como publicar hoje",
    "What a static export gives you": "O que uma exportação estática oferece",
    "Available from a terminal": "Disponível em um terminal",
    "What survives the export": "O que permanece após a exportação",
    "Where it runs": "Onde é executado",
    "The output is a plain folder of files — any static host will serve it.": "A saída é uma pasta simples de arquivos — qualquer hospedagem estática pode servi-la.",
  },
  ru: {
    Operations: "Эксплуатация",
    Deployment: "Развёртывание",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "Выберите, как публикуется этот сайт, и узнайте, что нужно для самостоятельного хостинга.",
    Overview: "Обзор",
    "Static Site": "Статичный сайт",
    "Full Site": "Полноценный сайт",
    Dockerfile: "Dockerfile",
    History: "История",
    "Loading deployment status…": "Загрузка статуса развёртывания…",
    "How this instance is running": "Как работает этот экземпляр",
    "Runtime mode": "Режим выполнения",
    Production: "Продакшен",
    Local: "Локальный",
    "Production readiness gate": "Проверка готовности к продакшену",
    Passed: "Пройдена",
    "Not applicable (local mode)": "Неприменимо (локальный режим)",
    "Owner password": "Пароль владельца",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "Всё ещё стандартный — задайте TOVU_ADMIN_PASSWORD.",
    "Changed from the default.": "Изменён относительно стандартного.",
    "Agent daemon": "Демон агента",
    "No known failure": "Известных сбоев нет",
    "Known failure — check server logs.": "Известный сбой — проверьте журналы сервера.",
    "Database file": "Файл базы данных",
    "Uploads folder": "Папка загрузок",
    "Environment variables": "Переменные окружения",
    Set: "Задана",
    "Not set": "Не задана",
    "Set (generated key file)": "Задана (сгенерированный файл ключа)",
    "Invalid — the keyring rejects it": "Недействительна — хранилище ключей её отклоняет",
    "Falls back to a public default.": "При отсутствии используется публичное значение по умолчанию.",
    'Falls back to "admin".': 'При отсутствии используется «admin».',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Обязательна для запуска в продакшене. Если отсутствует локально, вместо этого на экране ИИ-ассистента появится ошибка 503.",
    "Falls back to port 4319.": "При отсутствии используется порт 4319.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Быстрая копия опубликованных страниц сайта только для чтения — без сервера позади неё.",
    "Not built yet": "Пока не реализовано",
    "Build it from a terminal": "Соберите через терминал",
    "Build static export": "Собрать статический экспорт",
    "What Full Site gives you": "Что даёт Полноценный сайт",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Полноценный сервер Tovu — админка, ассистент, оформление заказа, всё работает.",
    Providers: "Провайдеры",
    Planned: "Запланировано",
    "Loading Dockerfile…": "Загрузка Dockerfile…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "В корне репозитория пока нет Dockerfile. Как только он появится, его содержимое будет показано здесь.",
    Copy: "Копировать",
    "Copied!": "Скопировано!",
    Download: "Скачать",
    "Building is a terminal command (docker build …), not a button here.":
      "Сборка образа — это команда терминала (docker build …), а не кнопка здесь.",
    "No deploys yet": "Развёртываний пока нет",
    "Not wired up yet": "Ещё не подключено",
    "What you keep": "Что сохраняется",
    "What it needs": "Что требуется",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "Хостинг, который может запускать контейнер и сохранять диск — на вкладке Dockerfile есть образ, из которого это запускается.",
    "View the Dockerfile": "Открыть Dockerfile",
    "None connectable yet": "Пока ничего нельзя подключить",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "Полей для учётных данных пока нет — у этого экземпляра нет бэкенда для их хранения, поэтому с этого экрана ничего подключить нельзя.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "С этого экрана ещё ничего не развёрнуто — и пока это невозможно. После подключения хостинга здесь будут показаны каждая сборка и развёртывание с результатом.",
    "See how to publish today": "Как опубликовать сегодня",
    "What a static export gives you": "Что даёт статический экспорт",
    "Available from a terminal": "Доступно из терминала",
    "What survives the export": "Что сохраняется при экспорте",
    "Where it runs": "Где это работает",
    "The output is a plain folder of files — any static host will serve it.": "Результат — обычная папка с файлами; её может обслуживать любой статический хостинг.",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "Несохранённые изменения",
    "Saved": "Сохранено",
    "Dockerfile contents": "Содержимое Dockerfile",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "Сохранение здесь только заменяет содержимое файла — ничего не собирается и не развёртывается.",
    "No Dockerfile exists yet. Write one below, then save to create it.": "Dockerfile пока нет. Напишите его ниже и сохраните, чтобы создать.",
  },
  fa: {
    Operations: "عملیات",
    Deployment: "استقرار",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "انتخاب کنید این سایت چگونه منتشر شود و ببینید میزبانی شخصی چه چیزی را دربر می‌گیرد.",
    Overview: "نمای کلی",
    "Static Site": "سایت ایستا",
    "Full Site": "سایت کامل",
    Dockerfile: "Dockerfile",
    History: "تاریخچه",
    "Loading deployment status…": "در حال بارگذاری وضعیت استقرار…",
    "How this instance is running": "این نمونه چگونه در حال اجراست",
    "Runtime mode": "حالت اجرا",
    Production: "تولید",
    Local: "محلی",
    "Production readiness gate": "بررسی آمادگی برای محیط تولید",
    Passed: "موفق",
    "Not applicable (local mode)": "غیرقابل اعمال (حالت محلی)",
    "Owner password": "رمز عبور مالک",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "هنوز مقدار پیش‌فرض است — TOVU_ADMIN_PASSWORD را تنظیم کنید.",
    "Changed from the default.": "از حالت پیش‌فرض تغییر کرده است.",
    "Agent daemon": "دیمن عامل",
    "No known failure": "خطای شناخته‌شده‌ای وجود ندارد",
    "Known failure — check server logs.": "خطای شناخته‌شده — گزارش‌های سرور را بررسی کنید.",
    "Database file": "فایل پایگاه داده",
    "Uploads folder": "پوشه آپلودها",
    "Environment variables": "متغیرهای محیطی",
    Set: "تنظیم‌شده",
    "Not set": "تنظیم‌نشده",
    "Set (generated key file)": "تنظیم‌شده (فایل کلید تولیدشده)",
    "Invalid — the keyring rejects it": "نامعتبر — کلیددان آن را رد می‌کند",
    "Falls back to a public default.": "در صورت نبود، از مقدار پیش‌فرض عمومی استفاده می‌شود.",
    'Falls back to "admin".': 'در صورت نبود، از «admin» استفاده می‌شود.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "برای راه‌اندازی در محیط تولید لازم است. در صورت نبود در محیط محلی، به‌جای آن روی صفحه دستیار هوش مصنوعی خطای 503 نمایش داده می‌شود.",
    "Falls back to port 4319.": "در صورت نبود، از پورت 4319 استفاده می‌شود.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "یک نسخه سریع و فقط‌خواندنی از صفحات منتشرشده این سایت — بدون سروری در پشت آن.",
    "Not built yet": "هنوز ساخته نشده",
    "Build it from a terminal": "از ترمینال بسازید",
    "Build static export": "ساخت خروجی ایستا",
    "What Full Site gives you": "سایت کامل چه چیزی به شما می‌دهد",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "سرور کامل Tovu — پنل مدیریت، دستیار، تسویه‌حساب، همه‌چیز کار می‌کند.",
    Providers: "ارائه‌دهندگان",
    Planned: "برنامه‌ریزی‌شده",
    "Loading Dockerfile…": "در حال بارگذاری Dockerfile…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "هنوز Dockerfile‌ای در ریشه مخزن وجود ندارد. به‌محض افزوده شدن، محتوای آن اینجا نمایش داده می‌شود.",
    Copy: "کپی",
    "Copied!": "کپی شد!",
    Download: "دانلود",
    "Building is a terminal command (docker build …), not a button here.":
      "ساخت ایمیج یک دستور ترمینال است (docker build …)، نه دکمه‌ای در اینجا.",
    "No deploys yet": "هنوز استقراری انجام نشده",
    "Not wired up yet": "هنوز متصل نشده",
    "What you keep": "آنچه حفظ می‌کنید",
    "What it needs": "آنچه نیاز دارد",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "یک میزبان که بتواند کانتینر را اجرا و دیسک را نگه دارد — زبانه Dockerfile تصویر مورد استفاده را دارد.",
    "View the Dockerfile": "مشاهده Dockerfile",
    "None connectable yet": "هنوز هیچ‌کدام قابل اتصال نیست",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "هنوز فیلدی برای اعتبارنامه وجود ندارد — این نمونه بک‌اندی برای ذخیره آن‌ها ندارد، بنابراین هیچ‌چیز از این صفحه قابل اتصال نیست.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "هنوز چیزی از این صفحه مستقر نشده — و فعلاً هم نمی‌تواند شود. پس از اتصال میزبان، همه ساخت‌ها و استقرارها با نتیجه‌شان اینجا فهرست می‌شوند.",
    "See how to publish today": "نحوه انتشار امروز را ببینید",
    "What a static export gives you": "خروجی ایستا چه چیزی به شما می‌دهد",
    "Available from a terminal": "از ترمینال در دسترس است",
    "What survives the export": "آنچه پس از خروجی باقی می‌ماند",
    "Where it runs": "محل اجرا",
    "The output is a plain folder of files — any static host will serve it.": "خروجی یک پوشه ساده از فایل‌ها است — هر میزبان ایستا می‌تواند آن را ارائه کند.",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "تغییرات ذخیره‌نشده",
    "Saved": "ذخیره شد",
    "Dockerfile contents": "محتوای Dockerfile",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "ذخیره در اینجا فقط محتوای فایل را جایگزین می‌کند — چیزی را بیلد یا مستقر نمی‌کند.",
    "No Dockerfile exists yet. Write one below, then save to create it.": "هنوز Dockerfile‌ای وجود ندارد. یکی را در پایین بنویسید و سپس برای ایجاد آن ذخیره کنید.",
  },
  ar: {
    Operations: "العمليات",
    Deployment: "النشر",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "اختر كيفية نشر هذا الموقع، واطّلع على ما تتطلبه الاستضافة الذاتية.",
    Overview: "نظرة عامة",
    "Static Site": "موقع ثابت",
    "Full Site": "موقع كامل",
    Dockerfile: "Dockerfile",
    History: "السجل",
    "Loading deployment status…": "جارٍ تحميل حالة النشر…",
    "How this instance is running": "كيف تعمل هذه النسخة",
    "Runtime mode": "وضع التشغيل",
    Production: "الإنتاج",
    Local: "محلي",
    "Production readiness gate": "بوابة جاهزية الإنتاج",
    Passed: "ناجحة",
    "Not applicable (local mode)": "غير قابل للتطبيق (الوضع المحلي)",
    "Owner password": "كلمة مرور المالك",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "ما زالت الافتراضية — اضبط TOVU_ADMIN_PASSWORD.",
    "Changed from the default.": "تم تغييرها عن الافتراضية.",
    "Agent daemon": "خدمة الوكيل الخلفية",
    "No known failure": "لا يوجد عطل معروف",
    "Known failure — check server logs.": "عطل معروف — راجع سجلات الخادم.",
    "Database file": "ملف قاعدة البيانات",
    "Uploads folder": "مجلد الملفات المرفوعة",
    "Environment variables": "متغيرات البيئة",
    Set: "مضبوطة",
    "Not set": "غير مضبوطة",
    "Set (generated key file)": "مضبوطة (ملف مفتاح مُنشأ)",
    "Invalid — the keyring rejects it": "غير صالحة — حلقة المفاتيح ترفضها",
    "Falls back to a public default.": "تستخدم قيمة افتراضية عامة عند غيابها.",
    'Falls back to "admin".': 'تستخدم "admin" عند غيابها.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "مطلوبة للإقلاع في بيئة الإنتاج. إذا كانت غائبة محليًا، يظهر بدلاً من ذلك خطأ 503 في شاشة مساعد الذكاء الاصطناعي.",
    "Falls back to port 4319.": "تستخدم المنفذ 4319 عند غيابها.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "نسخة سريعة للقراءة فقط من صفحات هذا الموقع المنشورة — بلا خادم خلفها.",
    "Not built yet": "لم يُبنَ بعد",
    "Build it from a terminal": "أنشئه من الطرفية",
    "Build static export": "إنشاء تصدير ثابت",
    "What Full Site gives you": "ما الذي يمنحك إياه الموقع الكامل",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "خادم Tovu الكامل — لوحة التحكم، المساعد، الدفع، كل شيء يعمل.",
    Providers: "مزوّدو الخدمة",
    Planned: "مخطَّط له",
    "Loading Dockerfile…": "جارٍ تحميل Dockerfile…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "لا يوجد Dockerfile في جذر المستودع بعد. بمجرد إضافته، سيظهر محتواه هنا.",
    Copy: "نسخ",
    "Copied!": "تم النسخ!",
    Download: "تنزيل",
    "Building is a terminal command (docker build …), not a button here.":
      "بناء الصورة هو أمر طرفية (docker build …)، وليس زرًا هنا.",
    "No deploys yet": "لا عمليات نشر بعد",
    "Not wired up yet": "لم يتم التوصيل بعد",
    "What you keep": "ما تحتفظ به",
    "What it needs": "ما يحتاجه",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "استضافة يمكنها تشغيل حاوية والاحتفاظ بقرص — تحتوي علامة تبويب Dockerfile على الصورة التي يعمل منها.",
    "View the Dockerfile": "عرض Dockerfile",
    "None connectable yet": "لا يوجد ما يمكن توصيله بعد",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "لا توجد حقول بيانات اعتماد بعد — ليس لدى هذه النسخة خلفية لتخزينها، لذا لا يمكن توصيل أي شيء من هذه الشاشة.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "لم يتم نشر أي شيء من هذه الشاشة — ولا يمكن ذلك بعد. عند توصيل استضافة، ستُدرج هنا كل عملية بناء ونشر مع نتيجتها.",
    "See how to publish today": "اطلع على كيفية النشر اليوم",
    "What a static export gives you": "ما الذي يقدمه التصدير الثابت",
    "Available from a terminal": "متاح من الطرفية",
    "What survives the export": "ما يبقى بعد التصدير",
    "Where it runs": "مكان التشغيل",
    "The output is a plain folder of files — any static host will serve it.": "المخرجات مجلد عادي من الملفات — يمكن لأي استضافة ثابتة تقديمه.",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "تغييرات غير محفوظة",
    "Saved": "تم الحفظ",
    "Dockerfile contents": "محتوى Dockerfile",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "الحفظ هنا يستبدل محتوى الملف فقط — ولا يبني أو ينشر أي شيء.",
    "No Dockerfile exists yet. Write one below, then save to create it.": "لا يوجد Dockerfile بعد. اكتب واحدًا أدناه، ثم احفظه لإنشائه.",
  },
  ja: {
    Operations: "運用",
    Deployment: "デプロイ",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "このサイトの公開方法を選び、セルフホスティングに何が必要かを確認します。",
    Overview: "概要",
    "Static Site": "静的サイト",
    "Full Site": "フルサイト",
    Dockerfile: "Dockerfile",
    History: "履歴",
    "Loading deployment status…": "デプロイ状況を読み込み中…",
    "How this instance is running": "このインスタンスの稼働状況",
    "Runtime mode": "実行モード",
    Production: "本番環境",
    Local: "ローカル",
    "Production readiness gate": "本番準備状況チェック",
    Passed: "合格",
    "Not applicable (local mode)": "該当なし(ローカルモード)",
    "Owner password": "オーナーパスワード",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "まだデフォルトのままです — TOVU_ADMIN_PASSWORD を設定してください。",
    "Changed from the default.": "デフォルトから変更済みです。",
    "Agent daemon": "エージェントデーモン",
    "No known failure": "既知の障害はありません",
    "Known failure — check server logs.": "既知の障害があります — サーバーのログを確認してください。",
    "Database file": "データベースファイル",
    "Uploads folder": "アップロードフォルダ",
    "Environment variables": "環境変数",
    Set: "設定済み",
    "Not set": "未設定",
    "Set (generated key file)": "設定済み（生成されたキーファイル）",
    "Invalid — the keyring rejects it": "無効 — キーリングが拒否しています",
    "Falls back to a public default.": "未設定の場合、公開されているデフォルト値が使われます。",
    'Falls back to "admin".': '未設定の場合、"admin" が使われます。',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "本番環境での起動に必要です。ローカルで未設定の場合、代わりにAIアシスタント画面で503として表示されます。",
    "Falls back to port 4319.": "未設定の場合、ポート4319が使われます。",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "このサイトの公開済みページの高速な読み取り専用コピー — 背後にサーバーはありません。",
    "Not built yet": "まだ構築されていません",
    "Build it from a terminal": "ターミナルからビルドする",
    "Build static export": "静的エクスポートをビルド",
    "What Full Site gives you": "フルサイトで得られるもの",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "完全なTovuサーバー — 管理画面、アシスタント、決済、すべてが動作します。",
    Providers: "プロバイダー",
    Planned: "予定",
    "Loading Dockerfile…": "Dockerfileを読み込み中…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "リポジトリのルートにはまだDockerfileがありません。追加されると、その内容がここに表示されます。",
    Copy: "コピー",
    "Copied!": "コピーしました!",
    Download: "ダウンロード",
    "Building is a terminal command (docker build …), not a button here.":
      "イメージのビルドはターミナルコマンド(docker build …)であり、ここにあるボタンではありません。",
    "No deploys yet": "デプロイはまだありません",
    "Not wired up yet": "まだ接続されていません",
    "What you keep": "維持されるもの",
    "What it needs": "必要なもの",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "コンテナを実行しディスクを保持できるホストが必要です。Dockerfile タブにはこれが実行元とするイメージがあります。",
    "View the Dockerfile": "Dockerfile を表示",
    "None connectable yet": "まだ接続できるものはありません",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "認証情報の欄はまだありません。このインスタンスには保存用バックエンドがないため、この画面からは何も接続できません。",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "この画面からはまだ何もデプロイされておらず、まだ実行もできません。ホストを接続すると、すべてのビルドとデプロイが結果とともにここに表示されます。",
    "See how to publish today": "今日公開する方法を見る",
    "What a static export gives you": "静的エクスポートで得られるもの",
    "Available from a terminal": "ターミナルから利用可能",
    "What survives the export": "エクスポート後に残るもの",
    "Where it runs": "実行場所",
    "The output is a plain folder of files — any static host will serve it.": "出力は通常のファイルフォルダーです。どの静的ホストでも配信できます。",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "未保存の変更",
    "Saved": "保存済み",
    "Dockerfile contents": "Dockerfileの内容",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "ここで保存してもファイルの内容が置き換わるだけで、ビルドやデプロイは行われません。",
    "No Dockerfile exists yet. Write one below, then save to create it.": "Dockerfileはまだありません。下に記述してから保存すると作成されます。",
  },
  ko: {
    Operations: "운영",
    Deployment: "배포",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "이 사이트를 게시하는 방법을 선택하고, 직접 호스팅에 무엇이 필요한지 확인하세요.",
    Overview: "개요",
    "Static Site": "정적 사이트",
    "Full Site": "전체 사이트",
    Dockerfile: "Dockerfile",
    History: "기록",
    "Loading deployment status…": "배포 상태를 불러오는 중…",
    "How this instance is running": "이 인스턴스가 실행되는 방식",
    "Runtime mode": "실행 모드",
    Production: "프로덕션",
    Local: "로컬",
    "Production readiness gate": "프로덕션 준비 상태 검사",
    Passed: "통과",
    "Not applicable (local mode)": "해당 없음(로컬 모드)",
    "Owner password": "소유자 비밀번호",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "아직 기본값입니다 — TOVU_ADMIN_PASSWORD를 설정하세요.",
    "Changed from the default.": "기본값에서 변경됨.",
    "Agent daemon": "에이전트 데몬",
    "No known failure": "알려진 오류 없음",
    "Known failure — check server logs.": "알려진 오류 — 서버 로그를 확인하세요.",
    "Database file": "데이터베이스 파일",
    "Uploads folder": "업로드 폴더",
    "Environment variables": "환경 변수",
    Set: "설정됨",
    "Not set": "설정되지 않음",
    "Set (generated key file)": "설정됨(생성된 키 파일)",
    "Invalid — the keyring rejects it": "유효하지 않음 — 키링이 거부합니다",
    "Falls back to a public default.": "설정하지 않으면 공개 기본값을 사용합니다.",
    'Falls back to "admin".': '설정하지 않으면 "admin"을 사용합니다.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "프로덕션에서 부팅하려면 필요합니다. 로컬에서 없으면 대신 AI 어시스턴트 화면에 503으로 표시됩니다.",
    "Falls back to port 4319.": "설정하지 않으면 포트 4319를 사용합니다.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "이 사이트의 게시된 페이지를 빠르게 읽기 전용으로 복사한 것 — 그 뒤에 서버는 없습니다.",
    "Not built yet": "아직 구현되지 않음",
    "Build it from a terminal": "터미널에서 빌드하기",
    "Build static export": "정적 내보내기 빌드",
    "What Full Site gives you": "전체 사이트가 제공하는 것",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "완전한 Tovu 서버 — 관리자, 어시스턴트, 결제까지 모든 것이 작동합니다.",
    Providers: "제공업체",
    Planned: "예정됨",
    "Loading Dockerfile…": "Dockerfile을 불러오는 중…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "저장소 루트에 아직 Dockerfile이 없습니다. 추가되면 이곳에 내용이 표시됩니다.",
    Copy: "복사",
    "Copied!": "복사됨!",
    Download: "다운로드",
    "Building is a terminal command (docker build …), not a button here.":
      "이미지 빌드는 터미널 명령(docker build …)이며, 이곳의 버튼이 아닙니다.",
    "No deploys yet": "아직 배포 없음",
    "Not wired up yet": "아직 연결되지 않음",
    "What you keep": "유지되는 항목",
    "What it needs": "필요한 항목",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "컨테이너를 실행하고 디스크를 유지할 수 있는 호스트가 필요합니다. Dockerfile 탭에 이 항목이 실행하는 이미지가 있습니다.",
    "View the Dockerfile": "Dockerfile 보기",
    "None connectable yet": "아직 연결할 수 있는 항목 없음",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "아직 자격 증명 필드가 없습니다. 이 인스턴스에는 이를 저장할 백엔드가 없으므로 이 화면에서는 아무것도 연결할 수 없습니다.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "이 화면에서 아직 배포된 항목이 없고 현재는 배포할 수도 없습니다. 호스트가 연결되면 모든 빌드와 배포가 결과와 함께 여기에 표시됩니다.",
    "See how to publish today": "오늘 게시하는 방법 보기",
    "What a static export gives you": "정적 내보내기가 제공하는 것",
    "Available from a terminal": "터미널에서 사용 가능",
    "What survives the export": "내보낸 뒤에도 유지되는 항목",
    "Where it runs": "실행 위치",
    "The output is a plain folder of files — any static host will serve it.": "출력은 일반 파일 폴더이며 어떤 정적 호스트에서도 제공할 수 있습니다.",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "저장되지 않은 변경 사항",
    "Saved": "저장됨",
    "Dockerfile contents": "Dockerfile 내용",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "여기에서 저장하면 파일 내용만 바뀌며, 빌드나 배포는 하지 않습니다.",
    "No Dockerfile exists yet. Write one below, then save to create it.": "아직 Dockerfile이 없습니다. 아래에 작성한 다음 저장하여 만드세요.",
  },
  pl: {
    Operations: "Operacje",
    Deployment: "Wdrożenie",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "Wybierz, jak ta witryna jest publikowana, i sprawdź, co wiąże się z samodzielnym hostingiem.",
    Overview: "Przegląd",
    "Static Site": "Witryna statyczna",
    "Full Site": "Pełna witryna",
    Dockerfile: "Dockerfile",
    History: "Historia",
    "Loading deployment status…": "Wczytywanie stanu wdrożenia…",
    "How this instance is running": "Jak działa ta instancja",
    "Runtime mode": "Tryb działania",
    Production: "Produkcja",
    Local: "Lokalny",
    "Production readiness gate": "Kontrola gotowości do produkcji",
    Passed: "Zaliczona",
    "Not applicable (local mode)": "Nie dotyczy (tryb lokalny)",
    "Owner password": "Hasło właściciela",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "Nadal domyślne — ustaw TOVU_ADMIN_PASSWORD.",
    "Changed from the default.": "Zmienione względem domyślnego.",
    "Agent daemon": "Demon agenta",
    "No known failure": "Brak znanych awarii",
    "Known failure — check server logs.": "Znana awaria — sprawdź logi serwera.",
    "Database file": "Plik bazy danych",
    "Uploads folder": "Folder przesłanych plików",
    "Environment variables": "Zmienne środowiskowe",
    Set: "Ustawiona",
    "Not set": "Nieustawiona",
    "Set (generated key file)": "Ustawiona (wygenerowany plik klucza)",
    "Invalid — the keyring rejects it": "Nieprawidłowa — pęk kluczy ją odrzuca",
    "Falls back to a public default.": "Bez ustawienia używana jest publiczna wartość domyślna.",
    'Falls back to "admin".': 'Bez ustawienia używane jest „admin”.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Wymagana do uruchomienia w środowisku produkcyjnym. Jeśli brakuje jej lokalnie, zamiast tego na ekranie Asystenta AI pojawia się błąd 503.",
    "Falls back to port 4319.": "Bez ustawienia używany jest port 4319.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Szybka, tylko do odczytu kopia opublikowanych stron tej witryny — bez serwera z tyłu.",
    "Not built yet": "Jeszcze nie zbudowane",
    "Build it from a terminal": "Zbuduj z terminala",
    "Build static export": "Zbuduj eksport statyczny",
    "What Full Site gives you": "Co daje Pełna witryna",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Pełny serwer Tovu — panel administracyjny, asystent, płatności, wszystko działa.",
    Providers: "Dostawcy",
    Planned: "Planowane",
    "Loading Dockerfile…": "Wczytywanie Dockerfile…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "W katalogu głównym repozytorium nie ma jeszcze Dockerfile. Gdy zostanie dodany, jego zawartość pojawi się tutaj.",
    Copy: "Kopiuj",
    "Copied!": "Skopiowano!",
    Download: "Pobierz",
    "Building is a terminal command (docker build …), not a button here.":
      "Budowanie obrazu to polecenie terminala (docker build …), a nie przycisk tutaj.",
    "No deploys yet": "Jeszcze brak wdrożeń",
    "Not wired up yet": "Jeszcze nie podłączono",
    "What you keep": "Co zachowujesz",
    "What it needs": "Czego potrzebuje",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "Hosting, który może uruchomić kontener i zachować dysk — karta Dockerfile zawiera obraz, z którego to działa.",
    "View the Dockerfile": "Wyświetl Dockerfile",
    "None connectable yet": "Na razie nic nie można podłączyć",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "Nie ma jeszcze pól poświadczeń — ta instancja nie ma backendu do ich przechowywania, więc z tego ekranu nie można nic podłączyć.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "Z tego ekranu nic jeszcze nie wdrożono — i na razie nie jest to możliwe. Po podłączeniu hostingu każda kompilacja i wdrożenie będą tu wymienione z wynikiem.",
    "See how to publish today": "Zobacz, jak opublikować dziś",
    "What a static export gives you": "Co daje eksport statyczny",
    "Available from a terminal": "Dostępne z terminala",
    "What survives the export": "Co pozostaje po eksporcie",
    "Where it runs": "Gdzie działa",
    "The output is a plain folder of files — any static host will serve it.": "Wynik to zwykły folder plików — każdy hosting statyczny może go obsłużyć.",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "Niezapisane zmiany",
    "Saved": "Zapisano",
    "Dockerfile contents": "Zawartość Dockerfile",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "Zapisanie tutaj tylko zastępuje zawartość pliku — niczego nie buduje ani nie wdraża.",
    "No Dockerfile exists yet. Write one below, then save to create it.": "Dockerfile jeszcze nie istnieje. Napisz go poniżej, a następnie zapisz, aby go utworzyć.",
  },
  hu: {
    Operations: "Üzemeltetés",
    Deployment: "Telepítés",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "Válaszd ki, hogyan jelenjen meg ez a weboldal, és nézd meg, mit jelent az önálló üzemeltetés.",
    Overview: "Áttekintés",
    "Static Site": "Statikus oldal",
    "Full Site": "Teljes oldal",
    Dockerfile: "Dockerfile",
    History: "Előzmények",
    "Loading deployment status…": "Telepítési állapot betöltése…",
    "How this instance is running": "Hogyan fut ez a példány",
    "Runtime mode": "Futási mód",
    Production: "Éles",
    Local: "Helyi",
    "Production readiness gate": "Éles környezetre való felkészültség ellenőrzése",
    Passed: "Sikeres",
    "Not applicable (local mode)": "Nem alkalmazható (helyi mód)",
    "Owner password": "Tulajdonosi jelszó",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "Még mindig az alapértelmezett — állítsd be a TOVU_ADMIN_PASSWORD-öt.",
    "Changed from the default.": "Megváltoztatva az alapértelmezetthez képest.",
    "Agent daemon": "Ügynök démon",
    "No known failure": "Nincs ismert hiba",
    "Known failure — check server logs.": "Ismert hiba — ellenőrizd a szerver naplóit.",
    "Database file": "Adatbázisfájl",
    "Uploads folder": "Feltöltési mappa",
    "Environment variables": "Környezeti változók",
    Set: "Beállítva",
    "Not set": "Nincs beállítva",
    "Set (generated key file)": "Beállítva (generált kulcsfájl)",
    "Invalid — the keyring rejects it": "Érvénytelen — a kulcstartó elutasítja",
    "Falls back to a public default.": "Hiányában nyilvános alapértelmezett értéket használ.",
    'Falls back to "admin".': 'Hiányában az "admin" értéket használja.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Az éles indításhoz szükséges. Ha helyileg hiányzik, helyette az AI asszisztens képernyőjén 503-as hiba jelenik meg.",
    "Falls back to port 4319.": "Hiányában a 4319-es portot használja.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Az oldal publikált lapjainak gyors, csak olvasható másolata — szerver nélkül a háttérben.",
    "Not built yet": "Még nincs kiépítve",
    "Build it from a terminal": "Építsd meg terminálból",
    "Build static export": "Statikus export létrehozása",
    "What Full Site gives you": "Mit ad a Teljes oldal",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "A teljes Tovu szerver — admin, asszisztens, fizetés, minden működik.",
    Providers: "Szolgáltatók",
    Planned: "Tervezett",
    "Loading Dockerfile…": "Dockerfile betöltése…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "A repó gyökerében még nincs Dockerfile. Amint hozzáadják, a tartalma itt fog megjelenni.",
    Copy: "Másolás",
    "Copied!": "Másolva!",
    Download: "Letöltés",
    "Building is a terminal command (docker build …), not a button here.":
      "A build egy terminálparancs (docker build …), nem egy gomb itt.",
    "No deploys yet": "Még nincs telepítés",
    "Not wired up yet": "Még nincs csatlakoztatva",
    "What you keep": "Amit megtart",
    "What it needs": "Amire szüksége van",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "Olyan hoszt, amely képes konténert futtatni és megőrizni egy lemezt — a Dockerfile lapon található az ehhez használt lemezkép.",
    "View the Dockerfile": "Dockerfile megtekintése",
    "None connectable yet": "Még semmi sem csatlakoztatható",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "Még nincsenek hitelesítőadat-mezők — ennek a példánynak nincs háttérszolgáltatása a tárolásukhoz, ezért erről a képernyőről semmi sem csatlakoztatható.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "Erről a képernyőről még semmit sem telepítettek — és ez még nem is lehetséges. A hoszt csatlakoztatása után minden build és telepítés itt jelenik meg az eredményével.",
    "See how to publish today": "Nézze meg, hogyan tehet közzé ma",
    "What a static export gives you": "Mit nyújt a statikus export",
    "Available from a terminal": "Terminálból elérhető",
    "What survives the export": "Mi marad meg az exportban",
    "Where it runs": "Hol fut",
    "The output is a plain folder of files — any static host will serve it.": "A kimenet egy egyszerű fájlmappa — bármely statikus tárhely kiszolgálhatja.",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "Nem mentett módosítások",
    "Saved": "Mentve",
    "Dockerfile contents": "A Dockerfile tartalma",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "Az itteni mentés csak a fájl tartalmát cseréli le — semmit sem épít és nem telepít.",
    "No Dockerfile exists yet. Write one below, then save to create it.": "Még nincs Dockerfile. Írj egyet alább, majd mentsd a létrehozásához.",
  },
  fr: {
    Operations: "Opérations",
    Deployment: "Déploiement",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "Choisissez comment ce site est publié, et découvrez ce qu'implique l'auto-hébergement.",
    Overview: "Vue d'ensemble",
    "Static Site": "Site statique",
    "Full Site": "Site complet",
    Dockerfile: "Dockerfile",
    History: "Historique",
    "Loading deployment status…": "Chargement de l'état du déploiement…",
    "How this instance is running": "Comment fonctionne cette instance",
    "Runtime mode": "Mode d'exécution",
    Production: "Production",
    Local: "Local",
    "Production readiness gate": "Contrôle de préparation à la production",
    Passed: "Réussi",
    "Not applicable (local mode)": "Non applicable (mode local)",
    "Owner password": "Mot de passe du propriétaire",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "Toujours celui par défaut — définissez TOVU_ADMIN_PASSWORD.",
    "Changed from the default.": "Modifié par rapport à la valeur par défaut.",
    "Agent daemon": "Démon de l'agent",
    "No known failure": "Aucune panne connue",
    "Known failure — check server logs.": "Panne connue — consultez les journaux du serveur.",
    "Database file": "Fichier de base de données",
    "Uploads folder": "Dossier des envois",
    "Environment variables": "Variables d'environnement",
    Set: "Définie",
    "Not set": "Non définie",
    "Set (generated key file)": "Définie (fichier de clé généré)",
    "Invalid — the keyring rejects it": "Invalide — le trousseau la rejette",
    "Falls back to a public default.": "Utilise une valeur par défaut publique si absente.",
    'Falls back to "admin".': 'Utilise « admin » si absente.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Requise pour démarrer en production. Si elle est absente en local, une erreur 503 apparaît à la place sur l'écran de l'assistant IA.",
    "Falls back to port 4319.": "Utilise le port 4319 si absente.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Une copie rapide et en lecture seule des pages publiées de ce site — sans serveur derrière.",
    "Not built yet": "Pas encore développé",
    "Build it from a terminal": "Générez-le depuis un terminal",
    "Build static export": "Générer l'export statique",
    "What Full Site gives you": "Ce que vous offre le Site complet",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Le serveur Tovu complet — administration, assistant, paiement, tout fonctionne.",
    Providers: "Fournisseurs",
    Planned: "Prévu",
    "Loading Dockerfile…": "Chargement du Dockerfile…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "Aucun Dockerfile n'existe encore à la racine du dépôt. Une fois ajouté, son contenu apparaîtra ici.",
    Copy: "Copier",
    "Copied!": "Copié !",
    Download: "Télécharger",
    "Building is a terminal command (docker build …), not a button here.":
      "La construction de l'image est une commande de terminal (docker build …), pas un bouton ici.",
    "Unsaved changes": "Modifications non enregistrées",
    Saved: "Enregistré",
    "Dockerfile contents": "Contenu du Dockerfile",
    "Saving here only replaces the file's contents — it does not build or deploy anything.":
      "Enregistrer ici remplace seulement le contenu du fichier — cela ne construit ni ne déploie rien.",
    "No Dockerfile exists yet. Write one below, then save to create it.":
      "Aucun Dockerfile n'existe encore. Écrivez-en un ci-dessous, puis enregistrez pour le créer.",
    "No deploys yet": "Aucun déploiement pour le moment",
    "Not wired up yet": "Pas encore connecté",
    "What you keep": "Ce que vous conservez",
    "What it needs": "Ce dont il a besoin",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "Un hébergement capable d'exécuter un conteneur et de conserver un disque — l'onglet Dockerfile contient l'image utilisée.",
    "View the Dockerfile": "Voir le Dockerfile",
    "None connectable yet": "Aucun élément connectable pour le moment",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "Aucun champ d'identifiants pour le moment — cette instance n'a pas de backend pour les stocker, donc rien ne peut être connecté depuis cet écran.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "Rien n'a été déployé depuis cet écran — et ce n'est pas encore possible. Une fois un hébergement connecté, chaque build et déploiement sera listé ici avec son résultat.",
    "See how to publish today": "Découvrez comment publier aujourd'hui",
    "What a static export gives you": "Ce qu'offre une exportation statique",
    "Available from a terminal": "Disponible depuis un terminal",
    "What survives the export": "Ce qui reste après l'exportation",
    "Where it runs": "Où cela s'exécute",
    "The output is a plain folder of files — any static host will serve it.": "La sortie est un simple dossier de fichiers — tout hébergement statique peut le servir.",
  },
  uk: {
    Operations: "Експлуатація",
    Deployment: "Розгортання",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "Виберіть, як публікується цей сайт, і дізнайтеся, що потрібно для самостійного хостингу.",
    Overview: "Огляд",
    "Static Site": "Статичний сайт",
    "Full Site": "Повноцінний сайт",
    Dockerfile: "Dockerfile",
    History: "Історія",
    "Loading deployment status…": "Завантаження стану розгортання…",
    "How this instance is running": "Як працює цей екземпляр",
    "Runtime mode": "Режим виконання",
    Production: "Продакшн",
    Local: "Локальний",
    "Production readiness gate": "Перевірка готовності до продакшну",
    Passed: "Пройдено",
    "Not applicable (local mode)": "Не застосовується (локальний режим)",
    "Owner password": "Пароль власника",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "Досі стандартний — встановіть TOVU_ADMIN_PASSWORD.",
    "Changed from the default.": "Змінено відносно стандартного.",
    "Agent daemon": "Демон агента",
    "No known failure": "Відомих збоїв немає",
    "Known failure — check server logs.": "Відомий збій — перевірте журнали сервера.",
    "Database file": "Файл бази даних",
    "Uploads folder": "Папка завантажень",
    "Environment variables": "Змінні середовища",
    Set: "Задано",
    "Not set": "Не задано",
    "Set (generated key file)": "Задано (згенерований файл ключа)",
    "Invalid — the keyring rejects it": "Недійсна — сховище ключів її відхиляє",
    "Falls back to a public default.": "За відсутності використовується публічне значення за замовчуванням.",
    'Falls back to "admin".': 'За відсутності використовується «admin».',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Обов'язкова для запуску в продакшні. Якщо відсутня локально, натомість на екрані ШІ-асистента з'явиться помилка 503.",
    "Falls back to port 4319.": "За відсутності використовується порт 4319.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Швидка копія опублікованих сторінок сайту лише для читання — без сервера позаду неї.",
    "Not built yet": "Ще не реалізовано",
    "Build it from a terminal": "Зберіть через термінал",
    "Build static export": "Зібрати статичний експорт",
    "What Full Site gives you": "Що дає Повноцінний сайт",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Повноцінний сервер Tovu — адмінка, асистент, оформлення замовлення, все працює.",
    Providers: "Провайдери",
    Planned: "Заплановано",
    "Loading Dockerfile…": "Завантаження Dockerfile…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "У корені репозиторію поки немає Dockerfile. Щойно його додадуть, вміст з'явиться тут.",
    Copy: "Копіювати",
    "Copied!": "Скопійовано!",
    Download: "Завантажити",
    "Building is a terminal command (docker build …), not a button here.":
      "Збірка образу — це команда терміналу (docker build …), а не кнопка тут.",
    "No deploys yet": "Розгортань поки немає",
    "Not wired up yet": "Ще не підключено",
    "What you keep": "Що ви зберігаєте",
    "What it needs": "Що потрібно",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "Хостинг, який може запускати контейнер і зберігати диск — на вкладці Dockerfile є образ, з якого це запускається.",
    "View the Dockerfile": "Переглянути Dockerfile",
    "None connectable yet": "Поки нічого не можна підключити",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "Полів облікових даних ще немає — цей екземпляр не має бекенду для їх зберігання, тому з цього екрана нічого не можна підключити.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "З цього екрана ще нічого не розгорнуто — і поки це неможливо. Після підключення хостингу тут буде наведено кожну збірку й розгортання з результатом.",
    "See how to publish today": "Дізнайтеся, як опублікувати сьогодні",
    "What a static export gives you": "Що дає статичний експорт",
    "Available from a terminal": "Доступно з термінала",
    "What survives the export": "Що зберігається після експорту",
    "Where it runs": "Де це працює",
    "The output is a plain folder of files — any static host will serve it.": "Результат — звичайна папка з файлами; її може обслуговувати будь-який статичний хостинг.",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "Незбережені зміни",
    "Saved": "Збережено",
    "Dockerfile contents": "Вміст Dockerfile",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "Збереження тут лише замінює вміст файлу — нічого не збирається і не розгортається.",
    "No Dockerfile exists yet. Write one below, then save to create it.": "Dockerfile поки немає. Напишіть його нижче й збережіть, щоб створити.",
  },
  tr: {
    Operations: "Operasyonlar",
    Deployment: "Dağıtım",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "Bu sitenin nasıl yayınlanacağını seçin ve kendi kendine barındırmanın ne gerektirdiğini görün.",
    Overview: "Genel bakış",
    "Static Site": "Statik Site",
    "Full Site": "Tam Site",
    Dockerfile: "Dockerfile",
    History: "Geçmiş",
    "Loading deployment status…": "Dağıtım durumu yükleniyor…",
    "How this instance is running": "Bu örnek nasıl çalışıyor",
    "Runtime mode": "Çalışma modu",
    Production: "Üretim",
    Local: "Yerel",
    "Production readiness gate": "Üretime hazırlık kontrolü",
    Passed: "Geçti",
    "Not applicable (local mode)": "Geçerli değil (yerel mod)",
    "Owner password": "Sahip parolası",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "Hâlâ varsayılan — TOVU_ADMIN_PASSWORD'ü ayarlayın.",
    "Changed from the default.": "Varsayılandan değiştirildi.",
    "Agent daemon": "Aracı arka plan servisi",
    "No known failure": "Bilinen bir hata yok",
    "Known failure — check server logs.": "Bilinen hata — sunucu günlüklerini kontrol edin.",
    "Database file": "Veritabanı dosyası",
    "Uploads folder": "Yüklemeler klasörü",
    "Environment variables": "Ortam değişkenleri",
    Set: "Ayarlandı",
    "Not set": "Ayarlanmadı",
    "Set (generated key file)": "Ayarlı (oluşturulan anahtar dosyası)",
    "Invalid — the keyring rejects it": "Geçersiz — anahtarlık bunu reddediyor",
    "Falls back to a public default.": "Ayarlanmazsa herkese açık bir varsayılan kullanılır.",
    'Falls back to "admin".': 'Ayarlanmazsa "admin" kullanılır.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Üretimde başlatmak için gereklidir. Yerelde eksikse, bunun yerine Yapay Zeka Asistanı ekranında 503 olarak görünür.",
    "Falls back to port 4319.": "Ayarlanmazsa 4319 numaralı port kullanılır.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Bu sitenin yayınlanmış sayfalarının hızlı, salt okunur bir kopyası — arkasında sunucu yok.",
    "Not built yet": "Henüz oluşturulmadı",
    "Build it from a terminal": "Terminalden oluşturun",
    "Build static export": "Statik dışa aktarma oluştur",
    "What Full Site gives you": "Tam Site size ne sağlar",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Eksiksiz Tovu sunucusu — yönetim paneli, asistan, ödeme, her şey çalışır.",
    Providers: "Sağlayıcılar",
    Planned: "Planlandı",
    "Loading Dockerfile…": "Dockerfile yükleniyor…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "Depo kök dizininde henüz bir Dockerfile yok. Eklendiğinde içeriği burada görünecek.",
    Copy: "Kopyala",
    "Copied!": "Kopyalandı!",
    Download: "İndir",
    "Building is a terminal command (docker build …), not a button here.":
      "İmajı oluşturmak bir terminal komutudur (docker build …), buradaki bir düğme değildir.",
    "No deploys yet": "Henüz dağıtım yok",
    "Not wired up yet": "Henüz bağlanmadı",
    "What you keep": "Koruduklarınız",
    "What it needs": "Gereksinimleri",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "Bir kapsayıcıyı çalıştırabilen ve diski koruyabilen bir barındırma gerekir — Dockerfile sekmesinde bunun çalıştığı imaj bulunur.",
    "View the Dockerfile": "Dockerfile'ı görüntüle",
    "None connectable yet": "Henüz bağlanabilir öğe yok",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "Henüz kimlik bilgisi alanı yok — bu örnekte onları saklayacak bir arka uç olmadığından bu ekrandan hiçbir şey bağlanamaz.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "Bu ekrandan henüz hiçbir şey dağıtılmadı — ve henüz dağıtılamaz. Bir barındırma bağlandığında her derleme ve dağıtım sonucu ile burada listelenir.",
    "See how to publish today": "Bugün nasıl yayımlayacağınızı görün",
    "What a static export gives you": "Statik dışa aktarmanın sundukları",
    "Available from a terminal": "Terminalden kullanılabilir",
    "What survives the export": "Dışa aktarmada kalanlar",
    "Where it runs": "Çalıştığı yer",
    "The output is a plain folder of files — any static host will serve it.": "Çıktı düz bir dosya klasörüdür — herhangi bir statik barındırma bunu sunabilir.",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "Kaydedilmemiş değişiklikler",
    "Saved": "Kaydedildi",
    "Dockerfile contents": "Dockerfile içeriği",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "Burada kaydetmek yalnızca dosyanın içeriğini değiştirir — hiçbir şey derlemez veya dağıtmaz.",
    "No Dockerfile exists yet. Write one below, then save to create it.": "Henüz bir Dockerfile yok. Aşağıya bir tane yazın, ardından oluşturmak için kaydedin.",
  },
  th: {
    Operations: "ปฏิบัติการ",
    Deployment: "การปรับใช้",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "เลือกวิธีเผยแพร่เว็บไซต์นี้ และดูว่าการโฮสต์เองต้องทำอะไรบ้าง",
    Overview: "ภาพรวม",
    "Static Site": "เว็บไซต์แบบสแตติก",
    "Full Site": "เว็บไซต์แบบเต็มรูปแบบ",
    Dockerfile: "Dockerfile",
    History: "ประวัติ",
    "Loading deployment status…": "กำลังโหลดสถานะการปรับใช้…",
    "How this instance is running": "อินสแตนซ์นี้ทำงานอย่างไร",
    "Runtime mode": "โหมดการทำงาน",
    Production: "โปรดักชัน",
    Local: "โลคัล",
    "Production readiness gate": "การตรวจสอบความพร้อมสำหรับโปรดักชัน",
    Passed: "ผ่าน",
    "Not applicable (local mode)": "ไม่เกี่ยวข้อง (โหมดโลคัล)",
    "Owner password": "รหัสผ่านของเจ้าของ",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "ยังคงเป็นค่าเริ่มต้น — ตั้งค่า TOVU_ADMIN_PASSWORD",
    "Changed from the default.": "เปลี่ยนจากค่าเริ่มต้นแล้ว",
    "Agent daemon": "ดีมอนของเอเจนต์",
    "No known failure": "ไม่พบความล้มเหลวที่ทราบ",
    "Known failure — check server logs.": "พบความล้มเหลวที่ทราบ — ตรวจสอบบันทึกของเซิร์ฟเวอร์",
    "Database file": "ไฟล์ฐานข้อมูล",
    "Uploads folder": "โฟลเดอร์ที่อัปโหลด",
    "Environment variables": "ตัวแปรสภาพแวดล้อม",
    Set: "ตั้งค่าแล้ว",
    "Not set": "ยังไม่ได้ตั้งค่า",
    "Set (generated key file)": "ตั้งค่าแล้ว (ไฟล์คีย์ที่สร้างขึ้น)",
    "Invalid — the keyring rejects it": "ไม่ถูกต้อง — คีย์ริงปฏิเสธ",
    "Falls back to a public default.": "ใช้ค่าเริ่มต้นสาธารณะเมื่อไม่ได้ตั้งค่า",
    'Falls back to "admin".': 'ใช้ "admin" เมื่อไม่ได้ตั้งค่า',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "จำเป็นสำหรับการบูตในโปรดักชัน หากไม่มีในโลคัล จะแสดงเป็น 503 ที่หน้าจอผู้ช่วย AI แทน",
    "Falls back to port 4319.": "ใช้พอร์ต 4319 เมื่อไม่ได้ตั้งค่า",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "สำเนาแบบอ่านอย่างเดียวที่รวดเร็วของหน้าที่เผยแพร่ของเว็บไซต์นี้ — ไม่มีเซิร์ฟเวอร์อยู่เบื้องหลัง",
    "Not built yet": "ยังไม่ได้สร้าง",
    "Build it from a terminal": "สร้างจากเทอร์มินัล",
    "Build static export": "สร้างการส่งออกแบบสแตติก",
    "What Full Site gives you": "เว็บไซต์แบบเต็มรูปแบบให้อะไรกับคุณ",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "เซิร์ฟเวอร์ Tovu แบบสมบูรณ์ — ระบบผู้ดูแล ผู้ช่วย การชำระเงิน ทุกอย่างทำงานได้",
    Providers: "ผู้ให้บริการ",
    Planned: "วางแผนไว้",
    "Loading Dockerfile…": "กำลังโหลด Dockerfile…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "ยังไม่มี Dockerfile ที่รากของที่เก็บโค้ด เมื่อมีการเพิ่มแล้ว เนื้อหาจะปรากฏที่นี่",
    Copy: "คัดลอก",
    "Copied!": "คัดลอกแล้ว!",
    Download: "ดาวน์โหลด",
    "Building is a terminal command (docker build …), not a button here.":
      "การสร้างอิมเมจเป็นคำสั่งเทอร์มินัล (docker build …) ไม่ใช่ปุ่มที่นี่",
    "No deploys yet": "ยังไม่มีการปรับใช้",
    "Not wired up yet": "ยังไม่ได้เชื่อมต่อ",
    "What you keep": "สิ่งที่คงอยู่",
    "What it needs": "สิ่งที่ต้องใช้",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "โฮสต์ที่เรียกใช้คอนเทนเนอร์และเก็บดิสก์ไว้ได้ — แท็บ Dockerfile มีอิมเมจที่ใช้เรียกใช้สิ่งนี้",
    "View the Dockerfile": "ดู Dockerfile",
    "None connectable yet": "ยังไม่มีรายการที่เชื่อมต่อได้",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "ยังไม่มีช่องข้อมูลรับรอง — อินสแตนซ์นี้ไม่มีแบ็กเอนด์สำหรับจัดเก็บ จึงไม่สามารถเชื่อมต่ออะไรจากหน้าจอนี้ได้",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "ยังไม่มีการปรับใช้จากหน้าจอนี้ และยังทำไม่ได้ เมื่อเชื่อมต่อโฮสต์แล้ว ทุกการบิลด์และการปรับใช้จะแสดงที่นี่พร้อมผลลัพธ์",
    "See how to publish today": "ดูวิธีเผยแพร่วันนี้",
    "What a static export gives you": "สิ่งที่การส่งออกแบบคงที่มอบให้",
    "Available from a terminal": "ใช้ได้จากเทอร์มินัล",
    "What survives the export": "สิ่งที่ยังคงอยู่หลังการส่งออก",
    "Where it runs": "ตำแหน่งที่ทำงาน",
    "The output is a plain folder of files — any static host will serve it.": "ผลลัพธ์คือโฟลเดอร์ไฟล์ธรรมดา — โฮสต์แบบคงที่ใดก็ให้บริการได้",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "การเปลี่ยนแปลงที่ยังไม่ได้บันทึก",
    "Saved": "บันทึกแล้ว",
    "Dockerfile contents": "เนื้อหา Dockerfile",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "การบันทึกที่นี่เป็นเพียงการแทนที่เนื้อหาของไฟล์ — ไม่ได้บิลด์หรือปรับใช้สิ่งใด",
    "No Dockerfile exists yet. Write one below, then save to create it.": "ยังไม่มี Dockerfile เขียนไว้ด้านล่าง แล้วบันทึกเพื่อสร้างไฟล์",
  },
  it: {
    Operations: "Operazioni",
    Deployment: "Distribuzione",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "Scegli come viene pubblicato questo sito e scopri cosa comporta l'auto-hosting.",
    Overview: "Panoramica",
    "Static Site": "Sito statico",
    "Full Site": "Sito completo",
    Dockerfile: "Dockerfile",
    History: "Cronologia",
    "Loading deployment status…": "Caricamento dello stato di distribuzione…",
    "How this instance is running": "Come sta funzionando questa istanza",
    "Runtime mode": "Modalità di runtime",
    Production: "Produzione",
    Local: "Locale",
    "Production readiness gate": "Controllo di prontezza per la produzione",
    Passed: "Superato",
    "Not applicable (local mode)": "Non applicabile (modalità locale)",
    "Owner password": "Password del proprietario",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "Ancora quella predefinita — imposta TOVU_ADMIN_PASSWORD.",
    "Changed from the default.": "Modificata rispetto a quella predefinita.",
    "Agent daemon": "Demone dell'agente",
    "No known failure": "Nessun errore noto",
    "Known failure — check server logs.": "Errore noto — controlla i log del server.",
    "Database file": "File del database",
    "Uploads folder": "Cartella dei caricamenti",
    "Environment variables": "Variabili d'ambiente",
    Set: "Impostata",
    "Not set": "Non impostata",
    "Set (generated key file)": "Impostata (file di chiave generato)",
    "Invalid — the keyring rejects it": "Non valida — il portachiavi la rifiuta",
    "Falls back to a public default.": "Se assente, usa un valore predefinito pubblico.",
    'Falls back to "admin".': 'Se assente, usa "admin".',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Necessaria per l'avvio in produzione. Se assente in locale, appare invece come errore 503 nella schermata dell'Assistente IA.",
    "Falls back to port 4319.": "Se assente, usa la porta 4319.",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Una copia veloce e di sola lettura delle pagine pubblicate di questo sito — senza server dietro.",
    "Not built yet": "Non ancora realizzato",
    "Build it from a terminal": "Generalo da un terminale",
    "Build static export": "Genera esportazione statica",
    "What Full Site gives you": "Cosa offre il Sito completo",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Il server Tovu completo — amministrazione, assistente, checkout, tutto funziona.",
    Providers: "Fornitori",
    Planned: "Pianificato",
    "Loading Dockerfile…": "Caricamento del Dockerfile…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "Non esiste ancora un Dockerfile nella radice del repository. Una volta aggiunto, il suo contenuto apparirà qui.",
    Copy: "Copia",
    "Copied!": "Copiato!",
    Download: "Scarica",
    "Building is a terminal command (docker build …), not a button here.":
      "La build dell'immagine è un comando da terminale (docker build …), non un pulsante qui.",
    "Unsaved changes": "Modifiche non salvate",
    Saved: "Salvato",
    "Dockerfile contents": "Contenuto del Dockerfile",
    "Saving here only replaces the file's contents — it does not build or deploy anything.":
      "Salvare qui sostituisce solo il contenuto del file — non compila né distribuisce nulla.",
    "No Dockerfile exists yet. Write one below, then save to create it.":
      "Non esiste ancora un Dockerfile. Scrivine uno qui sotto, poi salva per crearlo.",
    "No deploys yet": "Ancora nessuna distribuzione",
    "Not wired up yet": "Non ancora collegato",
    "What you keep": "Ciò che mantieni",
    "What it needs": "Di cosa ha bisogno",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "Un hosting che possa eseguire un contenitore e mantenere un disco — la scheda Dockerfile contiene l'immagine da cui viene eseguito.",
    "View the Dockerfile": "Visualizza il Dockerfile",
    "None connectable yet": "Nessuno collegabile per ora",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "Non ci sono ancora campi delle credenziali — questa istanza non ha un backend per archiviarle, quindi da questa schermata non si può collegare nulla.",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "Da questa schermata non è stato distribuito nulla — e non è ancora possibile. Quando un hosting sarà collegato, qui appariranno tutte le build e le distribuzioni con il loro esito.",
    "See how to publish today": "Scopri come pubblicare oggi",
    "What a static export gives you": "Cosa offre un'esportazione statica",
    "Available from a terminal": "Disponibile da un terminale",
    "What survives the export": "Cosa rimane dopo l'esportazione",
    "Where it runs": "Dove viene eseguito",
    "The output is a plain folder of files — any static host will serve it.": "L'output è una semplice cartella di file — qualsiasi hosting statico può servirla.",
  },
  hi: {
    Operations: "संचालन",
    Deployment: "डिप्लॉयमेंट",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "चुनें कि यह साइट कैसे प्रकाशित होती है, और देखें कि सेल्फ-होस्टिंग में क्या शामिल है।",
    Overview: "अवलोकन",
    "Static Site": "स्थिर साइट",
    "Full Site": "पूर्ण साइट",
    Dockerfile: "Dockerfile",
    History: "इतिहास",
    "Loading deployment status…": "डिप्लॉयमेंट स्थिति लोड हो रही है…",
    "How this instance is running": "यह इंस्टेंस कैसे चल रहा है",
    "Runtime mode": "रनटाइम मोड",
    Production: "प्रोडक्शन",
    Local: "लोकल",
    "Production readiness gate": "प्रोडक्शन तैयारी जांच",
    Passed: "उत्तीर्ण",
    "Not applicable (local mode)": "लागू नहीं (लोकल मोड)",
    "Owner password": "मालिक का पासवर्ड",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "अभी भी डिफ़ॉल्ट है — TOVU_ADMIN_PASSWORD सेट करें।",
    "Changed from the default.": "डिफ़ॉल्ट से बदला गया।",
    "Agent daemon": "एजेंट डेमन",
    "No known failure": "कोई ज्ञात विफलता नहीं",
    "Known failure — check server logs.": "ज्ञात विफलता — सर्वर लॉग जांचें।",
    "Database file": "डेटाबेस फ़ाइल",
    "Uploads folder": "अपलोड फ़ोल्डर",
    "Environment variables": "एनवायरनमेंट वेरिएबल",
    Set: "सेट किया गया",
    "Not set": "सेट नहीं है",
    "Set (generated key file)": "सेट है (जनरेट की गई कुंजी फ़ाइल)",
    "Invalid — the keyring rejects it": "अमान्य — कीरिंग इसे अस्वीकार करता है",
    "Falls back to a public default.": "सेट न होने पर सार्वजनिक डिफ़ॉल्ट का उपयोग करता है।",
    'Falls back to "admin".': 'सेट न होने पर "admin" का उपयोग करता है।',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "प्रोडक्शन में बूट के लिए आवश्यक है। लोकल में न होने पर, इसके बजाय AI असिस्टेंट स्क्रीन पर 503 के रूप में दिखता है।",
    "Falls back to port 4319.": "सेट न होने पर पोर्ट 4319 का उपयोग करता है।",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "इस साइट के प्रकाशित पृष्ठों की एक तेज़, केवल-पढ़ने योग्य प्रति — इसके पीछे कोई सर्वर नहीं।",
    "Not built yet": "अभी नहीं बना",
    "Build it from a terminal": "टर्मिनल से बनाएं",
    "Build static export": "स्थिर एक्सपोर्ट बनाएं",
    "What Full Site gives you": "पूर्ण साइट आपको क्या देती है",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "संपूर्ण Tovu सर्वर — एडमिन, असिस्टेंट, चेकआउट, सब कुछ काम करता है।",
    Providers: "प्रदाता",
    Planned: "नियोजित",
    "Loading Dockerfile…": "Dockerfile लोड हो रहा है…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "रेपो रूट में अभी कोई Dockerfile मौजूद नहीं है। एक बार जोड़े जाने पर, इसकी सामग्री यहां दिखाई देगी।",
    Copy: "कॉपी करें",
    "Copied!": "कॉपी हो गया!",
    Download: "डाउनलोड करें",
    "Building is a terminal command (docker build …), not a button here.":
      "इमेज बनाना एक टर्मिनल कमांड है (docker build …), यहां का बटन नहीं।",
    "No deploys yet": "अभी तक कोई डिप्लॉयमेंट नहीं",
    "Not wired up yet": "अभी तक कनेक्ट नहीं किया गया",
    "What you keep": "जो बना रहता है",
    "What it needs": "जिसकी इसे ज़रूरत है",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "ऐसा होस्ट जो कंटेनर चला सके और डिस्क को बनाए रख सके — Dockerfile टैब में वह इमेज है जिससे यह चलता है।",
    "View the Dockerfile": "Dockerfile देखें",
    "None connectable yet": "अभी कोई कनेक्ट करने योग्य नहीं",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "अभी क्रेडेंशियल फ़ील्ड नहीं हैं — इस इंस्टेंस में उन्हें संग्रहीत करने के लिए बैकएंड नहीं है, इसलिए इस स्क्रीन से कुछ भी कनेक्ट नहीं किया जा सकता।",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "इस स्क्रीन से अभी कुछ भी डिप्लॉय नहीं किया गया है — और अभी किया भी नहीं जा सकता। होस्ट कनेक्ट होने पर हर बिल्ड और डिप्लॉयमेंट उसके परिणाम सहित यहाँ दिखेगा।",
    "See how to publish today": "आज प्रकाशित करने का तरीका देखें",
    "What a static export gives you": "स्थिर एक्सपोर्ट से क्या मिलता है",
    "Available from a terminal": "टर्मिनल से उपलब्ध",
    "What survives the export": "एक्सपोर्ट के बाद क्या रहता है",
    "Where it runs": "जहाँ यह चलता है",
    "The output is a plain folder of files — any static host will serve it.": "आउटपुट फ़ाइलों का एक साधारण फ़ोल्डर है — कोई भी स्थिर होस्ट इसे उपलब्ध करा सकता है।",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "बिना सहेजे गए बदलाव",
    "Saved": "सहेजा गया",
    "Dockerfile contents": "Dockerfile की सामग्री",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "यहाँ सहेजने से केवल फ़ाइल की सामग्री बदलती है — यह कुछ भी बिल्ड या डिप्लॉय नहीं करता।",
    "No Dockerfile exists yet. Write one below, then save to create it.": "अभी कोई Dockerfile मौजूद नहीं है। नीचे एक लिखें, फिर उसे बनाने के लिए सहेजें।",
  },
  ur: {
    Operations: "کارروائیاں",
    Deployment: "ڈیپلائے منٹ",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "منتخب کریں کہ یہ سائٹ کیسے شائع ہوتی ہے، اور دیکھیں کہ خود میزبانی میں کیا شامل ہے۔",
    Overview: "جائزہ",
    "Static Site": "جامد سائٹ",
    "Full Site": "مکمل سائٹ",
    Dockerfile: "Dockerfile",
    History: "تاریخ",
    "Loading deployment status…": "ڈیپلائے منٹ کی حیثیت لوڈ ہو رہی ہے…",
    "How this instance is running": "یہ انسٹنس کیسے چل رہا ہے",
    "Runtime mode": "رن ٹائم موڈ",
    Production: "پروڈکشن",
    Local: "لوکل",
    "Production readiness gate": "پروڈکشن تیاری کی جانچ",
    Passed: "کامیاب",
    "Not applicable (local mode)": "لاگو نہیں (لوکل موڈ)",
    "Owner password": "مالک کا پاس ورڈ",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "ابھی بھی ڈیفالٹ ہے — TOVU_ADMIN_PASSWORD سیٹ کریں۔",
    "Changed from the default.": "ڈیفالٹ سے تبدیل کر دیا گیا۔",
    "Agent daemon": "ایجنٹ ڈیمن",
    "No known failure": "کوئی معلوم ناکامی نہیں",
    "Known failure — check server logs.": "معلوم ناکامی — سرور لاگز چیک کریں۔",
    "Database file": "ڈیٹابیس فائل",
    "Uploads folder": "اپ لوڈز فولڈر",
    "Environment variables": "ماحولیاتی متغیرات",
    Set: "سیٹ ہے",
    "Not set": "سیٹ نہیں",
    "Set (generated key file)": "سیٹ ہے (بنائی گئی کلید فائل)",
    "Invalid — the keyring rejects it": "غلط — کی رنگ اسے مسترد کرتا ہے",
    "Falls back to a public default.": "سیٹ نہ ہونے پر عوامی ڈیفالٹ استعمال ہوتا ہے۔",
    'Falls back to "admin".': 'سیٹ نہ ہونے پر "admin" استعمال ہوتا ہے۔',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "پروڈکشن میں بوٹ کے لیے ضروری ہے۔ لوکل میں نہ ہونے کی صورت میں، اس کے بجائے AI اسسٹنٹ اسکرین پر 503 کے طور پر ظاہر ہوتا ہے۔",
    "Falls back to port 4319.": "سیٹ نہ ہونے پر پورٹ 4319 استعمال ہوتا ہے۔",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "اس سائٹ کے شائع شدہ صفحات کی تیز، صرف پڑھنے کے قابل کاپی — اس کے پیچھے کوئی سرور نہیں۔",
    "Not built yet": "ابھی تک نہیں بنایا گیا",
    "Build it from a terminal": "ٹرمینل سے بنائیں",
    "Build static export": "جامد ایکسپورٹ بنائیں",
    "What Full Site gives you": "مکمل سائٹ آپ کو کیا دیتی ہے",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "مکمل Tovu سرور — ایڈمن، اسسٹنٹ، چیک آؤٹ، سب کچھ کام کرتا ہے۔",
    Providers: "فراہم کنندگان",
    Planned: "منصوبہ بند",
    "Loading Dockerfile…": "Dockerfile لوڈ ہو رہا ہے…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "ریپو کی جڑ میں ابھی تک کوئی Dockerfile موجود نہیں۔ ایک بار شامل ہونے پر، اس کا مواد یہاں ظاہر ہوگا۔",
    Copy: "کاپی کریں",
    "Copied!": "کاپی ہو گیا!",
    Download: "ڈاؤن لوڈ کریں",
    "Building is a terminal command (docker build …), not a button here.":
      "امیج بنانا ایک ٹرمینل کمانڈ ہے (docker build …)، یہاں کا بٹن نہیں۔",
    "No deploys yet": "ابھی تک کوئی ڈیپلائے منٹ نہیں",
    "Not wired up yet": "ابھی تک منسلک نہیں",
    "What you keep": "جو آپ برقرار رکھتے ہیں",
    "What it needs": "جس کی اسے ضرورت ہے",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "ایسا ہوسٹ جو کنٹینر چلا سکے اور ڈسک کو برقرار رکھ سکے — Dockerfile ٹیب میں وہ امیج ہے جس سے یہ چلتا ہے۔",
    "View the Dockerfile": "Dockerfile دیکھیں",
    "None connectable yet": "ابھی کوئی قابلِ اتصال نہیں",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "ابھی اسناد کے خانے نہیں ہیں — اس انسٹینس کے پاس انہیں ذخیرہ کرنے کے لیے بیک اینڈ نہیں، اس لیے اس اسکرین سے کچھ بھی منسلک نہیں ہو سکتا۔",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "اس اسکرین سے ابھی کچھ بھی ڈیپلائے نہیں ہوا — اور ابھی ہو بھی نہیں سکتا۔ ہوسٹ منسلک ہونے پر ہر بلڈ اور ڈیپلائے منٹ نتیجے کے ساتھ یہاں درج ہوگا۔",
    "See how to publish today": "آج شائع کرنے کا طریقہ دیکھیں",
    "What a static export gives you": "جامد ایکسپورٹ کیا دیتا ہے",
    "Available from a terminal": "ٹرمینل سے دستیاب",
    "What survives the export": "ایکسپورٹ کے بعد کیا باقی رہتا ہے",
    "Where it runs": "جہاں یہ چلتا ہے",
    "The output is a plain folder of files — any static host will serve it.": "آؤٹ پٹ فائلوں کا ایک سادہ فولڈر ہے — کوئی بھی جامد ہوسٹ اسے پیش کر سکتا ہے۔",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "غیر محفوظ تبدیلیاں",
    "Saved": "محفوظ ہو گیا",
    "Dockerfile contents": "Dockerfile کا مواد",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "یہاں محفوظ کرنے سے صرف فائل کا مواد بدلتا ہے — یہ کچھ بھی بلڈ یا ڈیپلائے نہیں کرتا۔",
    "No Dockerfile exists yet. Write one below, then save to create it.": "ابھی تک کوئی Dockerfile موجود نہیں۔ نیچے ایک لکھیں، پھر اسے بنانے کے لیے محفوظ کریں۔",
  },
  bn: {
    Operations: "কার্যক্রম",
    Deployment: "ডিপ্লয়মেন্ট",
    "Choose how this site gets published, and see what self-hosting it involves.":
      "এই সাইটটি কীভাবে প্রকাশিত হবে তা বেছে নিন, এবং সেলফ-হোস্টিং এ কী জড়িত তা দেখুন।",
    Overview: "সংক্ষিপ্ত বিবরণ",
    "Static Site": "স্ট্যাটিক সাইট",
    "Full Site": "সম্পূর্ণ সাইট",
    Dockerfile: "Dockerfile",
    History: "ইতিহাস",
    "Loading deployment status…": "ডিপ্লয়মেন্ট অবস্থা লোড হচ্ছে…",
    "How this instance is running": "এই ইনস্ট্যান্স কীভাবে চলছে",
    "Runtime mode": "রানটাইম মোড",
    Production: "প্রোডাকশন",
    Local: "লোকাল",
    "Production readiness gate": "প্রোডাকশন প্রস্তুতি যাচাই",
    Passed: "উত্তীর্ণ",
    "Not applicable (local mode)": "প্রযোজ্য নয় (লোকাল মোড)",
    "Owner password": "মালিকের পাসওয়ার্ড",
    "Still the default — set TOVU_ADMIN_PASSWORD.": "এখনও ডিফল্ট রয়েছে — TOVU_ADMIN_PASSWORD সেট করুন।",
    "Changed from the default.": "ডিফল্ট থেকে পরিবর্তিত হয়েছে।",
    "Agent daemon": "এজেন্ট ডেমন",
    "No known failure": "কোনো জানা ব্যর্থতা নেই",
    "Known failure — check server logs.": "জানা ব্যর্থতা — সার্ভার লগ পরীক্ষা করুন।",
    "Database file": "ডেটাবেস ফাইল",
    "Uploads folder": "আপলোড ফোল্ডার",
    "Environment variables": "পরিবেশ ভেরিয়েবল",
    Set: "সেট করা আছে",
    "Not set": "সেট করা নেই",
    "Set (generated key file)": "সেট করা (তৈরি করা কী ফাইল)",
    "Invalid — the keyring rejects it": "অবৈধ — কীরিং এটি প্রত্যাখ্যান করে",
    "Falls back to a public default.": "সেট না থাকলে একটি পাবলিক ডিফল্ট ব্যবহার করে।",
    'Falls back to "admin".': '"admin" ব্যবহার করে সেট না থাকলে।',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "প্রোডাকশনে বুট করার জন্য প্রয়োজনীয়। লোকালে না থাকলে, পরিবর্তে AI সহায়ক স্ক্রিনে 503 হিসেবে দেখা যাবে।",
    "Falls back to port 4319.": "সেট না থাকলে পোর্ট 4319 ব্যবহার করে।",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "এই সাইটের প্রকাশিত পৃষ্ঠাগুলোর একটি দ্রুত, শুধুমাত্র-পঠনযোগ্য কপি — এর পিছনে কোনো সার্ভার নেই।",
    "Not built yet": "এখনও তৈরি হয়নি",
    "Build it from a terminal": "টার্মিনাল থেকে তৈরি করুন",
    "Build static export": "স্ট্যাটিক এক্সপোর্ট তৈরি করুন",
    "What Full Site gives you": "সম্পূর্ণ সাইট আপনাকে কী দেয়",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "সম্পূর্ণ Tovu সার্ভার — অ্যাডমিন, সহায়ক, চেকআউট, সবকিছু কাজ করে।",
    Providers: "প্রদানকারী",
    Planned: "পরিকল্পিত",
    "Loading Dockerfile…": "Dockerfile লোড হচ্ছে…",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "রিপোর মূলে এখনও কোনো Dockerfile নেই। একবার যোগ করা হলে, এর বিষয়বস্তু এখানে প্রদর্শিত হবে।",
    Copy: "কপি করুন",
    "Copied!": "কপি হয়েছে!",
    Download: "ডাউনলোড করুন",
    "Building is a terminal command (docker build …), not a button here.":
      "ইমেজ তৈরি করা একটি টার্মিনাল কমান্ড (docker build …), এখানকার বাটন নয়।",
    "No deploys yet": "এখনও কোনো ডিপ্লয়মেন্ট নেই",
    "Not wired up yet": "এখনও সংযুক্ত নয়",
    "What you keep": "যা বজায় থাকে",
    "What it needs": "যা প্রয়োজন",
    "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.": "এমন একটি হোস্ট যা কনটেইনার চালাতে এবং ডিস্ক ধরে রাখতে পারে — Dockerfile ট্যাবে এটি যে ইমেজ থেকে চলে তা আছে।",
    "View the Dockerfile": "Dockerfile দেখুন",
    "None connectable yet": "এখনও কিছু সংযুক্ত করা যায় না",
    "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.": "এখনও কোনো শংসাপত্র ক্ষেত্র নেই — এই ইনস্ট্যান্সে সেগুলি সংরক্ষণের ব্যাকএন্ড নেই, তাই এই স্ক্রিন থেকে কিছুই সংযুক্ত করা যায় না।",
    "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.": "এই স্ক্রিন থেকে এখনও কিছু ডিপ্লয় করা হয়নি — এবং এখনও করা যায় না। হোস্ট সংযুক্ত হলে প্রতিটি বিল্ড ও ডিপ্লয় তার ফলাফলসহ এখানে তালিকাভুক্ত হবে।",
    "See how to publish today": "আজ কীভাবে প্রকাশ করবেন দেখুন",
    "What a static export gives you": "স্ট্যাটিক এক্সপোর্ট যা দেয়",
    "Available from a terminal": "টার্মিনাল থেকে উপলভ্য",
    "What survives the export": "এক্সপোর্টের পর যা থাকে",
    "Where it runs": "যেখানে এটি চলে",
    "The output is a plain folder of files — any static host will serve it.": "আউটপুট হলো ফাইলের একটি সাধারণ ফোল্ডার — যেকোনো স্ট্যাটিক হোস্ট এটি পরিবেশন করতে পারে।",
    // Dockerfile editor copy previously translated only in es/id/de/pt-BR/fr/it
    "Unsaved changes": "অসংরক্ষিত পরিবর্তন",
    "Saved": "সংরক্ষিত",
    "Dockerfile contents": "Dockerfile-এর বিষয়বস্তু",
    "Saving here only replaces the file's contents — it does not build or deploy anything.": "এখানে সংরক্ষণ করলে শুধু ফাইলের বিষয়বস্তু বদলায় — কিছুই বিল্ড বা ডিপ্লয় করে না।",
    "No Dockerfile exists yet. Write one below, then save to create it.": "এখনও কোনো Dockerfile নেই। নিচে একটি লিখুন, তারপর তৈরি করতে সংরক্ষণ করুন।",
  },
};

/** Strings added with the Static Site publishing UI.  Keep this list separate so every locale gets
 * the same key set; locale-specific entries below deliberately override the English source text. */
const DEPLOYMENT_AUDIT_STRINGS: Record<string, string> = {
  "{count} lines": "{count} lines",
  "Not supported": "Not supported",
  "Supported": "Supported",
  "No Dockerfile yet": "No Dockerfile yet",
  "Someone else saved a different version of this Dockerfile while you were editing — your changes below were NOT saved.": "Someone else saved a different version of this Dockerfile while you were editing — your changes below were NOT saved.",
  "Its current contents on the server are:": "Its current contents on the server are:",
  "It was deleted on the server.": "It was deleted on the server.",
  "Your own edits below are untouched. Compare them against the current contents above, reconcile by hand, then Save again.": "Your own edits below are untouched. Compare them against the current contents above, reconcile by hand, then Save again.",
  "Load the current version": "Load the current version",
  "Available from a terminal": "Available from a terminal",
  "Runs on any static host, including free ones. Nothing dynamic survives the export.": "Runs on any static host, including free ones. Nothing dynamic survives the export.",
  "View Static Site details": "View Static Site details",
  "Not wired up yet": "Not wired up yet",
  "Needs a host to run on — provider setup is planned, not wired up yet.": "Needs a host to run on — provider setup is planned, not wired up yet.",
  "View Full Site details": "View Full Site details",
  "Set": "Set",
  "Routes": "Routes",
  "succeeded": "succeeded",
  "failed": "failed",
  "Written to": "Written to",
  "Failed routes": "Failed routes",
  "Failed assets": "Failed assets",
  "Tovu writes every published post, the home page, products and theme pages into the folder you name.": "Tovu writes every published post, the home page, products and theme pages into the folder you name.",
  "Copy the export command": "Copy the export command",
  "Replace <dir> with the folder to write into. It is a required argument — there is no default.": "Replace <dir> with the folder to write into. It is a required argument — there is no default.",
  "Overwrite existing files in the output folder": "Overwrite existing files in the output folder",
  "Off by default. The exporter refuses to write into a non-empty folder unless this is checked — it never deletes unknown files silently.": "Off by default. The exporter refuses to write into a non-empty folder unless this is checked — it never deletes unknown files silently.",
  "Exporting…": "Exporting…",
  "Checking…": "Checking…",
  "Getting it online": "Getting it online",
  "The export is just a folder of files. Pick where it goes, then publish straight from here.": "The export is just a folder of files. Pick where it goes, then publish straight from here.",
  "Publish target": "Publish target",
  "Connected": "Connected",
  "Need to save more than one token, rename one, or manage every saved credential in one place?": "Need to save more than one token, rename one, or manage every saved credential in one place?",
  "Create access token": "Create access token",
  "Loading credentials…": "Loading credentials…",
  "Account ID": "Account ID",
  "Verify": "Verify",
  "Verifying…": "Verifying…",
  "Which saved token publishes": "Which saved token publishes",
  "This workspace has more than one saved": "This workspace has more than one saved",
  "token. Pick which one Tovu publishes with.": "token. Pick which one Tovu publishes with.",
  "Repository": "Repository",
  "Publishing…": "Publishing…",
  "This is immediately live on the public internet once it finishes — there is no draft or review step.": "This is immediately live on the public internet once it finishes — there is no draft or review step.",
  "Where this publish goes": "Where this publish goes",
  "The account above only proves you're allowed to publish — this says exactly where this one goes.": "The account above only proves you're allowed to publish — this says exactly where this one goes.",
  "Base path": "Base path",
  "None — serves from the domain root": "None — serves from the domain root",
  "Credential": "Credential",
  "Published:": "Published:",
};

const DEPLOYMENT_AUDIT_ES: Record<string, string> = {
  "{count} lines": "{count} líneas",
  "Not supported": "No compatible",
  "Supported": "Compatible",
  "No Dockerfile yet": "Aún no hay Dockerfile",
  "Someone else saved a different version of this Dockerfile while you were editing — your changes below were NOT saved.": "Otra persona guardó una versión distinta de este Dockerfile mientras editabas; los cambios de abajo NO se guardaron.",
  "Its current contents on the server are:": "Su contenido actual en el servidor es:",
  "It was deleted on the server.": "Se eliminó en el servidor.",
  "Your own edits below are untouched. Compare them against the current contents above, reconcile by hand, then Save again.": "Tus ediciones de abajo no se modificaron. Compáralas con el contenido actual de arriba, reconcilia los cambios manualmente y vuelve a guardar.",
  "Load the current version": "Cargar la versión actual",
  "Available from a terminal": "Disponible desde una terminal",
  "Runs on any static host, including free ones. Nothing dynamic survives the export.": "Funciona en cualquier alojamiento estático, incluso gratuito. Nada dinámico se conserva al exportar.",
  "View Static Site details": "Ver detalles del sitio estático",
  "Not wired up yet": "Aún no está conectado",
  "Needs a host to run on — provider setup is planned, not wired up yet.": "Necesita un alojamiento para ejecutarse; la configuración del proveedor está prevista, pero aún no está conectada.",
  "View Full Site details": "Ver detalles del sitio completo",
  "Set": "Configurada",
  "Routes": "Rutas",
  "succeeded": "correctas",
  "failed": "fallidas",
  "Written to": "Escrito en",
  "Failed routes": "Rutas fallidas",
  "Failed assets": "Recursos fallidos",
  "Tovu writes every published post, the home page, products and theme pages into the folder you name.": "Tovu escribe cada publicación publicada, la página de inicio, los productos y las páginas del tema en la carpeta que indiques.",
  "Copy the export command": "Copiar el comando de exportación",
  "Replace <dir> with the folder to write into. It is a required argument — there is no default.": "Reemplaza <dir> por la carpeta donde escribir. Es un argumento obligatorio; no hay valor predeterminado.",
  "Overwrite existing files in the output folder": "Sobrescribir archivos existentes en la carpeta de salida",
  "Off by default. The exporter refuses to write into a non-empty folder unless this is checked — it never deletes unknown files silently.": "Está desactivado de forma predeterminada. El exportador no escribe en una carpeta no vacía salvo que se marque esta opción; nunca elimina archivos desconocidos en silencio.",
  "Exporting…": "Exportando…",
  "Checking…": "Comprobando…",
  "Getting it online": "Publicarlo en línea",
  "The export is just a folder of files. Pick where it goes, then publish straight from here.": "La exportación es solo una carpeta de archivos. Elige dónde va y publícala directamente desde aquí.",
  "Publish target": "Destino de publicación",
  "Connected": "Conectado",
  "Need to save more than one token, rename one, or manage every saved credential in one place?": "¿Necesitas guardar más de un token, cambiarle el nombre o administrar todas las credenciales guardadas en un lugar?",
  "Create access token": "Crear token de acceso",
  "Loading credentials…": "Cargando credenciales…",
  "Account ID": "ID de cuenta",
  "Verify": "Verificar",
  "Verifying…": "Verificando…",
  "Which saved token publishes": "Qué token guardado publica",
  "This workspace has more than one saved": "Este espacio de trabajo tiene más de un",
  "token. Pick which one Tovu publishes with.": "token guardado. Elige cuál usa Tovu para publicar.",
  "Repository": "Repositorio",
  "Publishing…": "Publicando…",
  "This is immediately live on the public internet once it finishes — there is no draft or review step.": "Esto estará en Internet públicamente en cuanto termine; no hay borrador ni paso de revisión.",
  "Where this publish goes": "Dónde se publica",
  "The account above only proves you're allowed to publish — this says exactly where this one goes.": "La cuenta anterior solo demuestra que puedes publicar; esto indica exactamente dónde se publica.",
  "Base path": "Ruta base",
  "None — serves from the domain root": "Ninguna: se sirve desde la raíz del dominio",
  "Credential": "Credencial",
  "Published:": "Publicado:",
};

/**
 * Locale-specific values for the publishing UI additions above.  Keeping the values in the same
 * order as DEPLOYMENT_AUDIT_STRINGS makes it much harder for a future addition to miss a locale;
 * auditTranslationEntries rejects an incomplete row during module initialisation instead of
 * silently falling back to English.
 */
function auditTranslationEntries(entries: readonly string[]): Record<string, string> {
  const keys = Object.keys(DEPLOYMENT_AUDIT_STRINGS);
  if (entries.length !== keys.length) {
    throw new Error(`Deployment audit translation has ${entries.length} entries; expected ${keys.length}.`);
  }
  return Object.fromEntries(keys.map((key, index) => [key, entries[index]]));
}

const DEPLOYMENT_AUDIT_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: DEPLOYMENT_AUDIT_STRINGS,
  es: DEPLOYMENT_AUDIT_ES,
  id: auditTranslationEntries([
    "{count} baris", "Tidak didukung", "Didukung", "Belum ada Dockerfile", "Orang lain menyimpan versi Dockerfile yang berbeda saat Anda mengedit — perubahan Anda di bawah TIDAK disimpan.", "Isi saat ini di server adalah:", "File itu dihapus di server.", "Suntingan Anda di bawah tidak berubah. Bandingkan dengan isi saat ini di atas, selaraskan secara manual, lalu Simpan lagi.", "Muat versi saat ini", "Tersedia dari terminal", "Berjalan di host statis apa pun, termasuk yang gratis. Tidak ada yang dinamis yang bertahan setelah ekspor.", "Lihat detail Situs Statis", "Belum terhubung", "Memerlukan host untuk berjalan — penyiapan penyedia direncanakan, tetapi belum terhubung.", "Lihat detail Situs Lengkap", "Diatur", "Rute", "berhasil", "gagal", "Ditulis ke", "Rute gagal", "Aset gagal", "Tovu menulis setiap pos yang diterbitkan, halaman utama, produk, dan halaman tema ke dalam folder yang Anda namai.", "Salin perintah ekspor", "Ganti <dir> dengan folder tujuan penulisan. Ini argumen wajib — tidak ada nilai bawaan.", "Timpa file yang ada di folder keluaran", "Nonaktif secara bawaan. Pengekspor menolak menulis ke folder yang tidak kosong kecuali ini dicentang — ia tidak pernah menghapus file yang tidak dikenal secara diam-diam.", "Mengekspor…", "Memeriksa…", "Membawanya online", "Ekspor hanyalah folder berisi file. Pilih tujuannya, lalu publikasikan langsung dari sini.", "Target publikasi", "Terhubung", "Perlu menyimpan lebih dari satu token, mengganti namanya, atau mengelola semua kredensial tersimpan di satu tempat?", "Buat token akses", "Memuat kredensial…", "ID akun", "Verifikasi", "Memverifikasi…", "Token tersimpan mana yang menerbitkan", "Ruang kerja ini memiliki lebih dari satu", "token tersimpan. Pilih token yang digunakan Tovu untuk menerbitkan.", "Repositori", "Menerbitkan…", "Ini langsung aktif di internet publik setelah selesai — tidak ada tahap draf atau peninjauan.", "Tujuan publikasi ini", "Akun di atas hanya membuktikan bahwa Anda diizinkan menerbitkan — ini menjelaskan tepatnya tujuan publikasi ini.", "Jalur dasar", "Tidak ada — disajikan dari akar domain", "Kredensial", "Diterbitkan:"
  ]),
  de: auditTranslationEntries([
    "{count} Zeilen", "Nicht unterstützt", "Unterstützt", "Noch kein Dockerfile", "Während Sie dieses Dockerfile bearbeitet haben, hat jemand anderes eine andere Version gespeichert — Ihre Änderungen unten wurden NICHT gespeichert.", "Der aktuelle Inhalt auf dem Server ist:", "Es wurde auf dem Server gelöscht.", "Ihre eigenen Änderungen unten sind unverändert. Vergleichen Sie sie mit dem aktuellen Inhalt oben, führen Sie sie von Hand zusammen und speichern Sie dann erneut.", "Aktuelle Version laden", "Über ein Terminal verfügbar", "Läuft auf jedem statischen Host, auch auf kostenlosen. Beim Export bleibt nichts Dynamisches erhalten.", "Details der statischen Website anzeigen", "Noch nicht verbunden", "Benötigt einen Host zum Ausführen — die Anbieter-Einrichtung ist geplant, aber noch nicht verbunden.", "Details der vollständigen Website anzeigen", "Festgelegt", "Routen", "erfolgreich", "fehlgeschlagen", "Geschrieben nach", "Fehlgeschlagene Routen", "Fehlgeschlagene Assets", "Tovu schreibt jeden veröffentlichten Beitrag, die Startseite, Produkte und Themenseiten in den von Ihnen benannten Ordner.", "Exportbefehl kopieren", "Ersetzen Sie <dir> durch den Ordner, in den geschrieben werden soll. Dies ist ein Pflichtargument — es gibt keinen Standardwert.", "Vorhandene Dateien im Ausgabeordner überschreiben", "Standardmäßig aus. Der Exporter weigert sich, in einen nicht leeren Ordner zu schreiben, solange dies nicht aktiviert ist — unbekannte Dateien werden niemals stillschweigend gelöscht.", "Wird exportiert…", "Wird geprüft…", "Online bringen", "Der Export ist nur ein Ordner mit Dateien. Wähle das Ziel und veröffentliche ihn direkt von hier.", "Veröffentlichungsziel", "Verbunden", "Möchten Sie mehr als einen Token speichern, einen umbenennen oder alle gespeicherten Zugangsdaten an einem Ort verwalten?", "Zugriffstoken erstellen", "Zugangsdaten werden geladen…", "Konto-ID", "Überprüfen", "Wird überprüft…", "Welcher gespeicherte Token veröffentlicht", "Dieser Arbeitsbereich hat mehr als einen gespeicherten", "Token. Wählen Sie, welchen Tovu zum Veröffentlichen verwendet.", "Repository", "Wird veröffentlicht…", "Sobald dies fertig ist, ist es sofort im öffentlichen Internet verfügbar — es gibt keinen Entwurfs- oder Prüfschritt.", "Wohin diese Veröffentlichung geht", "Das Konto oben beweist nur, dass Sie veröffentlichen dürfen — dies zeigt genau, wohin diese Veröffentlichung geht.", "Basispfad", "Keiner — wird vom Stammverzeichnis der Domain bereitgestellt", "Zugangsdaten", "Veröffentlicht:"
  ]),
  fr: auditTranslationEntries([
    "{count} lignes", "Non pris en charge", "Pris en charge", "Pas encore de Dockerfile", "Quelqu’un d’autre a enregistré une version différente de ce Dockerfile pendant que vous le modifiiez — vos modifications ci-dessous n’ont PAS été enregistrées.", "Son contenu actuel sur le serveur est :", "Il a été supprimé sur le serveur.", "Vos propres modifications ci-dessous sont intactes. Comparez-les au contenu actuel ci-dessus, réconciliez-les à la main, puis enregistrez à nouveau.", "Charger la version actuelle", "Disponible depuis un terminal", "Fonctionne sur n’importe quel hébergeur statique, y compris gratuit. Rien de dynamique ne survit à l’exportation.", "Voir les détails du site statique", "Pas encore connecté", "Nécessite un hébergeur pour fonctionner — la configuration du fournisseur est prévue, mais pas encore connectée.", "Voir les détails du site complet", "Défini", "Routes", "réussi", "échoué", "Écrit dans", "Routes échouées", "Ressources échouées", "Tovu écrit chaque publication, la page d’accueil, les produits et les pages de thème publiés dans le dossier que vous indiquez.", "Copier la commande d’exportation", "Remplacez <dir> par le dossier dans lequel écrire. C’est un argument obligatoire — il n’y a pas de valeur par défaut.", "Écraser les fichiers existants dans le dossier de sortie", "Désactivé par défaut. L’exportateur refuse d’écrire dans un dossier non vide sauf si cette option est cochée — il ne supprime jamais silencieusement des fichiers inconnus.", "Exportation…", "Vérification…", "Mettre en ligne", "L'export n'est qu'un dossier de fichiers. Choisissez sa destination, puis publiez-le directement d'ici.", "Cible de publication", "Connecté", "Besoin d’enregistrer plus d’un jeton, d’en renommer un ou de gérer tous les identifiants enregistrés au même endroit ?", "Créer un jeton d’accès", "Chargement des identifiants…", "ID de compte", "Vérifier", "Vérification…", "Quel jeton enregistré publie", "Cet espace de travail contient plus d’un", "jeton enregistré. Choisissez celui que Tovu utilise pour publier.", "Dépôt", "Publication…", "Ce sera immédiatement en ligne sur Internet public une fois terminé — il n’y a aucune étape de brouillon ou de révision.", "Où va cette publication", "Le compte ci-dessus prouve seulement que vous êtes autorisé à publier — ceci indique exactement où va celle-ci.", "Chemin de base", "Aucun — servi depuis la racine du domaine", "Identifiant", "Publié :"
  ]),
  it: auditTranslationEntries([
    "{count} righe", "Non supportato", "Supportato", "Nessun Dockerfile ancora", "Qualcun altro ha salvato una versione diversa di questo Dockerfile mentre lo modificavi — le modifiche qui sotto NON sono state salvate.", "Il contenuto attuale sul server è:", "È stato eliminato sul server.", "Le tue modifiche qui sotto sono intatte. Confrontale con il contenuto attuale sopra, riconciliale a mano, quindi salva di nuovo.", "Carica la versione attuale", "Disponibile da un terminale", "Funziona su qualsiasi host statico, inclusi quelli gratuiti. Nulla di dinamico sopravvive all’esportazione.", "Visualizza i dettagli del sito statico", "Non ancora collegato", "Richiede un host su cui eseguire — la configurazione del provider è pianificata, ma non ancora collegata.", "Visualizza i dettagli del sito completo", "Impostato", "Percorsi", "riuscito", "non riuscito", "Scritto in", "Percorsi non riusciti", "Risorse non riuscite", "Tovu scrive ogni post pubblicato, la home page, i prodotti e le pagine del tema nella cartella che indichi.", "Copia il comando di esportazione", "Sostituisci <dir> con la cartella in cui scrivere. È un argomento obbligatorio — non esiste un valore predefinito.", "Sovrascrivi i file esistenti nella cartella di output", "Disattivato per impostazione predefinita. L’esportatore rifiuta di scrivere in una cartella non vuota a meno che questa opzione non sia selezionata — non elimina mai silenziosamente file sconosciuti.", "Esportazione…", "Verifica…", "Mettilo online", "L'esportazione è solo una cartella di file. Scegli dove va, poi pubblicala direttamente da qui.", "Destinazione di pubblicazione", "Connesso", "Devi salvare più di un token, rinominarne uno o gestire tutte le credenziali salvate in un unico posto?", "Crea token di accesso", "Caricamento credenziali…", "ID account", "Verifica", "Verifica in corso…", "Quale token salvato pubblica", "Questo spazio di lavoro ha più di un", "token salvato. Scegli quale usa Tovu per pubblicare.", "Repository", "Pubblicazione…", "Sarà immediatamente online su Internet pubblico al termine — non esiste una fase di bozza o revisione.", "Dove va questa pubblicazione", "L’account sopra dimostra solo che puoi pubblicare — questo indica esattamente dove va questa pubblicazione.", "Percorso di base", "Nessuno — servito dalla radice del dominio", "Credenziale", "Pubblicato:"
  ]),
  "pt-BR": auditTranslationEntries([
    "{count} linhas", "Não compatível", "Compatível", "Ainda não há Dockerfile", "Outra pessoa salvou uma versão diferente deste Dockerfile enquanto você editava — suas alterações abaixo NÃO foram salvas.", "O conteúdo atual no servidor é:", "Ele foi excluído no servidor.", "Suas próprias edições abaixo permanecem intactas. Compare-as com o conteúdo atual acima, reconcilie manualmente e salve novamente.", "Carregar a versão atual", "Disponível em um terminal", "Funciona em qualquer hospedagem estática, inclusive gratuita. Nada dinâmico sobrevive à exportação.", "Ver detalhes do site estático", "Ainda não conectado", "Precisa de uma hospedagem para executar — a configuração do provedor está planejada, mas ainda não está conectada.", "Ver detalhes do site completo", "Definido", "Rotas", "bem-sucedido", "falhou", "Gravado em", "Rotas com falha", "Recursos com falha", "O Tovu grava cada post publicado, a página inicial, os produtos e as páginas do tema na pasta que você nomear.", "Copiar o comando de exportação", "Substitua <dir> pela pasta onde gravar. É um argumento obrigatório — não há padrão.", "Substituir arquivos existentes na pasta de saída", "Desativado por padrão. O exportador se recusa a gravar em uma pasta não vazia a menos que isto seja marcado — ele nunca exclui arquivos desconhecidos silenciosamente.", "Exportando…", "Verificando…", "Colocar online", "A exportação é só uma pasta de arquivos. Escolha para onde vai e publique direto daqui.", "Destino de publicação", "Conectado", "Precisa salvar mais de um token, renomear um ou gerenciar todas as credenciais salvas em um só lugar?", "Criar token de acesso", "Carregando credenciais…", "ID da conta", "Verificar", "Verificando…", "Qual token salvo publica", "Este espaço de trabalho tem mais de um", "token salvo. Escolha qual o Tovu usa para publicar.", "Repositório", "Publicando…", "Isto fica imediatamente ativo na internet pública quando termina — não há etapa de rascunho ou revisão.", "Para onde vai esta publicação", "A conta acima apenas prova que você tem permissão para publicar — isto informa exatamente para onde esta publicação vai.", "Caminho base", "Nenhum — servido a partir da raiz do domínio", "Credencial", "Publicado:"
  ]),
  "zh-CN": auditTranslationEntries([
    "{count} 行", "不支持", "支持", "尚无 Dockerfile", "您编辑此 Dockerfile 时，其他人保存了不同版本——您下方的更改未保存。", "服务器上的当前内容为：", "它已在服务器上删除。", "您下方的编辑未受影响。请与上方当前内容比较，手动协调后再次保存。", "加载当前版本", "可在终端中使用", "可在任何静态主机上运行，包括免费主机。导出后不会保留任何动态内容。", "查看静态站点详情", "尚未连接", "需要主机才能运行——已计划配置提供商，但尚未连接。", "查看完整站点详情", "已设置", "路由", "成功", "失败", "写入到", "失败的路由", "失败的资源", "Tovu 会将每篇已发布文章、主页、产品和主题页面写入您指定的文件夹。", "复制导出命令", "将 <dir> 替换为要写入的文件夹。这是必填参数——没有默认值。", "覆盖输出文件夹中的现有文件", "默认关闭。除非选中此项，否则导出器拒绝写入非空文件夹——它绝不会悄悄删除未知文件。", "正在导出…", "正在检查…", "上线发布", "导出只是一个文件夹。选择发布位置，然后直接在这里发布。", "发布目标", "已连接", "需要保存多个令牌、重命名令牌，或在一处管理所有已保存凭据？", "创建访问令牌", "正在加载凭据…", "账户 ID", "验证", "正在验证…", "哪个已保存令牌用于发布", "此工作区保存了多个", "令牌。请选择 Tovu 用于发布的令牌。", "仓库", "正在发布…", "完成后会立即在公共互联网上上线——没有草稿或审核步骤。", "此次发布的去向", "上方账户仅证明您有发布权限——这里明确说明此次发布的确切去向。", "基础路径", "无——从域名根目录提供服务", "凭据", "已发布："
  ]),
  "zh-TW": auditTranslationEntries([
    "{count} 行", "不支援", "支援", "尚無 Dockerfile", "您編輯此 Dockerfile 時，其他人儲存了不同版本——您下方的變更未儲存。", "伺服器上的目前內容為：", "它已在伺服器上刪除。", "您下方的編輯未受影響。請與上方目前內容比較，手動協調後再次儲存。", "載入目前版本", "可從終端機使用", "可在任何靜態主機上執行，包括免費主機。匯出後不會保留任何動態內容。", "檢視靜態網站詳細資料", "尚未連線", "需要主機才能執行——已規劃設定供應商，但尚未連線。", "檢視完整網站詳細資料", "已設定", "路由", "成功", "失敗", "寫入至", "失敗的路由", "失敗的資源", "Tovu 會將每篇已發佈文章、首頁、產品和佈景主題頁面寫入您指定的資料夾。", "複製匯出命令", "將 <dir> 替換為要寫入的資料夾。這是必要引數——沒有預設值。", "覆寫輸出資料夾中的現有檔案", "預設為關閉。除非勾選此項，否則匯出工具會拒絕寫入非空資料夾——它絕不會悄悄刪除未知檔案。", "正在匯出…", "正在檢查…", "上線發佈", "匯出只是一個資料夾。選擇發布位置，然後直接在這裡發布。", "發佈目標", "已連線", "需要儲存多個權杖、重新命名權杖，或在一處管理所有已儲存憑證嗎？", "建立存取權杖", "正在載入憑證…", "帳戶 ID", "驗證", "正在驗證…", "哪個已儲存權杖用於發佈", "此工作區儲存了多個", "權杖。請選擇 Tovu 用於發佈的權杖。", "儲存庫", "正在發佈…", "完成後會立即在公開網際網路上線——沒有草稿或審核步驟。", "此次發佈的去向", "上方帳戶僅證明您有發佈權限——這裡明確說明此次發佈的確切去向。", "基礎路徑", "無——從網域根目錄提供服務", "憑證", "已發佈："
  ]),
  ja: auditTranslationEntries([
    "{count} 行", "非対応", "対応", "Dockerfile はまだありません", "編集中に別のユーザーがこの Dockerfile の別バージョンを保存しました。下の変更は保存されていません。", "サーバー上の現在の内容:", "サーバー上で削除されました。", "下の編集内容はそのままです。上の現在の内容と比較して手動で調整し、もう一度保存してください。", "現在のバージョンを読み込む", "ターミナルから利用可能", "無料のものを含む任意の静的ホストで動作します。エクスポート後に動的な機能は残りません。", "静的サイトの詳細を見る", "まだ接続されていません", "実行するにはホストが必要です。プロバイダー設定は予定されていますが、まだ接続されていません。", "完全なサイトの詳細を見る", "設定済み", "ルート", "成功", "失敗", "書き込み先", "失敗したルート", "失敗したアセット", "Tovu は公開済みの各投稿、ホームページ、商品、テーマページを指定したフォルダーに書き出します。", "エクスポートコマンドをコピー", "<dir> を書き込み先フォルダーに置き換えてください。必須の引数で、既定値はありません。", "出力フォルダー内の既存ファイルを上書きする", "既定ではオフです。これを選択しない限り、エクスポーターは空でないフォルダーへの書き込みを拒否します。不明なファイルを黙って削除することはありません。", "エクスポート中…", "確認中…", "オンラインにする", "エクスポートはファイルのフォルダーにすぎません。公開先を選び、ここから直接公開します。", "公開先", "接続済み", "複数のトークンを保存、名前変更、または保存済み資格情報を一か所で管理しますか？", "アクセストークンを作成", "資格情報を読み込み中…", "アカウント ID", "検証", "検証中…", "どの保存済みトークンで公開するか", "このワークスペースには複数の保存済み", "トークンがあります。Tovu が公開に使うものを選んでください。", "リポジトリ", "公開中…", "完了するとすぐに公開インターネット上で公開されます。下書きやレビューの手順はありません。", "この公開先", "上のアカウントは公開の権限を示すだけです。ここでは今回の公開先を正確に指定します。", "ベースパス", "なし — ドメインのルートから提供", "資格情報", "公開済み:"
  ]),
  ko: auditTranslationEntries([
    "{count}줄", "지원되지 않음", "지원됨", "Dockerfile이 아직 없습니다", "편집하는 동안 다른 사용자가 이 Dockerfile의 다른 버전을 저장했습니다. 아래 변경 사항은 저장되지 않았습니다.", "서버의 현재 내용:", "서버에서 삭제되었습니다.", "아래의 편집 내용은 그대로입니다. 위의 현재 내용과 비교하여 수동으로 조정한 후 다시 저장하세요.", "현재 버전 불러오기", "터미널에서 사용 가능", "무료 호스트를 포함한 모든 정적 호스트에서 실행됩니다. 내보낸 뒤에는 동적 기능이 남지 않습니다.", "정적 사이트 세부 정보 보기", "아직 연결되지 않음", "실행하려면 호스트가 필요합니다. 제공업체 설정은 계획되어 있지만 아직 연결되지 않았습니다.", "전체 사이트 세부 정보 보기", "설정됨", "경로", "성공", "실패", "작성 위치", "실패한 경로", "실패한 자산", "Tovu는 게시된 모든 글, 홈 페이지, 제품 및 테마 페이지를 지정한 폴더에 씁니다.", "내보내기 명령 복사", "<dir>을 쓸 폴더로 바꾸세요. 필수 인수이며 기본값은 없습니다.", "출력 폴더의 기존 파일 덮어쓰기", "기본적으로 꺼져 있습니다. 이를 선택하지 않으면 내보내기가 비어 있지 않은 폴더에 쓰기를 거부하며, 알 수 없는 파일을 조용히 삭제하지 않습니다.", "내보내는 중…", "확인 중…", "온라인으로 게시", "내보내기는 파일 폴더일 뿐입니다. 게시할 곳을 고른 다음 여기서 바로 게시하세요.", "게시 대상", "연결됨", "토큰을 둘 이상 저장하거나 이름을 바꾸거나, 저장된 모든 자격 증명을 한 곳에서 관리해야 하나요?", "액세스 토큰 만들기", "자격 증명 불러오는 중…", "계정 ID", "확인", "확인 중…", "어떤 저장된 토큰으로 게시할지", "이 작업 공간에는 저장된", "토큰이 둘 이상 있습니다. Tovu가 게시에 사용할 토큰을 선택하세요.", "리포지토리", "게시 중…", "완료되면 즉시 공개 인터넷에 게시됩니다. 초안이나 검토 단계는 없습니다.", "이번 게시의 대상", "위 계정은 게시 권한이 있음을 증명할 뿐입니다. 여기에서 이번 게시가 정확히 어디로 가는지 지정합니다.", "기본 경로", "없음 — 도메인 루트에서 제공", "자격 증명", "게시됨:"
  ]),
  ru: auditTranslationEntries([
    "{count} строк", "Не поддерживается", "Поддерживается", "Dockerfile пока нет", "Кто-то другой сохранил другую версию этого Dockerfile, пока вы его редактировали, — ваши изменения ниже НЕ сохранены.", "Текущее содержимое на сервере:", "Он был удалён на сервере.", "Ваши правки ниже не тронуты. Сравните их с текущим содержимым выше, согласуйте вручную и снова нажмите «Сохранить».", "Загрузить текущую версию", "Доступно из терминала", "Работает на любом статическом хостинге, включая бесплатные. Ничего динамического после экспорта не остаётся.", "Подробнее о статическом сайте", "Пока не подключено", "Нужен хостинг для запуска — настройка провайдера запланирована, но пока не подключена.", "Подробнее о полном сайте", "Задана", "Маршруты", "успешно", "с ошибкой", "Записано в", "Маршруты с ошибкой", "Ресурсы с ошибкой", "Tovu записывает каждую опубликованную запись, главную страницу, товары и страницы темы в указанную вами папку.", "Скопировать команду экспорта", "Замените <dir> папкой для записи. Это обязательный аргумент — значения по умолчанию нет.", "Перезаписывать существующие файлы в папке вывода", "По умолчанию выключено. Экспорт не пишет в непустую папку, если этот флажок не установлен, — и никогда молча не удаляет незнакомые файлы.", "Экспорт…", "Проверка…", "Публикация в интернете", "Экспорт — это просто папка с файлами. Выберите, куда она пойдёт, и публикуйте прямо отсюда.", "Куда публиковать", "Подключено", "Нужно сохранить несколько токенов, переименовать токен или управлять всеми сохранёнными учётными данными в одном месте?", "Создать токен доступа", "Загрузка учётных данных…", "ID аккаунта", "Проверить", "Проверка…", "Каким сохранённым токеном публиковать", "В этом рабочем пространстве несколько сохранённых токенов", "— выберите, каким из них Tovu публикует.", "Репозиторий", "Публикация…", "Сразу после завершения это будет доступно всем в интернете — черновика или проверки нет.", "Куда идёт эта публикация", "Аккаунт выше лишь подтверждает, что вам можно публиковать, — здесь указано, куда именно идёт эта публикация.", "Базовый путь", "Нет — с корня домена", "Учётные данные", "Опубликовано:"
  ]),
  fa: auditTranslationEntries([
    "{count} خط", "پشتیبانی نمی‌شود", "پشتیبانی می‌شود", "هنوز Dockerfile وجود ندارد", "شخص دیگری هنگام ویرایش شما نسخهٔ دیگری از این Dockerfile را ذخیره کرد — تغییرات شما در پایین ذخیره نشدند.", "محتوای فعلی آن روی سرور:", "روی سرور حذف شد.", "ویرایش‌های شما در پایین دست‌نخورده‌اند. آن‌ها را با محتوای فعلی بالا مقایسه کنید، به‌صورت دستی هماهنگ کنید و دوباره ذخیره کنید.", "بارگیری نسخهٔ فعلی", "از طریق ترمینال در دسترس است", "روی هر میزبان ایستا، حتی رایگان، اجرا می‌شود. هیچ بخش پویایی پس از خروجی‌گیری باقی نمی‌ماند.", "مشاهدهٔ جزئیات سایت ایستا", "هنوز راه‌اندازی نشده", "برای اجرا به یک میزبان نیاز دارد — راه‌اندازی ارائه‌دهنده برنامه‌ریزی شده اما هنوز راه‌اندازی نشده است.", "مشاهدهٔ جزئیات سایت کامل", "تنظیم شده", "مسیرها", "موفق", "ناموفق", "نوشته شد در", "مسیرهای ناموفق", "فایل‌های ناموفق", "Tovu هر نوشتهٔ منتشرشده، صفحهٔ اصلی، محصولات و صفحه‌های پوسته را در پوشه‌ای که نام می‌برید می‌نویسد.", "کپی فرمان خروجی‌گیری", "به‌جای <dir> پوشهٔ مقصد را بنویسید. این آرگومان الزامی است — مقدار پیش‌فرض ندارد.", "بازنویسی فایل‌های موجود در پوشهٔ خروجی", "به‌طور پیش‌فرض خاموش است. تا این گزینه تیک نخورد، خروجی‌گیر در پوشهٔ غیرخالی نمی‌نویسد — و هرگز فایل‌های ناشناخته را بی‌صدا حذف نمی‌کند.", "در حال خروجی‌گیری…", "در حال بررسی…", "آنلاین کردن آن", "خروجی فقط یک پوشه از فایل‌هاست. مقصد را انتخاب کنید و مستقیم از همین‌جا منتشر کنید.", "مقصد انتشار", "متصل", "می‌خواهید بیش از یک توکن ذخیره کنید، نام یکی را عوض کنید یا همهٔ اعتبارنامه‌های ذخیره‌شده را یک‌جا مدیریت کنید؟", "ساخت توکن دسترسی", "در حال بارگیری اعتبارنامه‌ها…", "شناسهٔ حساب", "بررسی", "در حال بررسی…", "کدام توکن ذخیره‌شده منتشر می‌کند", "این فضای کاری بیش از یک توکن ذخیره‌شدهٔ", "دارد. انتخاب کنید Tovu با کدام منتشر کند.", "مخزن", "در حال انتشار…", "به‌محض پایان، این بلافاصله روی اینترنت عمومی در دسترس است — پیش‌نویس یا مرحلهٔ بازبینی ندارد.", "مقصد این انتشار", "حساب بالا فقط نشان می‌دهد که اجازهٔ انتشار دارید — این‌جا دقیقاً می‌گوید این انتشار کجا می‌رود.", "مسیر پایه", "هیچ — از ریشهٔ دامنه ارائه می‌شود", "اعتبارنامه", "منتشر شد:"
  ]),
  ar: auditTranslationEntries([
    "{count} سطر", "غير مدعوم", "مدعوم", "لا يوجد Dockerfile بعد", "حفظ شخص آخر نسخة مختلفة من ملف Dockerfile هذا أثناء تحريرك — لم تُحفظ تغييراتك أدناه.", "محتواه الحالي على الخادم:", "حُذف على الخادم.", "تعديلاتك أدناه لم تُمس. قارنها بالمحتوى الحالي أعلاه، ووفّق بينها يدويًا، ثم احفظ مجددًا.", "تحميل النسخة الحالية", "متاح من الطرفية", "يعمل على أي استضافة ثابتة، بما فيها المجانية. لا يبقى أي محتوى ديناميكي بعد التصدير.", "عرض تفاصيل الموقع الثابت", "غير موصول بعد", "يحتاج إلى استضافة ليعمل — إعداد المزوّد مخطط له لكنه غير موصول بعد.", "عرض تفاصيل الموقع الكامل", "مُعيَّن", "المسارات", "نجحت", "فشلت", "كُتب في", "المسارات الفاشلة", "الملفات الفاشلة", "يكتب Tovu كل منشور منشور والصفحة الرئيسية والمنتجات وصفحات السمة في المجلد الذي تحدده.", "نسخ أمر التصدير", "استبدل <dir> بالمجلد الذي تريد الكتابة فيه. إنه وسيط مطلوب — لا توجد قيمة افتراضية.", "الكتابة فوق الملفات الموجودة في مجلد الإخراج", "مُعطّل افتراضيًا. يرفض المُصدِّر الكتابة في مجلد غير فارغ ما لم يُحدَّد هذا — ولا يحذف أبدًا ملفات غير معروفة بصمت.", "جارٍ التصدير…", "جارٍ التحقق…", "نشره على الإنترنت", "التصدير مجرد مجلد من الملفات. اختر وجهته ثم انشر مباشرة من هنا.", "وجهة النشر", "متصل", "هل تحتاج إلى حفظ أكثر من رمز، أو إعادة تسمية أحدها، أو إدارة كل بيانات الاعتماد المحفوظة في مكان واحد؟", "إنشاء رمز وصول", "جارٍ تحميل بيانات الاعتماد…", "معرّف الحساب", "تحقق", "جارٍ التحقق…", "أي رمز محفوظ ينشر", "تحتوي مساحة العمل هذه على أكثر من رمز محفوظ لـ", "— اختر الرمز الذي ينشر به Tovu.", "المستودع", "جارٍ النشر…", "سيصبح هذا متاحًا فورًا على الإنترنت العام بمجرد انتهائه — لا توجد مسودة ولا خطوة مراجعة.", "وجهة هذا النشر", "الحساب أعلاه يثبت فقط أنه مسموح لك بالنشر — وهنا تحديد وجهة هذا النشر بالضبط.", "المسار الأساسي", "لا شيء — يُقدَّم من جذر النطاق", "بيانات الاعتماد", "نُشر:"
  ]),
  pl: auditTranslationEntries([
    "{count} wierszy", "Nieobsługiwane", "Obsługiwane", "Brak pliku Dockerfile", "Ktoś inny zapisał inną wersję tego pliku Dockerfile, gdy go edytowałeś — Twoje zmiany poniżej NIE zostały zapisane.", "Jego obecna zawartość na serwerze:", "Został usunięty na serwerze.", "Twoje zmiany poniżej są nietknięte. Porównaj je z obecną zawartością powyżej, uzgodnij ręcznie i zapisz ponownie.", "Wczytaj obecną wersję", "Dostępne z terminala", "Działa na każdym hostingu statycznym, także darmowym. Nic dynamicznego nie przetrwa eksportu.", "Zobacz szczegóły strony statycznej", "Jeszcze niepodłączone", "Wymaga hostingu — konfiguracja dostawcy jest planowana, ale jeszcze niepodłączona.", "Zobacz szczegóły pełnej strony", "Ustawiona", "Trasy", "udane", "nieudane", "Zapisano w", "Nieudane trasy", "Nieudane zasoby", "Tovu zapisuje każdy opublikowany wpis, stronę główną, produkty i strony motywu w folderze, który wskażesz.", "Kopiuj polecenie eksportu", "Zastąp <dir> folderem docelowym. To wymagany argument — nie ma wartości domyślnej.", "Nadpisz istniejące pliki w folderze wyjściowym", "Domyślnie wyłączone. Eksport nie zapisze do niepustego folderu, dopóki tego nie zaznaczysz — i nigdy po cichu nie usuwa nieznanych plików.", "Eksportowanie…", "Sprawdzanie…", "Publikacja w sieci", "Eksport to po prostu folder z plikami. Wybierz, gdzie trafi, i publikuj prosto stąd.", "Cel publikacji", "Połączono", "Chcesz zapisać więcej niż jeden token, zmienić nazwę tokena lub zarządzać wszystkimi zapisanymi danymi logowania w jednym miejscu?", "Utwórz token dostępu", "Wczytywanie danych logowania…", "ID konta", "Sprawdź", "Sprawdzanie…", "Którym zapisanym tokenem publikować", "Ten obszar roboczy ma więcej niż jeden zapisany token", "— wybierz, którym Tovu ma publikować.", "Repozytorium", "Publikowanie…", "Po zakończeniu będzie to od razu publicznie dostępne w internecie — nie ma wersji roboczej ani przeglądu.", "Dokąd trafia ta publikacja", "Konto powyżej potwierdza tylko, że możesz publikować — tu widać, dokąd dokładnie trafia ta publikacja.", "Ścieżka bazowa", "Brak — serwowane z katalogu głównego domeny", "Dane logowania", "Opublikowano:"
  ]),
  hu: auditTranslationEntries([
    "{count} sor", "Nem támogatott", "Támogatott", "Még nincs Dockerfile", "Valaki más elmentette a Dockerfile egy másik változatát, miközben szerkesztette — az alábbi módosításai NEM lettek mentve.", "A jelenlegi tartalma a szerveren:", "A szerveren törölték.", "Az alábbi módosításai érintetlenek. Vesse össze őket a fenti jelenlegi tartalommal, egyeztesse kézzel, majd mentse újra.", "A jelenlegi változat betöltése", "Terminálból érhető el", "Bármilyen statikus tárhelyen fut, az ingyeneseken is. Semmi dinamikus nem éli túl az exportot.", "A statikus oldal részletei", "Még nincs bekötve", "Futtatáshoz tárhely kell — a szolgáltató beállítása tervben van, de még nincs bekötve.", "A teljes oldal részletei", "Beállítva", "Útvonalak", "sikeres", "sikertelen", "Ide írva", "Sikertelen útvonalak", "Sikertelen fájlok", "A Tovu minden közzétett bejegyzést, a kezdőlapot, a termékeket és a téma oldalait a megadott mappába írja.", "Az exportparancs másolása", "Cserélje a <dir> részt a célmappára. Kötelező argumentum — nincs alapértéke.", "A kimeneti mappában lévő fájlok felülírása", "Alapból ki van kapcsolva. Az exportáló nem ír nem üres mappába, amíg ezt be nem jelöli — és ismeretlen fájlokat soha nem töröl csendben.", "Exportálás…", "Ellenőrzés…", "Közzététel az interneten", "Az export csak egy mappa fájlokkal. Válassza ki, hová kerüljön, és tegye közzé innen.", "Közzététel célja", "Csatlakoztatva", "Több tokent mentene, átnevezne egyet, vagy minden mentett hitelesítő adatot egy helyen kezelne?", "Hozzáférési token létrehozása", "Hitelesítő adatok betöltése…", "Fiókazonosító", "Ellenőrzés", "Ellenőrzés…", "Melyik mentett token tesz közzé", "Ebben a munkaterületben több mentett", "token van. Válassza ki, melyikkel tegyen közzé a Tovu.", "Tároló", "Közzététel…", "Amint elkészül, azonnal elérhető a nyilvános interneten — nincs piszkozat vagy ellenőrzési lépés.", "Hová kerül ez a közzététel", "A fenti fiók csak azt igazolja, hogy közzétehet — ez pontosan megmondja, hová kerül ez a közzététel.", "Alapútvonal", "Nincs — a domain gyökeréből szolgálja ki", "Hitelesítő adat", "Közzétéve:"
  ]),
  uk: auditTranslationEntries([
    "{count} рядків", "Не підтримується", "Підтримується", "Dockerfile ще немає", "Хтось інший зберіг іншу версію цього Dockerfile, поки ви його редагували, — ваші зміни нижче НЕ збережено.", "Його поточний вміст на сервері:", "Його видалено на сервері.", "Ваші правки нижче не змінено. Порівняйте їх із поточним вмістом вище, узгодьте вручну й знову збережіть.", "Завантажити поточну версію", "Доступно з термінала", "Працює на будь-якому статичному хостингу, зокрема безкоштовному. Нічого динамічного після експорту не лишається.", "Докладніше про статичний сайт", "Ще не підключено", "Потрібен хостинг для запуску — налаштування постачальника заплановано, але ще не підключено.", "Докладніше про повний сайт", "Задано", "Маршрути", "успішно", "з помилкою", "Записано в", "Маршрути з помилкою", "Ресурси з помилкою", "Tovu записує кожен опублікований допис, головну сторінку, товари та сторінки теми у вказану вами теку.", "Копіювати команду експорту", "Замініть <dir> текою для запису. Це обов’язковий аргумент — типового значення немає.", "Перезаписувати наявні файли в теці виводу", "Типово вимкнено. Експорт не пише в непорожню теку, доки це не позначено, — і ніколи мовчки не видаляє невідомі файли.", "Експорт…", "Перевірка…", "Публікація в інтернеті", "Експорт — це просто тека з файлами. Виберіть, куди її розмістити, і публікуйте просто звідси.", "Куди публікувати", "Підключено", "Потрібно зберегти кілька токенів, перейменувати токен або керувати всіма збереженими обліковими даними в одному місці?", "Створити токен доступу", "Завантаження облікових даних…", "ID облікового запису", "Перевірити", "Перевірка…", "Яким збереженим токеном публікувати", "У цьому робочому просторі кілька збережених токенів", "— виберіть, яким із них Tovu публікує.", "Репозиторій", "Публікація…", "Щойно завершиться, це одразу стане доступним у публічному інтернеті — чернетки чи перевірки немає.", "Куди йде ця публікація", "Обліковий запис вище лише підтверджує, що вам можна публікувати, — тут указано, куди саме йде ця публікація.", "Базовий шлях", "Немає — з кореня домену", "Облікові дані", "Опубліковано:"
  ]),
  tr: auditTranslationEntries([
    "{count} satır", "Desteklenmiyor", "Destekleniyor", "Henüz Dockerfile yok", "Siz düzenlerken başka biri bu Dockerfile'ın farklı bir sürümünü kaydetti — aşağıdaki değişiklikleriniz KAYDEDİLMEDİ.", "Sunucudaki mevcut içeriği:", "Sunucuda silindi.", "Aşağıdaki düzenlemeleriniz değişmedi. Yukarıdaki mevcut içerikle karşılaştırın, elle uzlaştırın ve yeniden kaydedin.", "Mevcut sürümü yükle", "Terminalden kullanılabilir", "Ücretsizler dahil her statik barındırıcıda çalışır. Dışa aktarmada dinamik hiçbir şey kalmaz.", "Statik Site ayrıntılarını gör", "Henüz bağlanmadı", "Çalışmak için bir barındırıcı gerekir — sağlayıcı kurulumu planlandı ama henüz bağlanmadı.", "Tam Site ayrıntılarını gör", "Ayarlı", "Yollar", "başarılı", "başarısız", "Yazıldığı yer", "Başarısız yollar", "Başarısız dosyalar", "Tovu yayımlanan her gönderiyi, ana sayfayı, ürünleri ve tema sayfalarını belirttiğiniz klasöre yazar.", "Dışa aktarma komutunu kopyala", "<dir> yerine yazılacak klasörü koyun. Zorunlu bir argümandır — varsayılanı yoktur.", "Çıktı klasöründeki mevcut dosyaların üzerine yaz", "Varsayılan olarak kapalı. Bu işaretlenmedikçe dışa aktarıcı boş olmayan bir klasöre yazmaz — bilinmeyen dosyaları asla sessizce silmez.", "Dışa aktarılıyor…", "Denetleniyor…", "Çevrimiçi yayımlama", "Dışa aktarma yalnızca bir dosya klasörüdür. Nereye gideceğini seçin, sonra doğrudan buradan yayımlayın.", "Yayın hedefi", "Bağlı", "Birden fazla token kaydetmeniz, birini yeniden adlandırmanız veya tüm kayıtlı kimlik bilgilerini tek yerden yönetmeniz mi gerekiyor?", "Erişim tokenı oluştur", "Kimlik bilgileri yükleniyor…", "Hesap kimliği", "Doğrula", "Doğrulanıyor…", "Hangi kayıtlı token yayımlar", "Bu çalışma alanında birden fazla kayıtlı", "tokenı var. Tovu'nun hangisiyle yayımlayacağını seçin.", "Depo", "Yayımlanıyor…", "Bitince hemen herkese açık internette yayında olur — taslak veya inceleme adımı yoktur.", "Bu yayın nereye gidiyor", "Yukarıdaki hesap yalnızca yayımlama izniniz olduğunu gösterir — burası bu yayının tam olarak nereye gittiğini söyler.", "Temel yol", "Yok — alan adının kökünden sunulur", "Kimlik bilgisi", "Yayımlandı:"
  ]),
  th: auditTranslationEntries([
    "{count} บรรทัด", "ไม่รองรับ", "รองรับ", "ยังไม่มี Dockerfile", "มีคนอื่นบันทึก Dockerfile นี้เวอร์ชันอื่นระหว่างที่คุณแก้ไข — การเปลี่ยนแปลงของคุณด้านล่างยังไม่ได้บันทึก", "เนื้อหาปัจจุบันบนเซิร์ฟเวอร์คือ:", "ถูกลบบนเซิร์ฟเวอร์แล้ว", "การแก้ไขของคุณด้านล่างยังอยู่ครบ เทียบกับเนื้อหาปัจจุบันด้านบน ปรับให้ตรงกันด้วยตนเอง แล้วบันทึกอีกครั้ง", "โหลดเวอร์ชันปัจจุบัน", "ใช้ได้จากเทอร์มินัล", "ทำงานบนโฮสต์แบบสแตติกใดก็ได้ รวมถึงแบบฟรี ส่วนที่เป็นไดนามิกจะไม่อยู่หลังส่งออก", "ดูรายละเอียดเว็บไซต์สแตติก", "ยังไม่ได้เชื่อมต่อ", "ต้องมีโฮสต์เพื่อรัน — การตั้งค่าผู้ให้บริการอยู่ในแผน แต่ยังไม่ได้เชื่อมต่อ", "ดูรายละเอียดเว็บไซต์เต็มรูปแบบ", "ตั้งค่าแล้ว", "เส้นทาง", "สำเร็จ", "ล้มเหลว", "เขียนไปที่", "เส้นทางที่ล้มเหลว", "ไฟล์ที่ล้มเหลว", "Tovu เขียนโพสต์ที่เผยแพร่ทุกโพสต์ หน้าแรก สินค้า และหน้าของธีมลงในโฟลเดอร์ที่คุณระบุ", "คัดลอกคำสั่งส่งออก", "แทนที่ <dir> ด้วยโฟลเดอร์ที่จะเขียนลงไป เป็นอาร์กิวเมนต์ที่จำเป็น — ไม่มีค่าเริ่มต้น", "เขียนทับไฟล์ที่มีอยู่ในโฟลเดอร์ผลลัพธ์", "ปิดไว้โดยค่าเริ่มต้น ตัวส่งออกจะไม่เขียนลงโฟลเดอร์ที่ไม่ว่างจนกว่าจะเลือกตัวเลือกนี้ — และไม่ลบไฟล์ที่ไม่รู้จักแบบเงียบ ๆ", "กำลังส่งออก…", "กำลังตรวจสอบ…", "นำขึ้นออนไลน์", "การส่งออกเป็นเพียงโฟลเดอร์ไฟล์ เลือกปลายทาง แล้วเผยแพร่จากที่นี่ได้เลย", "ปลายทางการเผยแพร่", "เชื่อมต่อแล้ว", "ต้องการบันทึกโทเค็นมากกว่าหนึ่งรายการ เปลี่ยนชื่อ หรือจัดการข้อมูลรับรองที่บันทึกไว้ทั้งหมดในที่เดียวหรือไม่", "สร้างโทเค็นการเข้าถึง", "กำลังโหลดข้อมูลรับรอง…", "รหัสบัญชี", "ตรวจสอบ", "กำลังตรวจสอบ…", "โทเค็นที่บันทึกไว้ตัวใดใช้เผยแพร่", "พื้นที่ทำงานนี้มีโทเค็น", "ที่บันทึกไว้มากกว่าหนึ่งรายการ เลือกว่าจะให้ Tovu เผยแพร่ด้วยรายการใด", "ที่เก็บ", "กำลังเผยแพร่…", "เมื่อเสร็จจะออนไลน์บนอินเทอร์เน็ตสาธารณะทันที — ไม่มีฉบับร่างหรือขั้นตอนตรวจทาน", "การเผยแพร่นี้ไปที่ไหน", "บัญชีด้านบนแค่ยืนยันว่าคุณเผยแพร่ได้ — ส่วนนี้บอกว่าการเผยแพร่นี้ไปที่ใดแน่ชัด", "พาธฐาน", "ไม่มี — ให้บริการจากรากของโดเมน", "ข้อมูลรับรอง", "เผยแพร่แล้ว:"
  ]),
  hi: auditTranslationEntries([
    "{count} पंक्तियाँ", "समर्थित नहीं", "समर्थित", "अभी कोई Dockerfile नहीं", "आपके संपादन के दौरान किसी और ने इस Dockerfile का अलग संस्करण सहेज दिया — नीचे आपके बदलाव सहेजे नहीं गए।", "सर्वर पर इसकी मौजूदा सामग्री:", "इसे सर्वर पर हटा दिया गया।", "नीचे आपके संपादन जस के तस हैं। ऊपर की मौजूदा सामग्री से तुलना करें, हाथ से मिलाएँ, फिर दोबारा सहेजें।", "मौजूदा संस्करण लोड करें", "टर्मिनल से उपलब्ध", "किसी भी स्टैटिक होस्ट पर चलता है, मुफ़्त वाले भी। एक्सपोर्ट में कुछ भी डायनेमिक नहीं बचता।", "स्टैटिक साइट का विवरण देखें", "अभी जुड़ा नहीं", "चलाने के लिए होस्ट चाहिए — प्रदाता सेटअप योजना में है, पर अभी जुड़ा नहीं।", "फ़ुल साइट का विवरण देखें", "सेट है", "रूट", "सफल", "विफल", "यहाँ लिखा गया", "विफल रूट", "विफल एसेट", "Tovu हर प्रकाशित पोस्ट, होम पेज, उत्पाद और थीम पेज आपके बताए फ़ोल्डर में लिखता है।", "एक्सपोर्ट कमांड कॉपी करें", "<dir> की जगह वह फ़ोल्डर लिखें जिसमें लिखना है। यह ज़रूरी आर्ग्युमेंट है — कोई डिफ़ॉल्ट नहीं है।", "आउटपुट फ़ोल्डर की मौजूदा फ़ाइलें अधिलेखित करें", "डिफ़ॉल्ट रूप से बंद। जब तक यह चुना न जाए, एक्सपोर्टर खाली न होने वाले फ़ोल्डर में नहीं लिखता — और अनजानी फ़ाइलें चुपचाप कभी नहीं हटाता।", "एक्सपोर्ट हो रहा है…", "जाँच हो रही है…", "इसे ऑनलाइन लाना", "एक्सपोर्ट बस फ़ाइलों का एक फ़ोल्डर है। चुनें कि यह कहाँ जाए, फिर यहीं से प्रकाशित करें।", "प्रकाशन लक्ष्य", "जुड़ा हुआ", "एक से ज़्यादा टोकन सहेजने, किसी का नाम बदलने या सभी सहेजे गए क्रेडेंशियल एक जगह संभालने की ज़रूरत है?", "एक्सेस टोकन बनाएँ", "क्रेडेंशियल लोड हो रहे हैं…", "खाता ID", "सत्यापित करें", "सत्यापित हो रहा है…", "कौन-सा सहेजा गया टोकन प्रकाशित करता है", "इस वर्कस्पेस में एक से ज़्यादा सहेजे गए", "टोकन हैं। चुनें कि Tovu किससे प्रकाशित करे।", "रिपॉज़िटरी", "प्रकाशित हो रहा है…", "पूरा होते ही यह तुरंत सार्वजनिक इंटरनेट पर लाइव हो जाता है — कोई ड्राफ़्ट या समीक्षा चरण नहीं है।", "यह प्रकाशन कहाँ जाता है", "ऊपर का खाता सिर्फ़ यह साबित करता है कि आप प्रकाशित कर सकते हैं — यह बताता है कि यह प्रकाशन ठीक कहाँ जाता है।", "बेस पाथ", "कोई नहीं — डोमेन रूट से परोसा जाता है", "क्रेडेंशियल", "प्रकाशित:"
  ]),
  ur: auditTranslationEntries([
    "{count} سطریں", "معاون نہیں", "معاون", "ابھی کوئی Dockerfile نہیں", "آپ کی ترمیم کے دوران کسی اور نے اس Dockerfile کا مختلف ورژن محفوظ کر دیا — نیچے آپ کی تبدیلیاں محفوظ نہیں ہوئیں۔", "سرور پر اس کا موجودہ مواد:", "اسے سرور پر حذف کر دیا گیا۔", "نیچے آپ کی ترامیم جوں کی توں ہیں۔ اوپر کے موجودہ مواد سے موازنہ کریں، ہاتھ سے ملائیں، پھر دوبارہ محفوظ کریں۔", "موجودہ ورژن لوڈ کریں", "ٹرمینل سے دستیاب", "کسی بھی اسٹیٹک ہوسٹ پر چلتا ہے، مفت والوں پر بھی۔ ایکسپورٹ میں کچھ بھی ڈائنامک باقی نہیں رہتا۔", "اسٹیٹک سائٹ کی تفصیلات دیکھیں", "ابھی منسلک نہیں", "چلانے کے لیے ہوسٹ درکار ہے — فراہم کنندہ کا سیٹ اپ منصوبے میں ہے مگر ابھی منسلک نہیں۔", "مکمل سائٹ کی تفصیلات دیکھیں", "سیٹ ہے", "راستے", "کامیاب", "ناکام", "یہاں لکھا گیا", "ناکام راستے", "ناکام فائلیں", "Tovu ہر شائع شدہ پوسٹ، ہوم پیج، مصنوعات اور تھیم کے صفحات آپ کے بتائے فولڈر میں لکھتا ہے۔", "ایکسپورٹ کمانڈ کاپی کریں", "<dir> کی جگہ وہ فولڈر لکھیں جس میں لکھنا ہے۔ یہ لازمی آرگیومنٹ ہے — کوئی ڈیفالٹ نہیں۔", "آؤٹ پٹ فولڈر کی موجودہ فائلیں اوور رائٹ کریں", "ڈیفالٹ طور پر بند۔ جب تک یہ منتخب نہ ہو، ایکسپورٹر غیر خالی فولڈر میں نہیں لکھتا — اور نامعلوم فائلیں کبھی خاموشی سے حذف نہیں کرتا۔", "ایکسپورٹ ہو رہا ہے…", "جانچ ہو رہی ہے…", "اسے آن لائن لانا", "ایکسپورٹ بس فائلوں کا ایک فولڈر ہے۔ منتخب کریں کہ یہ کہاں جائے، پھر یہیں سے شائع کریں۔", "اشاعت کی منزل", "منسلک", "ایک سے زیادہ ٹوکن محفوظ کرنے، کسی کا نام بدلنے یا تمام محفوظ اسناد ایک جگہ سنبھالنے کی ضرورت ہے؟", "رسائی ٹوکن بنائیں", "اسناد لوڈ ہو رہی ہیں…", "اکاؤنٹ ID", "تصدیق کریں", "تصدیق ہو رہی ہے…", "کون سا محفوظ ٹوکن شائع کرتا ہے", "اس ورک اسپیس میں ایک سے زیادہ محفوظ", "ٹوکن ہیں۔ منتخب کریں کہ Tovu کس سے شائع کرے۔", "ریپوزٹری", "شائع ہو رہا ہے…", "ختم ہوتے ہی یہ فوراً عوامی انٹرنیٹ پر لائیو ہو جاتا ہے — کوئی مسودہ یا جائزے کا مرحلہ نہیں۔", "یہ اشاعت کہاں جاتی ہے", "اوپر والا اکاؤنٹ صرف یہ ثابت کرتا ہے کہ آپ شائع کر سکتے ہیں — یہ بتاتا ہے کہ یہ اشاعت ٹھیک کہاں جاتی ہے۔", "بیس پاتھ", "کوئی نہیں — ڈومین روٹ سے پیش کیا جاتا ہے", "سند", "شائع ہوا:"
  ]),
  bn: auditTranslationEntries([
    "{count} লাইন", "সমর্থিত নয়", "সমর্থিত", "এখনো কোনো Dockerfile নেই", "আপনি সম্পাদনা করার সময় অন্য কেউ এই Dockerfile-এর আলাদা সংস্করণ সংরক্ষণ করেছেন — নিচে আপনার পরিবর্তনগুলো সংরক্ষিত হয়নি।", "সার্ভারে এর বর্তমান বিষয়বস্তু:", "এটি সার্ভারে মুছে ফেলা হয়েছে।", "নিচে আপনার সম্পাদনা অক্ষত আছে। উপরের বর্তমান বিষয়বস্তুর সঙ্গে মিলিয়ে দেখুন, হাতে মিলিয়ে নিন, তারপর আবার সংরক্ষণ করুন।", "বর্তমান সংস্করণ লোড করুন", "টার্মিনাল থেকে পাওয়া যায়", "যেকোনো স্ট্যাটিক হোস্টে চলে, ফ্রিগুলোতেও। এক্সপোর্টের পর ডায়নামিক কিছুই থাকে না।", "স্ট্যাটিক সাইটের বিস্তারিত দেখুন", "এখনো যুক্ত হয়নি", "চালাতে একটি হোস্ট লাগে — প্রদানকারীর সেটআপ পরিকল্পনায় আছে, তবে এখনো যুক্ত হয়নি।", "ফুল সাইটের বিস্তারিত দেখুন", "সেট করা", "রুট", "সফল", "ব্যর্থ", "লেখা হয়েছে", "ব্যর্থ রুট", "ব্যর্থ অ্যাসেট", "Tovu প্রতিটি প্রকাশিত পোস্ট, হোম পেজ, পণ্য ও থিম পেজ আপনার বলা ফোল্ডারে লেখে।", "এক্সপোর্ট কমান্ড কপি করুন", "<dir>-এর জায়গায় যে ফোল্ডারে লিখবেন সেটি দিন। এটি আবশ্যক আর্গুমেন্ট — কোনো ডিফল্ট নেই।", "আউটপুট ফোল্ডারের বিদ্যমান ফাইল ওভাররাইট করুন", "ডিফল্টভাবে বন্ধ। এটি চেক না করলে এক্সপোর্টার খালি নয় এমন ফোল্ডারে লেখে না — এবং অজানা ফাইল কখনো নীরবে মোছে না।", "এক্সপোর্ট হচ্ছে…", "যাচাই হচ্ছে…", "অনলাইনে আনা", "এক্সপোর্ট কেবল ফাইলের একটি ফোল্ডার। কোথায় যাবে বেছে নিন, তারপর এখান থেকেই প্রকাশ করুন।", "প্রকাশের গন্তব্য", "সংযুক্ত", "একাধিক টোকেন সংরক্ষণ, কোনোটির নাম বদলানো বা সব সংরক্ষিত ক্রেডেনশিয়াল এক জায়গায় পরিচালনা করতে চান?", "অ্যাক্সেস টোকেন তৈরি করুন", "ক্রেডেনশিয়াল লোড হচ্ছে…", "অ্যাকাউন্ট ID", "যাচাই করুন", "যাচাই হচ্ছে…", "কোন সংরক্ষিত টোকেন দিয়ে প্রকাশ হবে", "এই ওয়ার্কস্পেসে একাধিক সংরক্ষিত", "টোকেন আছে। Tovu কোনটি দিয়ে প্রকাশ করবে বেছে নিন।", "রিপোজিটরি", "প্রকাশ হচ্ছে…", "শেষ হওয়া মাত্র এটি সর্বজনীন ইন্টারনেটে লাইভ হয় — কোনো খসড়া বা পর্যালোচনার ধাপ নেই।", "এই প্রকাশ কোথায় যায়", "উপরের অ্যাকাউন্ট শুধু প্রমাণ করে যে আপনি প্রকাশ করতে পারেন — এটি বলে দেয় এই প্রকাশ ঠিক কোথায় যায়।", "বেস পাথ", "কিছু না — ডোমেইনের রুট থেকে পরিবেশিত", "ক্রেডেনশিয়াল", "প্রকাশিত:"
  ]),
};

/** Runtime dictionary keys returned by deployment rules and hooks. */
const DEPLOYMENT_CANDIDATE_GAP_STRINGS: Record<string, string> = {
  "This connection was already saved — reload the page and try again.": "This connection was already saved — reload the page and try again.",
  "Unknown error": "Unknown error",
  "Pages, posts & products": "Pages, posts & products",
  "Checkout & orders": "Checkout & orders",
  "Admin panel, online": "Admin panel, online",
  "AI assistant": "AI assistant",
  "Not started": "Not started",
  "Export failed": "Export failed",
  "Finished with failures": "Finished with failures",
  "Export finished": "Export finished",
  "Publish failed": "Publish failed",
  "This workspace can't use your computer's terminal — connecting here is the only way to publish.": "This workspace can't use your computer's terminal — connecting here is the only way to publish.",
  "Save your {credential} so Tovu can publish on your behalf.": "Save your {credential} so Tovu can publish on your behalf.",
  "(optional)": "(optional)",
};

function candidateGapTranslationEntries(entries: readonly string[]): Record<string, string> {
  const keys = Object.keys(DEPLOYMENT_CANDIDATE_GAP_STRINGS);
  if (entries.length !== keys.length) {
    throw new Error(`Deployment candidate translation has ${entries.length} entries; expected ${keys.length}.`);
  }
  return Object.fromEntries(keys.map((key, index) => [key, entries[index]]));
}

const DEPLOYMENT_CANDIDATE_GAP_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: DEPLOYMENT_CANDIDATE_GAP_STRINGS,
  es: candidateGapTranslationEntries([
    "Esta conexión ya se guardó; recarga la página e inténtalo de nuevo.", "Error desconocido", "Páginas, publicaciones y productos", "Pago y pedidos", "Panel de administración, en línea", "Asistente de IA", "Sin iniciar", "La exportación falló", "Terminó con errores", "La exportación terminó", "La publicación falló", "Este espacio de trabajo no puede usar el terminal de tu computadora; conectarte aquí es la única forma de publicar.", "Guarda tu {credential} para que Tovu pueda publicar en tu nombre.", "(opcional)"
  ]),
  id: candidateGapTranslationEntries([
    "Koneksi ini sudah disimpan — muat ulang halaman dan coba lagi.", "Kesalahan tidak diketahui", "Halaman, pos & produk", "Checkout & pesanan", "Panel admin, online", "Asisten AI", "Belum dimulai", "Ekspor gagal", "Selesai dengan kegagalan", "Ekspor selesai", "Publikasi gagal", "Ruang kerja ini tidak dapat menggunakan terminal komputer Anda — menghubungkan di sini adalah satu-satunya cara untuk menerbitkan.", "Simpan {credential} Anda agar Tovu dapat memublikasikan atas nama Anda.", "(opsional)"
  ]),
  de: candidateGapTranslationEntries([
    "Diese Verbindung wurde bereits gespeichert — laden Sie die Seite neu und versuchen Sie es erneut.", "Unbekannter Fehler", "Seiten, Beiträge und Produkte", "Checkout und Bestellungen", "Admin-Bereich, online", "KI-Assistent", "Nicht gestartet", "Export fehlgeschlagen", "Mit Fehlern beendet", "Export abgeschlossen", "Veröffentlichung fehlgeschlagen", "Dieser Arbeitsbereich kann das Terminal Ihres Computers nicht verwenden — die Verbindung hier ist die einzige Möglichkeit zu veröffentlichen.", "Speichern Sie die Zugangsdaten ({credential}), damit Tovu in Ihrem Namen veröffentlichen kann.", "(optional)"
  ]),
  fr: candidateGapTranslationEntries([
    "Cette connexion est déjà enregistrée — rechargez la page et réessayez.", "Erreur inconnue", "Pages, publications et produits", "Paiement et commandes", "Panneau d’administration, en ligne", "Assistant IA", "Non démarré", "Échec de l’exportation", "Terminé avec des échecs", "Exportation terminée", "Échec de la publication", "Cet espace de travail ne peut pas utiliser le terminal de votre ordinateur — vous connecter ici est la seule façon de publier.", "Enregistrez vos identifiants ({credential}) pour que Tovu puisse publier en votre nom.", "(facultatif)"
  ]),
  it: candidateGapTranslationEntries([
    "Questa connessione è già stata salvata — ricarica la pagina e riprova.", "Errore sconosciuto", "Pagine, post e prodotti", "Checkout e ordini", "Pannello di amministrazione, online", "Assistente IA", "Non avviato", "Esportazione non riuscita", "Terminato con errori", "Esportazione terminata", "Pubblicazione non riuscita", "Questo spazio di lavoro non può usare il terminale del tuo computer — collegarti qui è l’unico modo per pubblicare.", "Salva le credenziali ({credential}) così Tovu può pubblicare per tuo conto.", "(facoltativo)"
  ]),
  "pt-BR": candidateGapTranslationEntries([
    "Esta conexão já foi salva — recarregue a página e tente novamente.", "Erro desconhecido", "Páginas, posts e produtos", "Checkout e pedidos", "Painel administrativo, online", "Assistente de IA", "Não iniciado", "A exportação falhou", "Terminou com falhas", "Exportação concluída", "A publicação falhou", "Este espaço de trabalho não pode usar o terminal do seu computador — conectar aqui é a única forma de publicar.", "Salve sua credencial ({credential}) para que o Tovu possa publicar em seu nome.", "(opcional)"
  ]),
  "zh-CN": candidateGapTranslationEntries([
    "此连接已保存——请重新加载页面后重试。", "未知错误", "页面、文章和产品", "结账和订单", "管理面板，在线", "AI 助手", "尚未开始", "导出失败", "完成但有失败", "导出完成", "发布失败", "此工作区无法使用您计算机的终端——在此连接是唯一的发布方式。", "保存您的{credential}，以便 Tovu 代表您发布。", "（可选）"
  ]),
  "zh-TW": candidateGapTranslationEntries([
    "此連線已儲存——請重新載入頁面後再試。", "未知錯誤", "頁面、文章與產品", "結帳與訂單", "管理面板，在線", "AI 助理", "尚未開始", "匯出失敗", "完成但有失敗", "匯出完成", "發佈失敗", "此工作區無法使用您電腦的終端機——在此連線是唯一的發佈方式。", "儲存您的{credential}，讓 Tovu 能代表您發布。", "（選填）"
  ]),
  ar: candidateGapTranslationEntries([
    "تم حفظ هذا الاتصال بالفعل — أعد تحميل الصفحة وحاول مرة أخرى.", "خطأ غير معروف", "الصفحات والمنشورات والمنتجات", "الدفع والطلبات", "لوحة الإدارة، متصلة", "مساعد الذكاء الاصطناعي", "لم يبدأ", "فشل التصدير", "انتهى مع إخفاقات", "اكتمل التصدير", "فشل النشر", "لا يمكن لمساحة العمل هذه استخدام طرفية جهازك — الاتصال هنا هو الطريقة الوحيدة للنشر.", "احفظ {credential} حتى يتمكن Tovu من النشر نيابةً عنك.", "(اختياري)"
  ]),
  bn: candidateGapTranslationEntries([
    "এই সংযোগটি ইতিমধ্যেই সংরক্ষিত হয়েছে — পৃষ্ঠাটি পুনরায় লোড করে আবার চেষ্টা করুন।", "অজানা ত্রুটি", "পৃষ্ঠা, পোস্ট ও পণ্য", "চেকআউট ও অর্ডার", "অ্যাডমিন প্যানেল, অনলাইন", "AI সহায়ক", "শুরু হয়নি", "এক্সপোর্ট ব্যর্থ হয়েছে", "ব্যর্থতা সহ শেষ হয়েছে", "এক্সপোর্ট শেষ হয়েছে", "প্রকাশনা ব্যর্থ হয়েছে", "এই কর্মক্ষেত্রটি আপনার কম্পিউটারের টার্মিনাল ব্যবহার করতে পারে না — এখানে সংযুক্ত করাই প্রকাশের একমাত্র উপায়।", "আপনার {credential} সংরক্ষণ করুন যাতে Tovu আপনার পক্ষ থেকে প্রকাশ করতে পারে।", "(ঐচ্ছিক)"
  ]),
  fa: candidateGapTranslationEntries([
    "این اتصال قبلاً ذخیره شده است — صفحه را دوباره بارگیری کنید و دوباره تلاش کنید.", "خطای ناشناخته", "صفحه‌ها، نوشته‌ها و محصولات", "پرداخت و سفارش‌ها", "پنل مدیریت، آنلاین", "دستیار هوش مصنوعی", "شروع نشده", "خروجی ناموفق بود", "با خطاها پایان یافت", "خروجی تمام شد", "انتشار ناموفق بود", "این فضای کاری نمی‌تواند از ترمینال رایانه شما استفاده کند — اتصال در اینجا تنها راه انتشار است.", "{credential} خود را ذخیره کنید تا Tovu بتواند از طرف شما منتشر کند.", "(اختیاری)"
  ]),
  hi: candidateGapTranslationEntries([
    "यह कनेक्शन पहले ही सहेजा जा चुका है — पेज फिर से लोड करें और दोबारा कोशिश करें।", "अज्ञात त्रुटि", "पेज, पोस्ट और उत्पाद", "चेकआउट और ऑर्डर", "एडमिन पैनल, ऑनलाइन", "AI सहायक", "शुरू नहीं हुआ", "एक्सपोर्ट विफल हुआ", "विफलताओं के साथ समाप्त", "एक्सपोर्ट पूरा हुआ", "प्रकाशन विफल हुआ", "यह कार्यक्षेत्र आपके कंप्यूटर का टर्मिनल उपयोग नहीं कर सकता — यहाँ कनेक्ट करना ही प्रकाशित करने का एकमात्र तरीका है।", "अपना {credential} सहेजें ताकि Tovu आपकी ओर से प्रकाशित कर सके।", "(वैकल्पिक)"
  ]),
  hu: candidateGapTranslationEntries([
    "Ez a kapcsolat már el van mentve — töltse újra az oldalt, és próbálja meg újra.", "Ismeretlen hiba", "Oldalak, bejegyzések és termékek", "Pénztár és rendelések", "Adminisztrációs panel, online", "MI-asszisztens", "Nincs elindítva", "Az export sikertelen", "Hibákkal fejeződött be", "Az export befejeződött", "A közzététel sikertelen", "Ez a munkaterület nem használhatja a számítógépe terminálját — az itt történő csatlakozás az egyetlen közzétételi mód.", "Mentse el a hitelesítő adatot ({credential}), hogy a Tovu az Ön nevében publikálhasson.", "(nem kötelező)"
  ]),
  ja: candidateGapTranslationEntries([
    "この接続はすでに保存されています。ページを再読み込みして、もう一度お試しください。", "不明なエラー", "ページ、投稿、商品", "チェックアウトと注文", "管理パネル、オンライン", "AI アシスタント", "未開始", "エクスポートに失敗しました", "失敗を含めて完了", "エクスポート完了", "公開に失敗しました", "このワークスペースではお使いのコンピューターのターミナルを使用できません。ここで接続することが公開する唯一の方法です。", "Tovu があなたに代わって公開できるよう、{credential}を保存してください。", "（任意）"
  ]),
  ko: candidateGapTranslationEntries([
    "이 연결은 이미 저장되었습니다. 페이지를 새로고침한 뒤 다시 시도하세요.", "알 수 없는 오류", "페이지, 게시물 및 제품", "결제 및 주문", "관리자 패널, 온라인", "AI 도우미", "시작되지 않음", "내보내기 실패", "실패와 함께 완료", "내보내기 완료", "게시 실패", "이 작업 공간은 컴퓨터의 터미널을 사용할 수 없습니다. 여기에서 연결하는 것이 게시하는 유일한 방법입니다.", "Tovu가 대신 게시할 수 있도록 {credential}을(를) 저장하세요.", "(선택 사항)"
  ]),
  pl: candidateGapTranslationEntries([
    "To połączenie zostało już zapisane — odśwież stronę i spróbuj ponownie.", "Nieznany błąd", "Strony, wpisy i produkty", "Kasa i zamówienia", "Panel administracyjny, online", "Asystent AI", "Nie rozpoczęto", "Eksport nie powiódł się", "Zakończono z niepowodzeniami", "Eksport zakończony", "Publikacja nie powiodła się", "Ten obszar roboczy nie może używać terminala Twojego komputera — połączenie tutaj jest jedynym sposobem publikacji.", "Zapisz dane uwierzytelniające ({credential}), aby Tovu mógł publikować w Twoim imieniu.", "(opcjonalnie)"
  ]),
  ru: candidateGapTranslationEntries([
    "Это подключение уже сохранено — перезагрузите страницу и попробуйте снова.", "Неизвестная ошибка", "Страницы, записи и товары", "Оформление заказа и заказы", "Панель администратора, онлайн", "ИИ-помощник", "Не запущено", "Экспорт не удался", "Завершено с ошибками", "Экспорт завершён", "Публикация не удалась", "Это рабочее пространство не может использовать терминал вашего компьютера — подключение здесь является единственным способом публикации.", "Сохраните учётные данные ({credential}), чтобы Tovu мог публиковать от вашего имени.", "(необязательно)"
  ]),
  th: candidateGapTranslationEntries([
    "บันทึกการเชื่อมต่อนี้แล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง", "ข้อผิดพลาดที่ไม่ทราบสาเหตุ", "หน้า โพสต์ และสินค้า", "ชำระเงินและคำสั่งซื้อ", "แผงผู้ดูแลระบบ ออนไลน์", "ผู้ช่วย AI", "ยังไม่เริ่ม", "การส่งออกล้มเหลว", "เสร็จสิ้นพร้อมข้อผิดพลาด", "การส่งออกเสร็จสิ้น", "การเผยแพร่ล้มเหลว", "พื้นที่ทำงานนี้ไม่สามารถใช้เทอร์มินัลของคอมพิวเตอร์คุณได้ — การเชื่อมต่อที่นี่เป็นวิธีเดียวในการเผยแพร่", "บันทึก {credential} เพื่อให้ Tovu เผยแพร่แทนคุณได้", "(ไม่บังคับ)"
  ]),
  tr: candidateGapTranslationEntries([
    "Bu bağlantı zaten kaydedildi — sayfayı yeniden yükleyip tekrar deneyin.", "Bilinmeyen hata", "Sayfalar, gönderiler ve ürünler", "Ödeme ve siparişler", "Yönetici paneli, çevrimiçi", "Yapay zekâ asistanı", "Başlatılmadı", "Dışa aktarma başarısız", "Hatalarla tamamlandı", "Dışa aktarma tamamlandı", "Yayınlama başarısız", "Bu çalışma alanı bilgisayarınızın terminalini kullanamaz — buradan bağlanmak yayınlamanın tek yoludur.", "Tovu'nun sizin adınıza yayınlayabilmesi için kimlik bilgisini ({credential}) kaydedin.", "(isteğe bağlı)"
  ]),
  uk: candidateGapTranslationEntries([
    "Це підключення вже збережено — перезавантажте сторінку й спробуйте ще раз.", "Невідома помилка", "Сторінки, дописи й товари", "Оформлення замовлення та замовлення", "Панель адміністратора, онлайн", "ШІ-помічник", "Не запущено", "Експорт не вдався", "Завершено з помилками", "Експорт завершено", "Публікація не вдалася", "Цей робочий простір не може використовувати термінал вашого комп’ютера — підключення тут є єдиним способом публікації.", "Збережіть облікові дані ({credential}), щоб Tovu міг публікувати від вашого імені.", "(необов’язково)"
  ]),
  ur: candidateGapTranslationEntries([
    "یہ کنکشن پہلے ہی محفوظ ہو چکا ہے — صفحہ دوبارہ لوڈ کریں اور پھر کوشش کریں۔", "نامعلوم خرابی", "صفحات، پوسٹس اور مصنوعات", "چیک آؤٹ اور آرڈرز", "ایڈمن پینل، آن لائن", "AI معاون", "شروع نہیں ہوا", "ایکسپورٹ ناکام ہوا", "ناکامیوں کے ساتھ ختم ہوا", "ایکسپورٹ مکمل ہوا", "اشاعت ناکام ہوئی", "یہ ورک اسپیس آپ کے کمپیوٹر کا ٹرمینل استعمال نہیں کر سکتی — یہاں کنکشن کرنا شائع کرنے کا واحد طریقہ ہے۔", "اپنا {credential} محفوظ کریں تاکہ Tovu آپ کی طرف سے شائع کر سکے۔", "(اختیاری)"
  ]),
};

/** The Static Site credential row and publish step: the token hints and actions (the same wording
 *  Security's Access tokens uses), the connected summary's templates, and the Preview/Publish
 *  buttons. `{host}`, `{account}` and `{time}` sit where each locale's grammar puts them. */
const DEPLOYMENT_CREDENTIAL_TRANSLATIONS: Record<string, Record<string, string>> = {
  es: {
    "Leave blank to keep the current token.": "Déjalo en blanco para conservar el token actual.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Se almacena cifrado en el servidor. Una vez guardado, Tovu nunca vuelve a mostrarlo.",
    "Create a token": "Crear un token",
    "Connect": "Conectar",
    "Replace token": "Reemplazar token",
    "Assets": "Recursos",
    "Configured": "Configurada",
    "Not configured": "Sin configurar",
    "{host} connected": "{host} conectado",
    "token stored, encrypted": "token guardado cifrado",
    "saved {time}": "guardado {time}",
    "connected as {account}": "conectado como {account}",
    "Preview": "Vista previa",
    "Publish": "Publicar",
  },
  id: {
    "Leave blank to keep the current token.": "Biarkan kosong untuk mempertahankan token saat ini.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Disimpan terenkripsi di server. Setelah disimpan, Tovu tidak akan pernah menampilkannya lagi.",
    "Create a token": "Buat token",
    "Connect": "Hubungkan",
    "Replace token": "Ganti token",
    "Assets": "Aset",
    "Configured": "Dikonfigurasi",
    "Not configured": "Belum dikonfigurasi",
    "{host} connected": "{host} terhubung",
    "token stored, encrypted": "token disimpan terenkripsi",
    "saved {time}": "disimpan {time}",
    "connected as {account}": "terhubung sebagai {account}",
    "Preview": "Pratinjau",
    "Publish": "Terbitkan",
  },
  de: {
    "Leave blank to keep the current token.": "Leer lassen, um das aktuelle Token beizubehalten.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Wird verschlüsselt auf dem Server gespeichert. Nach dem Speichern zeigt Tovu es nie wieder an.",
    "Create a token": "Ein Token erstellen",
    "Connect": "Verbinden",
    "Replace token": "Token ersetzen",
    "Assets": "Assets",
    "Configured": "Konfiguriert",
    "Not configured": "Nicht konfiguriert",
    "{host} connected": "{host} verbunden",
    "token stored, encrypted": "Token verschlüsselt gespeichert",
    "saved {time}": "gespeichert {time}",
    "connected as {account}": "verbunden als {account}",
    "Preview": "Vorschau",
    "Publish": "Veröffentlichen",
  },
  "zh-CN": {
    "Leave blank to keep the current token.": "留空以保留当前令牌。",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "以加密方式存储在服务器上。保存后，Tovu 将不再显示它。",
    "Create a token": "创建令牌",
    "Connect": "连接",
    "Replace token": "替换令牌",
    "Assets": "资源",
    "Configured": "已配置",
    "Not configured": "未配置",
    "{host} connected": "{host} 已连接",
    "token stored, encrypted": "令牌已加密存储",
    "saved {time}": "保存于 {time}",
    "connected as {account}": "已连接为 {account}",
    "Preview": "预览",
    "Publish": "发布",
  },
  "zh-TW": {
    "Leave blank to keep the current token.": "留空以保留目前的權杖。",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "以加密方式儲存於伺服器。儲存後，Tovu 將不再顯示它。",
    "Create a token": "建立權杖",
    "Connect": "連線",
    "Replace token": "取代權杖",
    "Assets": "資源",
    "Configured": "已設定",
    "Not configured": "未設定",
    "{host} connected": "{host} 已連線",
    "token stored, encrypted": "權杖已加密儲存",
    "saved {time}": "儲存於 {time}",
    "connected as {account}": "已連線為 {account}",
    "Preview": "預覽",
    "Publish": "發佈",
  },
  "pt-BR": {
    "Leave blank to keep the current token.": "Deixe em branco para manter o token atual.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Armazenado criptografado no servidor. Depois de salvo, o Tovu nunca mais o exibe.",
    "Create a token": "Criar um token",
    "Connect": "Conectar",
    "Replace token": "Substituir token",
    "Assets": "Recursos",
    "Configured": "Configurada",
    "Not configured": "Não configurada",
    "{host} connected": "{host} conectado",
    "token stored, encrypted": "token armazenado criptografado",
    "saved {time}": "salvo {time}",
    "connected as {account}": "conectado como {account}",
    "Preview": "Pré-visualizar",
    "Publish": "Publicar",
  },
  ru: {
    "Leave blank to keep the current token.": "Оставьте пустым, чтобы сохранить текущий токен.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Хранится в зашифрованном виде на сервере. После сохранения Tovu больше никогда его не покажет.",
    "Create a token": "Создать токен",
    "Connect": "Подключить",
    "Replace token": "Заменить токен",
    "Assets": "Ресурсы",
    "Configured": "Настроено",
    "Not configured": "Не настроено",
    "{host} connected": "{host} подключён",
    "token stored, encrypted": "токен хранится в зашифрованном виде",
    "saved {time}": "сохранено {time}",
    "connected as {account}": "подключено как {account}",
    "Preview": "Предпросмотр",
    "Publish": "Опубликовать",
  },
  fa: {
    "Leave blank to keep the current token.": "برای نگه‌داشتن توکن فعلی، خالی بگذارید.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "به‌صورت رمزنگاری‌شده روی سرور ذخیره می‌شود. پس از ذخیره، Tovu دیگر هرگز آن را نمایش نمی‌دهد.",
    "Create a token": "ایجاد توکن",
    "Connect": "اتصال",
    "Replace token": "جایگزینی توکن",
    "Assets": "فایل‌ها",
    "Configured": "پیکربندی شده",
    "Not configured": "پیکربندی نشده",
    "{host} connected": "{host} متصل است",
    "token stored, encrypted": "توکن رمزنگاری‌شده ذخیره شد",
    "saved {time}": "ذخیره‌شده {time}",
    "connected as {account}": "متصل با نام {account}",
    "Preview": "پیش‌نمایش",
    "Publish": "انتشار",
  },
  ar: {
    "Leave blank to keep the current token.": "اتركه فارغًا للاحتفاظ بالرمز الحالي.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "يُخزَّن مشفّرًا على الخادم. بعد الحفظ، لن تعرضه Tovu مرة أخرى أبدًا.",
    "Create a token": "إنشاء رمز",
    "Connect": "اتصال",
    "Replace token": "استبدال الرمز",
    "Assets": "الملفات",
    "Configured": "مُهيّأ",
    "Not configured": "غير مُهيّأ",
    "{host} connected": "{host} متصل",
    "token stored, encrypted": "الرمز مخزّن مشفّرًا",
    "saved {time}": "حُفظ {time}",
    "connected as {account}": "متصل باسم {account}",
    "Preview": "معاينة",
    "Publish": "نشر",
  },
  ja: {
    "Leave blank to keep the current token.": "現在のトークンを保持する場合は空欄のままにしてください。",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "サーバー上に暗号化して保存されます。保存後、Tovu が再び表示することはありません。",
    "Create a token": "トークンを作成",
    "Connect": "接続",
    "Replace token": "トークンを置き換え",
    "Assets": "アセット",
    "Configured": "設定済み",
    "Not configured": "未設定",
    "{host} connected": "{host} に接続済み",
    "token stored, encrypted": "トークンは暗号化して保存済み",
    "saved {time}": "{time} に保存",
    "connected as {account}": "{account} として接続",
    "Preview": "プレビュー",
    "Publish": "公開",
  },
  ko: {
    "Leave blank to keep the current token.": "현재 토큰을 유지하려면 비워 두세요.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "서버에 암호화되어 저장됩니다. 저장 후에는 Tovu가 다시는 표시하지 않습니다.",
    "Create a token": "토큰 생성",
    "Connect": "연결",
    "Replace token": "토큰 교체",
    "Assets": "애셋",
    "Configured": "구성됨",
    "Not configured": "구성 안 됨",
    "{host} connected": "{host} 연결됨",
    "token stored, encrypted": "토큰 암호화 저장됨",
    "saved {time}": "{time}에 저장됨",
    "connected as {account}": "{account}(으)로 연결됨",
    "Preview": "미리 보기",
    "Publish": "게시",
  },
  pl: {
    "Leave blank to keep the current token.": "Pozostaw puste, aby zachować bieżący token.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Przechowywany zaszyfrowany na serwerze. Po zapisaniu Tovu nigdy więcej go nie wyświetli.",
    "Create a token": "Utwórz token",
    "Connect": "Połącz",
    "Replace token": "Zamień token",
    "Assets": "Zasoby",
    "Configured": "Skonfigurowano",
    "Not configured": "Nie skonfigurowano",
    "{host} connected": "{host} połączono",
    "token stored, encrypted": "token zapisany w postaci zaszyfrowanej",
    "saved {time}": "zapisano {time}",
    "connected as {account}": "połączono jako {account}",
    "Preview": "Podgląd",
    "Publish": "Opublikuj",
  },
  hu: {
    "Leave blank to keep the current token.": "Hagyja üresen a jelenlegi token megtartásához.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Titkosítva tárolva a szerveren. Mentés után a Tovu többé nem jeleníti meg.",
    "Create a token": "Token létrehozása",
    "Connect": "Csatlakozás",
    "Replace token": "Token cseréje",
    "Assets": "Fájlok",
    "Configured": "Beállítva",
    "Not configured": "Nincs beállítva",
    "{host} connected": "{host} csatlakoztatva",
    "token stored, encrypted": "token titkosítva tárolva",
    "saved {time}": "mentve: {time}",
    "connected as {account}": "csatlakozva mint {account}",
    "Preview": "Előnézet",
    "Publish": "Közzététel",
  },
  fr: {
    "Leave blank to keep the current token.": "Laissez vide pour conserver le jeton actuel.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Stocké chiffré sur le serveur. Une fois enregistré, Tovu ne l'affiche plus jamais.",
    "Create a token": "Créer un jeton",
    "Connect": "Connecter",
    "Replace token": "Remplacer le jeton",
    "Assets": "Ressources",
    "Configured": "Configurée",
    "Not configured": "Non configurée",
    "{host} connected": "{host} connecté",
    "token stored, encrypted": "jeton stocké chiffré",
    "saved {time}": "enregistré {time}",
    "connected as {account}": "connecté en tant que {account}",
    "Preview": "Aperçu",
    "Publish": "Publier",
  },
  uk: {
    "Leave blank to keep the current token.": "Залиште порожнім, щоб зберегти поточний токен.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Зберігається в зашифрованому вигляді на сервері. Після збереження Tovu більше ніколи його не покаже.",
    "Create a token": "Створити токен",
    "Connect": "Підключити",
    "Replace token": "Замінити токен",
    "Assets": "Ресурси",
    "Configured": "Налаштовано",
    "Not configured": "Не налаштовано",
    "{host} connected": "{host} підключено",
    "token stored, encrypted": "токен зберігається в зашифрованому вигляді",
    "saved {time}": "збережено {time}",
    "connected as {account}": "підключено як {account}",
    "Preview": "Попередній перегляд",
    "Publish": "Опублікувати",
  },
  tr: {
    "Leave blank to keep the current token.": "Mevcut jetonu korumak için boş bırakın.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Sunucuda şifrelenmiş olarak saklanır. Kaydedildikten sonra Tovu onu bir daha göstermez.",
    "Create a token": "Bir jeton oluştur",
    "Connect": "Bağlan",
    "Replace token": "Jetonu değiştir",
    "Assets": "Dosyalar",
    "Configured": "Yapılandırıldı",
    "Not configured": "Yapılandırılmadı",
    "{host} connected": "{host} bağlı",
    "token stored, encrypted": "token şifrelenmiş olarak saklanıyor",
    "saved {time}": "kaydedildi {time}",
    "connected as {account}": "{account} olarak bağlı",
    "Preview": "Önizle",
    "Publish": "Yayımla",
  },
  th: {
    "Leave blank to keep the current token.": "เว้นว่างไว้เพื่อคงโทเคนปัจจุบัน",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "จัดเก็บแบบเข้ารหัสไว้บนเซิร์ฟเวอร์ เมื่อบันทึกแล้ว Tovu จะไม่แสดงอีก",
    "Create a token": "สร้างโทเคน",
    "Connect": "เชื่อมต่อ",
    "Replace token": "แทนที่โทเคน",
    "Assets": "ไฟล์",
    "Configured": "กำหนดค่าแล้ว",
    "Not configured": "ยังไม่ได้กำหนดค่า",
    "{host} connected": "{host} เชื่อมต่อแล้ว",
    "token stored, encrypted": "จัดเก็บโทเค็นแบบเข้ารหัสแล้ว",
    "saved {time}": "บันทึกเมื่อ {time}",
    "connected as {account}": "เชื่อมต่อในชื่อ {account}",
    "Preview": "ดูตัวอย่าง",
    "Publish": "เผยแพร่",
  },
  it: {
    "Leave blank to keep the current token.": "Lascia vuoto per mantenere il token attuale.",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "Archiviato in modo crittografato sul server. Una volta salvato, Tovu non lo mostra mai più.",
    "Create a token": "Crea un token",
    "Connect": "Connetti",
    "Replace token": "Sostituisci token",
    "Assets": "Risorse",
    "Configured": "Configurata",
    "Not configured": "Non configurata",
    "{host} connected": "{host} connesso",
    "token stored, encrypted": "token archiviato crittografato",
    "saved {time}": "salvato {time}",
    "connected as {account}": "connesso come {account}",
    "Preview": "Anteprima",
    "Publish": "Pubblica",
  },
  hi: {
    "Leave blank to keep the current token.": "मौजूदा टोकन बनाए रखने के लिए खाली छोड़ें।",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "सर्वर पर एन्क्रिप्टेड रूप में संग्रहीत। सहेजे जाने के बाद, Tovu इसे फिर कभी नहीं दिखाएगा।",
    "Create a token": "एक टोकन बनाएं",
    "Connect": "कनेक्ट करें",
    "Replace token": "टोकन बदलें",
    "Assets": "एसेट",
    "Configured": "कॉन्फ़िगर किया गया",
    "Not configured": "कॉन्फ़िगर नहीं",
    "{host} connected": "{host} जुड़ा है",
    "token stored, encrypted": "टोकन एन्क्रिप्ट करके संग्रहीत",
    "saved {time}": "{time} को सहेजा गया",
    "connected as {account}": "{account} के रूप में जुड़ा",
    "Preview": "पूर्वावलोकन",
    "Publish": "प्रकाशित करें",
  },
  ur: {
    "Leave blank to keep the current token.": "موجودہ ٹوکن برقرار رکھنے کے لیے خالی چھوڑیں۔",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "سرور پر خفیہ کاری کے ساتھ محفوظ ہوتا ہے۔ محفوظ ہونے کے بعد، Tovu اسے دوبارہ کبھی نہیں دکھائے گا۔",
    "Create a token": "ایک ٹوکن بنائیں",
    "Connect": "منسلک کریں",
    "Replace token": "ٹوکن تبدیل کریں",
    "Assets": "فائلیں",
    "Configured": "کنفیگر شدہ",
    "Not configured": "کنفیگر نہیں",
    "{host} connected": "{host} منسلک ہے",
    "token stored, encrypted": "ٹوکن خفیہ کاری کے ساتھ محفوظ",
    "saved {time}": "{time} کو محفوظ کیا گیا",
    "connected as {account}": "{account} کے طور پر منسلک",
    "Preview": "پیش نظارہ",
    "Publish": "شائع کریں",
  },
  bn: {
    "Leave blank to keep the current token.": "বর্তমান টোকেন রাখতে খালি রাখুন।",
    "Stored encrypted on the server. Once saved, Tovu never displays it again.": "সার্ভারে এনক্রিপ্ট করা অবস্থায় সংরক্ষিত থাকে। সংরক্ষণের পর, Tovu এটি আর কখনো দেখাবে না।",
    "Create a token": "একটি টোকেন তৈরি করুন",
    "Connect": "সংযোগ করুন",
    "Replace token": "টোকেন প্রতিস্থাপন করুন",
    "Assets": "অ্যাসেট",
    "Configured": "কনফিগার করা",
    "Not configured": "কনফিগার করা হয়নি",
    "{host} connected": "{host} সংযুক্ত",
    "token stored, encrypted": "টোকেন এনক্রিপ্ট করে সংরক্ষিত",
    "saved {time}": "{time}-এ সংরক্ষিত",
    "connected as {account}": "{account} হিসেবে সংযুক্ত",
    "Preview": "প্রাকদর্শন",
    "Publish": "প্রকাশ করুন",
  },
};

const DEPLOYMENT_DICT: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(DEPLOYMENT_TRANSLATIONS).map(([locale, entries]) => [
    locale,
    {
      ...entries,
      ...DEPLOYMENT_AUDIT_TRANSLATIONS[locale],
      ...DEPLOYMENT_CANDIDATE_GAP_TRANSLATIONS[locale],
      ...DEPLOYMENT_CREDENTIAL_TRANSLATIONS[locale],
    },
  ]),
);

export const t = createDictionaryTranslator(DEPLOYMENT_DICT);

/**
 * "{count} lines" for the Dockerfile viewer's header.
 *
 * Takes a bound `t` rather than a `locale` and its own per-locale template map (the shape the two
 * error messages below use) because its only caller, `DockerfileSourceViewer`, receives `t` from the
 * hook and has no locale in hand. Routing through the same dictionary keeps the string translatable
 * on exactly the same terms as every other string on these tabs: absent from a locale's map, `t`
 * returns the key itself, and `interpolate` then fills `{count}` in either case.
 *
 * @complexity O(1) — one lookup and one substitution.
 */
export function dockerfileLineCountLabel(translate: (key: string) => string, count: number): string {
  return interpolate(translate("{count} lines"), { count: String(count) });
}

/** The Overview tab's load-error banner — embeds `describeApiError`'s already-formatted message
 *  mid-sentence, same `interpolate` + per-locale template shape `actionsForWebhookLabel` uses. */
const OVERVIEW_LOAD_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not load deployment status ({error}).",
  es: "No se pudo cargar el estado del despliegue ({error}).",
  id: "Gagal memuat status deployment ({error}).",
  de: "Bereitstellungsstatus konnte nicht geladen werden ({error}).",
  "zh-CN": "无法加载部署状态({error})。",
  "zh-TW": "無法載入部署狀態({error})。",
  "pt-BR": "Não foi possível carregar o status da implantação ({error}).",
  ru: "Не удалось загрузить статус развёртывания ({error}).",
  fa: "بارگذاری وضعیت استقرار ممکن نشد ({error}).",
  ar: "تعذّر تحميل حالة النشر ({error}).",
  ja: "デプロイ状況を読み込めませんでした({error})。",
  ko: "배포 상태를 불러올 수 없습니다({error}).",
  pl: "Nie udało się wczytać stanu wdrożenia ({error}).",
  hu: "Nem sikerült betölteni a telepítési állapotot ({error}).",
  fr: "Impossible de charger l'état du déploiement ({error}).",
  uk: "Не вдалося завантажити стан розгортання ({error}).",
  tr: "Dağıtım durumu yüklenemedi ({error}).",
  th: "ไม่สามารถโหลดสถานะการปรับใช้ได้ ({error})",
  it: "Impossibile caricare lo stato di distribuzione ({error}).",
  hi: "डिप्लॉयमेंट स्थिति लोड नहीं की जा सकी ({error})।",
  ur: "ڈیپلائے منٹ کی حیثیت لوڈ نہیں ہو سکی ({error})۔",
  bn: "ডিপ্লয়মেন্ট অবস্থা লোড করা যায়নি ({error})।",
};

export function deploymentOverviewLoadErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: OVERVIEW_LOAD_ERROR_TEMPLATE, locale }), { error });
}

/** The Dockerfile tab's load-error banner — same shape as {@link deploymentOverviewLoadErrorMessage}. */
const DOCKERFILE_LOAD_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not load the Dockerfile ({error}).",
  es: "No se pudo cargar el Dockerfile ({error}).",
  id: "Gagal memuat Dockerfile ({error}).",
  de: "Dockerfile konnte nicht geladen werden ({error}).",
  "zh-CN": "无法加载 Dockerfile({error})。",
  "zh-TW": "無法載入 Dockerfile({error})。",
  "pt-BR": "Não foi possível carregar o Dockerfile ({error}).",
  ru: "Не удалось загрузить Dockerfile ({error}).",
  fa: "بارگذاری Dockerfile ممکن نشد ({error}).",
  ar: "تعذّر تحميل Dockerfile ({error}).",
  ja: "Dockerfileを読み込めませんでした({error})。",
  ko: "Dockerfile을 불러올 수 없습니다({error}).",
  pl: "Nie udało się wczytać Dockerfile ({error}).",
  hu: "Nem sikerült betölteni a Dockerfile-t ({error}).",
  fr: "Impossible de charger le Dockerfile ({error}).",
  uk: "Не вдалося завантажити Dockerfile ({error}).",
  tr: "Dockerfile yüklenemedi ({error}).",
  th: "ไม่สามารถโหลด Dockerfile ได้ ({error})",
  it: "Impossibile caricare il Dockerfile ({error}).",
  hi: "Dockerfile लोड नहीं किया जा सका ({error})।",
  ur: "Dockerfile لوڈ نہیں ہو سکا ({error})۔",
  bn: "Dockerfile লোড করা যায়নি ({error})।",
};

export function dockerfileLoadErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: DOCKERFILE_LOAD_ERROR_TEMPLATE, locale }), { error });
}

/**
 * The Dockerfile tab's SAVE-error banner (2026-08-15, tab went from read-only to editable) — same
 * shape as {@link dockerfileLoadErrorMessage}, distinct template because a failed save and a failed
 * load are different failures a reader needs to tell apart (the source they were looking at is
 * still fine; the edit they just tried to persist is what didn't go through).
 *
 * Translated for the Latin-script locales already covered elsewhere in this pass (es/id/de/fr/it/
 * pt-BR); every other locale falls back to the English template via `?? DOCKERFILE_SAVE_ERROR_TEMPLATE.en`
 * — `createDictionaryTranslator`'s documented, correct degrade path, not a bug. Widening coverage to
 * the remaining locales is tracked as follow-up, not blocking: an English error banner in an
 * otherwise-translated screen is a legible failure state, not a broken one.
 */
const DOCKERFILE_SAVE_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not save the Dockerfile ({error}).",
  es: "No se pudo guardar el Dockerfile ({error}).",
  id: "Gagal menyimpan Dockerfile ({error}).",
  de: "Dockerfile konnte nicht gespeichert werden ({error}).",
  fr: "Impossible d'enregistrer le Dockerfile ({error}).",
  it: "Impossibile salvare il Dockerfile ({error}).",
  "pt-BR": "Não foi possível salvar o Dockerfile ({error}).",
};

export function dockerfileSaveErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: DOCKERFILE_SAVE_ERROR_TEMPLATE, locale }), { error });
}

/** The Static Site tab's export-status LOAD-error banner (the initial `GET .../system/export` this
 *  hook reads on mount to seed `run` — see `use-static-export.hooks.ts`'s header) — distinct from
 *  {@link exportTriggerErrorMessage}, same split `dockerfileLoadErrorMessage`/
 *  `dockerfileSaveErrorMessage` draw for the Dockerfile tab. */
const EXPORT_LOAD_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not load the export status ({error}).",
  es: "No se pudo cargar el estado de la exportación ({error}).",
  id: "Gagal memuat status ekspor ({error}).",
  de: "Der Exportstatus konnte nicht geladen werden ({error}).",
  fr: "Impossible de charger l'état de l'export ({error}).",
  it: "Impossibile caricare lo stato dell'esportazione ({error}).",
  "pt-BR": "Não foi possível carregar o status da exportação ({error}).",
};

export function exportLoadErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: EXPORT_LOAD_ERROR_TEMPLATE, locale }), { error });
}

/**
 * The Static Site tab's "Build static export" trigger-error banner (2026-08-15, the button went
 * from permanently inert to wired against a real `POST .../system/export`) — same
 * `interpolate`/per-locale-template shape as {@link dockerfileSaveErrorMessage}, and the same
 * partial-locale-coverage precedent that file's own doc comment already establishes as
 * non-blocking. Covers both a genuine server rejection (a malformed request) and the expected `409`
 * from clicking while a run is already in flight — the message itself (`describeApiError`'s
 * `ApiError.message`) already distinguishes the two; this template only wraps it.
 */
const EXPORT_TRIGGER_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not start the export ({error}).",
  es: "No se pudo iniciar la exportación ({error}).",
  id: "Gagal memulai ekspor ({error}).",
  de: "Der Export konnte nicht gestartet werden ({error}).",
  fr: "Impossible de démarrer l'export ({error}).",
  it: "Impossibile avviare l'esportazione ({error}).",
  "pt-BR": "Não foi possível iniciar a exportação ({error}).",
};

export function exportTriggerErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: EXPORT_TRIGGER_ERROR_TEMPLATE, locale }), { error });
}

/**
 * The Static Site tab's export POLL-error banner — shown only once the poll loop's own bound gives
 * up on a status endpoint it can no longer reach (`use-static-export.hooks.ts`'s `POLL_FAILURE_LIMIT`,
 * 2026-08-15 fix for a defect where poll failures retried forever behind a stuck spinner with no way
 * out). Distinct from {@link exportLoadErrorMessage} (the one-shot initial read) and
 * {@link exportTriggerErrorMessage} (the POST that starts a run) — this is the REPEATED read that
 * keeps a `"running"` run's status current. English-only for now, same partial-locale-coverage
 * precedent {@link exportTriggerErrorMessage} documents.
 */
const EXPORT_POLL_ERROR_TEMPLATE: Record<string, string> = {
  en: "Lost track of this export's status and stopped checking ({error}). It may still be running — try again in a moment.",
};

export function exportPollErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: EXPORT_POLL_ERROR_TEMPLATE, locale }), { error });
}

/** The Static Site tab's publish-status LOAD-error banner (the initial `GET .../system/publish` this
 *  hook reads on mount to seed `run` — see `use-static-publish.hooks.ts`'s header) — distinct from
 *  {@link publishTriggerErrorMessage}, same split {@link exportLoadErrorMessage}/
 *  `exportTriggerErrorMessage` draw for the export half of this tab. */
const PUBLISH_LOAD_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not load the publish status ({error}).",
  es: "No se pudo cargar el estado de la publicación ({error}).",
  id: "Gagal memuat status publikasi ({error}).",
  de: "Der Veröffentlichungsstatus konnte nicht geladen werden ({error}).",
  fr: "Impossible de charger l'état de la publication ({error}).",
  it: "Impossibile caricare lo stato della pubblicazione ({error}).",
  "pt-BR": "Não foi possível carregar o status da publicação ({error}).",
};

export function publishLoadErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: PUBLISH_LOAD_ERROR_TEMPLATE, locale }), { error });
}

/** The Static Site tab's publish-preview error banner — a failed `GET .../system/publish/preview`
 *  itself (network/auth/500), distinct from `preview.validationError` (a normal, expected outcome
 *  for an incomplete form the preview reports at `200`, not a failure this template covers). Same
 *  partial-locale-coverage precedent as {@link exportTriggerErrorMessage}. */
const PUBLISH_PREVIEW_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not check this target ({error}).",
  es: "No se pudo comprobar este destino ({error}).",
  id: "Gagal memeriksa target ini ({error}).",
  de: "Dieses Ziel konnte nicht geprüft werden ({error}).",
  fr: "Impossible de vérifier cette cible ({error}).",
  it: "Impossibile verificare questa destinazione ({error}).",
  "pt-BR": "Não foi possível verificar este destino ({error}).",
};

export function publishPreviewErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: PUBLISH_PREVIEW_ERROR_TEMPLATE, locale }), { error });
}

/** The Static Site tab's "Publish" trigger-error banner — same shape and same "409 while already
 *  running" coverage as {@link exportTriggerErrorMessage}, kept as its own template (rather than
 *  reused) because a failed EXPORT trigger and a failed PUBLISH trigger are different operations a
 *  reader needs to tell apart, same reasoning `dockerfileSaveErrorMessage`'s own doc gives for not
 *  sharing a template with `dockerfileLoadErrorMessage`. */
const PUBLISH_TRIGGER_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not start the publish ({error}).",
  es: "No se pudo iniciar la publicación ({error}).",
  id: "Gagal memulai publikasi ({error}).",
  de: "Die Veröffentlichung konnte nicht gestartet werden ({error}).",
  fr: "Impossible de démarrer la publication ({error}).",
  it: "Impossibile avviare la pubblicazione ({error}).",
  "pt-BR": "Não foi possível iniciar a publicação ({error}).",
};

export function publishTriggerErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: PUBLISH_TRIGGER_ERROR_TEMPLATE, locale }), { error });
}

/** The Static Site tab's publish POLL-error banner — same split and same 2026-08-15 fix
 *  {@link exportPollErrorMessage} documents for the export half of this tab, applied to
 *  `use-static-publish.hooks.ts`'s own poll loop. English-only for now, same partial-locale-coverage
 *  precedent as that function. */
const PUBLISH_POLL_ERROR_TEMPLATE: Record<string, string> = {
  en: "Lost track of this publish's status and stopped checking ({error}). It may still be running — try again in a moment.",
};

export function publishPollErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: PUBLISH_POLL_ERROR_TEMPLATE, locale }), { error });
}

/**
 * The credential section's LOAD-error banner (`GET .../system/publish/credentials`) — same split
 * {@link publishLoadErrorMessage} draws for the publish run's own initial read. New 2026-08-15;
 * English-only for now, same partial-coverage precedent {@link exportTriggerErrorMessage} documents
 * — an English banner in an otherwise-translated screen degrades legibly, it does not break.
 */
const PUBLISH_CREDENTIALS_LOAD_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not load publish credentials ({error}).",
};

export function publishCredentialsLoadErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: PUBLISH_CREDENTIALS_LOAD_ERROR_TEMPLATE, locale }), { error });
}

/**
 * One provider row's save-error banner (flat per-provider credential list, 2026-08-15 redesign —
 * StaticSiteTab.tsx's `PublishCredentialsSection`). Also carries a rejected VALIDATION failure's
 * `detail` text, routed here by `classifyPublishCredentialSubmitError` (`rules.ts`) instead of the
 * generic `describeApiError` fallback — the `{error}` slot reads naturally either way ("a real
 * transport failure" or "the server's own validation reason").
 */
const PUBLISH_CREDENTIAL_SAVE_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not save this token ({error}).",
};

export function publishCredentialSaveErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: PUBLISH_CREDENTIAL_SAVE_ERROR_TEMPLATE, locale }), { error });
}

/** One provider row's re-verify-error banner — same shape as {@link PUBLISH_CREDENTIAL_SAVE_ERROR_TEMPLATE}
 *  one function up, for the separate "Verify" action `CredentialStepDone` (`StaticSiteTab.tsx`) adds
 *  to an already-connected row. Only a genuine transport/request failure reaches this template — the
 *  server's own `status: "invalid" | "unreachable"` outcomes are not errors at this layer, they are a
 *  normal `AdminPublishCredentialVerification` result the row renders directly (see
 *  `use-publish-credentials.hooks.ts`'s `verify` for the split). */
const PUBLISH_CREDENTIAL_VERIFY_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not verify this token ({error}).",
};

export function publishCredentialVerifyErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: PUBLISH_CREDENTIAL_VERIFY_ERROR_TEMPLATE, locale }), { error });
}

/** The "which saved token publishes" picker's failed-switch banner — same shape as
 *  {@link PUBLISH_CREDENTIAL_SAVE_ERROR_TEMPLATE}. Its second sentence is the point: a refused
 *  promotion leaves the server publishing with the token it had, and the picker goes back to showing
 *  that one, so the operator is told the two still agree rather than left to wonder which is live. */
const PUBLISH_CREDENTIAL_SELECT_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not switch the publishing token ({error}). Publishing still uses the one shown.",
};

export function publishCredentialSelectErrorMessage(locale: string, error: string): string {
  return interpolate(localeEntry({ table: PUBLISH_CREDENTIAL_SELECT_ERROR_TEMPLATE, locale }), { error });
}
