import { interpolate } from "../../lib/template-i18n";
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

const DEPLOYMENT_DICT: Record<string, Record<string, string>> = {
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
    "Falls back to a public default.": "Usa un valor predeterminado público si falta.",
    'Falls back to "admin".': 'Usa "admin" si falta.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Necesaria para iniciar en producción. Si falta en local, aparece como un 503 en la pantalla del Asistente de IA.",
    "Falls back to port 4319.": "Usa el puerto 4319 si falta.",
    "What Static Site produces": "Qué produce el sitio estático",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Una copia rápida y de solo lectura de las páginas publicadas de este sitio — sin servidor detrás.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "Sin pago en línea, sin panel de administración activo, sin asistente, sin nada dinámico.",
    "Not built yet": "Aún no está implementado",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu no tiene un exportador estático, y el mapa del sitio por sí solo no puede generar uno — solo enumera publicaciones publicadas, no la página de inicio, productos, páginas del tema, redirecciones, la página 404 ni los recursos.",
    "Static hosts": "Alojamientos estáticos",
    "Build it from a terminal": "Constrúyelo desde una terminal",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "Ejecuta tovu export <dir> y Tovu escribe una copia estática de este sitio — cada publicación, la página de inicio, los productos y las páginas del tema — en una carpeta.",
    "Not available from this screen yet — run tovu export from a terminal.": "Aún no disponible desde esta pantalla — ejecuta tovu export desde una terminal.",
    "Build static export": "Generar exportación estática",
    "Not available yet — see above.": "Aún no disponible — ver arriba.",
    "What Full Site gives you": "Qué te ofrece el sitio completo",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "El servidor completo de Tovu — administración, asistente, pago, todo funciona.",
    Providers: "Proveedores",
    Planned: "Planeado",
    "No credential fields yet — this instance has no backend to store them.":
      "Aún no hay campos de credenciales — esta instancia no tiene backend para almacenarlas.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "Una pequeña máquina siempre activa cerca de tus visitantes — entre $2 y $9/mes aproximadamente.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "Una plataforma de contenedores gestionada con un flujo de despliegue simple — plan Hobby desde $5/mes.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "Una plataforma de contenedores gestionada con discos persistentes — plan Starter desde $7/mes (un servicio por disco).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "Control total sobre la máquina, con la complejidad y los precios propios de AWS.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "Una máquina virtual sencilla (Droplet) — planes básicos desde $4–6/mes aproximadamente.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "Cualquier servidor al que ya tengas acceso SSH — lo que ya te esté costando.",
    "Loading Dockerfile…": "Cargando el Dockerfile…",
    "Not generated yet": "Aún no generado",
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
    "Builds and deploys will show up here once a real host is wired up.":
      "Las compilaciones y despliegues aparecerán aquí una vez que se conecte un alojamiento real.",
  },
  id: {
    Operations: "Operasi",
    Deployment: "Deployment",
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
    "Falls back to a public default.": "Kembali ke default publik jika kosong.",
    'Falls back to "admin".': 'Kembali ke "admin" jika kosong.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Wajib untuk boot di produksi. Jika hilang secara lokal, muncul sebagai 503 di layar Asisten AI.",
    "Falls back to port 4319.": "Kembali ke port 4319 jika kosong.",
    "What Static Site produces": "Apa yang dihasilkan Situs Statis",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Salinan cepat dan hanya-baca dari halaman situs yang dipublikasikan — tanpa server di baliknya.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "Tidak ada checkout, tidak ada admin online, tidak ada asisten, tidak ada apa pun yang dinamis.",
    "Not built yet": "Belum dibangun",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu belum memiliki exporter statis, dan sitemap saja tidak bisa menjalankannya — sitemap hanya mendaftar tulisan yang dipublikasikan, bukan halaman utama, produk, halaman tema, redirect, halaman 404, atau aset.",
    "Static hosts": "Hosting statis",
    "Build it from a terminal": "Bangun dari terminal",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "Jalankan tovu export <dir> dan Tovu menulis salinan statis situs ini — setiap tulisan, halaman utama, produk, dan halaman tema — ke sebuah folder.",
    "Not available from this screen yet — run tovu export from a terminal.": "Belum tersedia dari layar ini — jalankan tovu export dari terminal.",
    "Build static export": "Bangun ekspor statis",
    "Not available yet — see above.": "Belum tersedia — lihat di atas.",
    "What Full Site gives you": "Apa yang diberikan Situs Lengkap",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Server Tovu yang lengkap — admin, asisten, checkout, semuanya berfungsi.",
    Providers: "Penyedia",
    Planned: "Direncanakan",
    "No credential fields yet — this instance has no backend to store them.":
      "Belum ada kolom kredensial — instans ini belum punya backend untuk menyimpannya.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "Mesin kecil yang selalu aktif dan dekat dengan pengunjung Anda — sekitar $2–9/bulan.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "Platform kontainer terkelola dengan alur deploy sederhana — paket Hobby mulai $5/bulan.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "Platform kontainer terkelola dengan disk persisten — paket Starter mulai $7/bulan (satu layanan per disk).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "Kendali penuh atas mesin, dengan kompleksitas dan harga khas AWS.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "Mesin virtual sederhana (Droplet) — paket dasar mulai sekitar $4–6/bulan.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "Server apa pun yang sudah bisa Anda akses via SSH — sesuai biaya yang sudah Anda tanggung.",
    "Loading Dockerfile…": "Memuat Dockerfile…",
    "Not generated yet": "Belum dibuat",
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
    "Builds and deploys will show up here once a real host is wired up.":
      "Build dan deployment akan muncul di sini setelah hosting sungguhan terhubung.",
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
    "Falls back to a public default.": "Fällt auf einen öffentlichen Standard zurück.",
    'Falls back to "admin".': 'Fällt auf „admin“ zurück.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Für den Start in Produktion erforderlich. Fehlt sie lokal, erscheint stattdessen ein 503 auf dem Bildschirm des KI-Assistenten.",
    "Falls back to port 4319.": "Fällt auf Port 4319 zurück.",
    "What Static Site produces": "Was Statische Seite erzeugt",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Eine schnelle, schreibgeschützte Kopie der veröffentlichten Seiten dieser Website — kein Server dahinter.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "Kein Checkout, kein Admin online, kein Assistent, nichts Dynamisches.",
    "Not built yet": "Noch nicht gebaut",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu hat keinen statischen Exporter, und die Sitemap allein reicht dafür nicht — sie listet nur veröffentlichte Beiträge, nicht die Startseite, Produkte, Theme-Seiten, Weiterleitungen, die 404-Seite oder Assets.",
    "Static hosts": "Statische Hoster",
    "Build it from a terminal": "Über ein Terminal erstellen",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "Führe tovu export <dir> aus, und Tovu schreibt eine statische Kopie dieser Website — jeden Beitrag, die Startseite, Produkte und Theme-Seiten — in einen Ordner.",
    "Not available from this screen yet — run tovu export from a terminal.": "Von diesem Bildschirm aus noch nicht verfügbar — führe tovu export in einem Terminal aus.",
    "Build static export": "Statischen Export erstellen",
    "Not available yet — see above.": "Noch nicht verfügbar — siehe oben.",
    "What Full Site gives you": "Was Vollständige Seite bietet",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Der vollständige Tovu-Server — Admin, Assistent, Checkout, alles funktioniert.",
    Providers: "Anbieter",
    Planned: "Geplant",
    "No credential fields yet — this instance has no backend to store them.":
      "Noch keine Zugangsdatenfelder — diese Instanz hat kein Backend, um sie zu speichern.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "Eine kleine, dauerhaft laufende Maschine in der Nähe deiner Besucher — etwa 2–9 $/Monat.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "Eine verwaltete Container-Plattform mit einfachem Deploy-Ablauf — Hobby-Tarif ab 5 $/Monat.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "Eine verwaltete Container-Plattform mit persistenten Datenträgern — Starter-Tarif ab 7 $/Monat (ein Dienst pro Datenträger).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "Volle Kontrolle über die Maschine, mit AWS' eigener Komplexität und Preisgestaltung.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "Eine unkomplizierte virtuelle Maschine (Droplet) — Basistarife ab etwa 4–6 $/Monat.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "Jeder Server, auf den du bereits per SSH zugreifen kannst — zu den Kosten, die er dich bereits kostet.",
    "Loading Dockerfile…": "Dockerfile wird geladen…",
    "Not generated yet": "Noch nicht erzeugt",
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
    "Builds and deploys will show up here once a real host is wired up.":
      "Builds und Deployments erscheinen hier, sobald ein echter Host angebunden ist.",
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
    "Falls back to a public default.": "未设置时使用公开的默认值。",
    'Falls back to "admin".': '未设置时使用 "admin"。',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "生产环境下启动必需。本地缺失时,会改为在 AI 助手页面显示为 503。",
    "Falls back to port 4319.": "未设置时使用端口 4319。",
    "What Static Site produces": "静态站点会生成什么",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "此站点已发布页面的快速只读副本 — 背后没有服务器。",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "没有结账、没有在线后台、没有助手、没有任何动态功能。",
    "Not built yet": "尚未构建",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu 还没有静态导出器,仅靠站点地图也无法驱动一个 — 它只列出已发布的文章,不包括首页、产品、主题页面、重定向、404 页面或资源文件。",
    "Static hosts": "静态托管平台",
    "Build it from a terminal": "从终端构建",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "运行 tovu export <dir>,Tovu 会将此站点的静态副本——每篇文章、首页、产品和主题页面——写入一个文件夹。",
    "Not available from this screen yet — run tovu export from a terminal.": "此界面尚不支持——请在终端中运行 tovu export。",
    "Build static export": "生成静态导出",
    "Not available yet — see above.": "尚不可用 — 见上文。",
    "What Full Site gives you": "完整站点能带来什么",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "完整的 Tovu 服务器 — 后台、助手、结账,一切都能正常工作。",
    Providers: "服务商",
    Planned: "计划中",
    "No credential fields yet — this instance has no backend to store them.":
      "尚无凭据字段 — 此实例没有可安全存储它们的后端。",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "靠近访客的一台常驻小型机器 — 每月约 2–9 美元。",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "具有简单部署流程的托管容器平台 — Hobby 套餐每月起价 5 美元。",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "带持久化磁盘的托管容器平台 — Starter 套餐每月起价 7 美元(每个磁盘限一个服务实例)。",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "完全掌控机器,同时也伴随 AWS 自身的复杂度和定价。",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "简单直接的虚拟机(Droplet) — 基础套餐每月约 4–6 美元起。",
    "Any server you already have SSH access to — whatever it already costs you.":
      "任何你已有 SSH 访问权限的服务器 — 成本就是你已经在承担的费用。",
    "Loading Dockerfile…": "正在加载 Dockerfile…",
    "Not generated yet": "尚未生成",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "仓库根目录下还没有 Dockerfile。添加后,其内容将显示在此处。",
    Copy: "复制",
    "Copied!": "已复制!",
    Download: "下载",
    "Building is a terminal command (docker build …), not a button here.":
      "构建镜像是一条终端命令(docker build …),而不是此处的按钮。",
    "No deploys yet": "尚无部署记录",
    "Builds and deploys will show up here once a real host is wired up.":
      "接入真实主机后,构建和部署记录将显示在此处。",
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
    "Falls back to a public default.": "未設定時會使用公開的預設值。",
    'Falls back to "admin".': '未設定時會使用「admin」。',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "正式環境啟動時為必要項目。本機缺少時,會改為在 AI 助理畫面顯示為 503。",
    "Falls back to port 4319.": "未設定時會使用連接埠 4319。",
    "What Static Site produces": "靜態網站會產生什麼",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "此網站已發佈頁面的快速唯讀副本 — 背後沒有伺服器。",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "沒有結帳、沒有上線的管理後台、沒有助理、沒有任何動態功能。",
    "Not built yet": "尚未建置",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu 尚無靜態匯出器,單靠網站地圖也無法驅動一個 — 它只列出已發佈的文章,不含首頁、產品、佈景主題頁面、重新導向、404 頁面或資源檔案。",
    "Static hosts": "靜態代管平台",
    "Build it from a terminal": "從終端機建置",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "執行 tovu export <dir>,Tovu 會將此網站的靜態副本——每篇文章、首頁、產品與佈景主題頁面——寫入資料夾。",
    "Not available from this screen yet — run tovu export from a terminal.": "此畫面尚不支援——請在終端機執行 tovu export。",
    "Build static export": "建立靜態匯出",
    "Not available yet — see above.": "尚未提供 — 見上方說明。",
    "What Full Site gives you": "完整網站能帶來什麼",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "完整的 Tovu 伺服器 — 管理後台、助理、結帳,一切都能運作。",
    Providers: "服務商",
    Planned: "規劃中",
    "No credential fields yet — this instance has no backend to store them.":
      "尚無憑證欄位 — 此執行個體沒有可安全儲存它們的後端。",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "靠近訪客的小型常駐主機 — 每月約 2–9 美元。",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "具有簡單部署流程的代管容器平台 — Hobby 方案每月 5 美元起。",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "具持久性磁碟的代管容器平台 — Starter 方案每月 7 美元起(每個磁碟限一個服務執行個體)。",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "完全掌控主機,同時伴隨 AWS 自身的複雜度與定價。",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "簡單直接的虛擬主機(Droplet) — 基本方案每月約 4–6 美元起。",
    "Any server you already have SSH access to — whatever it already costs you.":
      "任何你已擁有 SSH 存取權的伺服器 — 成本就是你目前已負擔的費用。",
    "Loading Dockerfile…": "正在載入 Dockerfile…",
    "Not generated yet": "尚未產生",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "存放庫根目錄下尚無 Dockerfile。新增後,其內容將顯示於此。",
    Copy: "複製",
    "Copied!": "已複製!",
    Download: "下載",
    "Building is a terminal command (docker build …), not a button here.":
      "建置映像檔是終端機指令(docker build …),而非此處的按鈕。",
    "No deploys yet": "尚無部署紀錄",
    "Builds and deploys will show up here once a real host is wired up.":
      "接上真實主機後,建置與部署紀錄將顯示於此。",
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
    "Falls back to a public default.": "Usa um padrão público quando ausente.",
    'Falls back to "admin".': 'Usa "admin" quando ausente.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Necessária para iniciar em produção. Se ausente localmente, aparece como 503 na tela do Assistente de IA.",
    "Falls back to port 4319.": "Usa a porta 4319 quando ausente.",
    "What Static Site produces": "O que o Site estático produz",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Uma cópia rápida e somente leitura das páginas publicadas deste site — sem servidor por trás.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "Sem checkout, sem painel administrativo online, sem assistente, sem nada dinâmico.",
    "Not built yet": "Ainda não implementado",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "O Tovu não tem um exportador estático, e o sitemap sozinho não consegue gerar um — ele lista apenas publicações publicadas, não a página inicial, produtos, páginas do tema, redirecionamentos, a página 404 ou os recursos.",
    "Static hosts": "Hospedagens estáticas",
    "Build it from a terminal": "Gere pelo terminal",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "Execute tovu export <dir> e o Tovu grava uma cópia estática deste site — cada publicação, a página inicial, os produtos e as páginas do tema — em uma pasta.",
    "Not available from this screen yet — run tovu export from a terminal.": "Ainda não disponível nesta tela — execute tovu export pelo terminal.",
    "Build static export": "Gerar exportação estática",
    "Not available yet — see above.": "Ainda não disponível — veja acima.",
    "What Full Site gives you": "O que o Site completo oferece",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "O servidor completo do Tovu — admin, assistente, checkout, tudo funciona.",
    Providers: "Provedores",
    Planned: "Planejado",
    "No credential fields yet — this instance has no backend to store them.":
      "Ainda não há campos de credenciais — esta instância não tem backend para armazená-las.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "Uma máquina pequena sempre ativa, próxima dos seus visitantes — cerca de US$ 2–9/mês.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "Uma plataforma de contêineres gerenciada com um fluxo de implantação simples — plano Hobby a partir de US$ 5/mês.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "Uma plataforma de contêineres gerenciada com discos persistentes — plano Starter a partir de US$ 7/mês (um serviço por disco).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "Controle total sobre a máquina, com a complexidade e os preços próprios da AWS.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "Uma máquina virtual simples (Droplet) — planos básicos a partir de cerca de US$ 4–6/mês.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "Qualquer servidor ao qual você já tenha acesso SSH — pelo custo que ele já representa para você.",
    "Loading Dockerfile…": "Carregando o Dockerfile…",
    "Not generated yet": "Ainda não gerado",
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
    "Builds and deploys will show up here once a real host is wired up.":
      "Builds e implantações aparecerão aqui assim que uma hospedagem real for conectada.",
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
    "Falls back to a public default.": "При отсутствии используется публичное значение по умолчанию.",
    'Falls back to "admin".': 'При отсутствии используется «admin».',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Обязательна для запуска в продакшене. Если отсутствует локально, вместо этого на экране ИИ-ассистента появится ошибка 503.",
    "Falls back to port 4319.": "При отсутствии используется порт 4319.",
    "What Static Site produces": "Что даёт Статичный сайт",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Быстрая копия опубликованных страниц сайта только для чтения — без сервера позади неё.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "Нет оформления заказа, нет доступной админки, нет ассистента, нет ничего динамического.",
    "Not built yet": "Пока не реализовано",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "У Tovu нет статического экспортёра, а одной карты сайта недостаточно для его создания — она перечисляет только опубликованные записи, но не главную страницу, товары, страницы темы, редиректы, страницу 404 или ресурсы.",
    "Static hosts": "Статический хостинг",
    "Build it from a terminal": "Соберите через терминал",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "Выполните tovu export <dir>, и Tovu запишет статическую копию этого сайта — каждую запись, главную страницу, товары и страницы темы — в папку.",
    "Not available from this screen yet — run tovu export from a terminal.": "Пока недоступно с этого экрана — выполните tovu export в терминале.",
    "Build static export": "Собрать статический экспорт",
    "Not available yet — see above.": "Пока недоступно — см. выше.",
    "What Full Site gives you": "Что даёт Полноценный сайт",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Полноценный сервер Tovu — админка, ассистент, оформление заказа, всё работает.",
    Providers: "Провайдеры",
    Planned: "Запланировано",
    "No credential fields yet — this instance has no backend to store them.":
      "Полей для учётных данных пока нет — у этого экземпляра нет backend'а для их хранения.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "Небольшая постоянно работающая машина рядом с вашими посетителями — примерно $2–9/мес.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "Управляемая контейнерная платформа с простым процессом деплоя — тариф Hobby от $5/мес.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "Управляемая контейнерная платформа с постоянными дисками — тариф Starter от $7/мес (один сервис на диск).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "Полный контроль над машиной — со всей сложностью и ценами, свойственными AWS.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "Простая виртуальная машина (Droplet) — базовые тарифы примерно от $4–6/мес.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "Любой сервер, к которому у вас уже есть доступ по SSH — по той цене, которую вы уже платите.",
    "Loading Dockerfile…": "Загрузка Dockerfile…",
    "Not generated yet": "Пока не создан",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "В корне репозитория пока нет Dockerfile. Как только он появится, его содержимое будет показано здесь.",
    Copy: "Копировать",
    "Copied!": "Скопировано!",
    Download: "Скачать",
    "Building is a terminal command (docker build …), not a button here.":
      "Сборка образа — это команда терминала (docker build …), а не кнопка здесь.",
    "No deploys yet": "Развёртываний пока нет",
    "Builds and deploys will show up here once a real host is wired up.":
      "Сборки и развёртывания появятся здесь после подключения реального хостинга.",
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
    "Falls back to a public default.": "در صورت نبود، از مقدار پیش‌فرض عمومی استفاده می‌شود.",
    'Falls back to "admin".': 'در صورت نبود، از «admin» استفاده می‌شود.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "برای راه‌اندازی در محیط تولید لازم است. در صورت نبود در محیط محلی، به‌جای آن روی صفحه دستیار هوش مصنوعی خطای 503 نمایش داده می‌شود.",
    "Falls back to port 4319.": "در صورت نبود، از پورت 4319 استفاده می‌شود.",
    "What Static Site produces": "سایت ایستا چه چیزی تولید می‌کند",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "یک نسخه سریع و فقط‌خواندنی از صفحات منتشرشده این سایت — بدون سروری در پشت آن.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "بدون تسویه‌حساب، بدون پنل مدیریت آنلاین، بدون دستیار، بدون هیچ چیز پویا.",
    "Not built yet": "هنوز ساخته نشده",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu هیچ صادرکننده ایستایی ندارد و نقشه سایت به‌تنهایی نمی‌تواند یکی بسازد — فقط نوشته‌های منتشرشده را فهرست می‌کند، نه صفحه اصلی، محصولات، صفحات قالب، ریدایرکت‌ها، صفحه 404 یا دارایی‌ها را.",
    "Static hosts": "میزبان‌های ایستا",
    "Build it from a terminal": "از ترمینال بسازید",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "دستور tovu export <dir> را اجرا کنید تا Tovu یک نسخه ایستا از این سایت — هر نوشته، صفحه اصلی، محصولات و صفحات قالب — را در یک پوشه بنویسد.",
    "Not available from this screen yet — run tovu export from a terminal.": "هنوز از این صفحه در دسترس نیست — دستور tovu export را از ترمینال اجرا کنید.",
    "Build static export": "ساخت خروجی ایستا",
    "Not available yet — see above.": "هنوز در دسترس نیست — به بالا مراجعه کنید.",
    "What Full Site gives you": "سایت کامل چه چیزی به شما می‌دهد",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "سرور کامل Tovu — پنل مدیریت، دستیار، تسویه‌حساب، همه‌چیز کار می‌کند.",
    Providers: "ارائه‌دهندگان",
    Planned: "برنامه‌ریزی‌شده",
    "No credential fields yet — this instance has no backend to store them.":
      "هنوز فیلدی برای اعتبارنامه وجود ندارد — این نمونه بک‌اندی برای ذخیره آن‌ها ندارد.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "یک ماشین کوچک و همیشه روشن نزدیک به بازدیدکنندگان شما — تقریباً ۲ تا ۹ دلار در ماه.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "یک پلتفرم کانتینری مدیریت‌شده با فرآیند استقرار ساده — طرح Hobby از ۵ دلار در ماه.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "یک پلتفرم کانتینری مدیریت‌شده با دیسک‌های پایدار — طرح Starter از ۷ دلار در ماه (یک سرویس به ازای هر دیسک).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "کنترل کامل بر ماشین، همراه با پیچیدگی و قیمت‌گذاری خاص AWS.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "یک ماشین مجازی ساده (Droplet) — طرح‌های پایه از حدود ۴ تا ۶ دلار در ماه.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "هر سروری که از قبل به آن دسترسی SSH دارید — به همان هزینه‌ای که همین حالا برای آن می‌پردازید.",
    "Loading Dockerfile…": "در حال بارگذاری Dockerfile…",
    "Not generated yet": "هنوز ایجاد نشده",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "هنوز Dockerfile‌ای در ریشه مخزن وجود ندارد. به‌محض افزوده شدن، محتوای آن اینجا نمایش داده می‌شود.",
    Copy: "کپی",
    "Copied!": "کپی شد!",
    Download: "دانلود",
    "Building is a terminal command (docker build …), not a button here.":
      "ساخت ایمیج یک دستور ترمینال است (docker build …)، نه دکمه‌ای در اینجا.",
    "No deploys yet": "هنوز استقراری انجام نشده",
    "Builds and deploys will show up here once a real host is wired up.":
      "ساخت‌ها و استقرارها پس از اتصال یک میزبان واقعی اینجا نمایش داده می‌شوند.",
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
    "Falls back to a public default.": "تستخدم قيمة افتراضية عامة عند غيابها.",
    'Falls back to "admin".': 'تستخدم "admin" عند غيابها.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "مطلوبة للإقلاع في بيئة الإنتاج. إذا كانت غائبة محليًا، يظهر بدلاً من ذلك خطأ 503 في شاشة مساعد الذكاء الاصطناعي.",
    "Falls back to port 4319.": "تستخدم المنفذ 4319 عند غيابها.",
    "What Static Site produces": "ما الذي ينتجه الموقع الثابت",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "نسخة سريعة للقراءة فقط من صفحات هذا الموقع المنشورة — بلا خادم خلفها.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "لا دفع إلكتروني، ولا لوحة تحكم متصلة، ولا مساعد، ولا أي شيء ديناميكي.",
    "Not built yet": "لم يُبنَ بعد",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "لا يملك Tovu مُصدِّرًا ثابتًا، وخريطة الموقع وحدها لا تكفي لإنشاء واحد — فهي تسرد فقط المقالات المنشورة، دون الصفحة الرئيسية أو المنتجات أو صفحات القالب أو إعادة التوجيه أو صفحة 404 أو الأصول.",
    "Static hosts": "مضيفو المواقع الثابتة",
    "Build it from a terminal": "أنشئه من الطرفية",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "شغّل الأمر tovu export <dir> ليكتب Tovu نسخة ثابتة من هذا الموقع — كل مقالة، والصفحة الرئيسية، والمنتجات، وصفحات القالب — في مجلد.",
    "Not available from this screen yet — run tovu export from a terminal.": "غير متاح من هذه الشاشة بعد — شغّل tovu export من الطرفية.",
    "Build static export": "إنشاء تصدير ثابت",
    "Not available yet — see above.": "غير متاح بعد — انظر أعلاه.",
    "What Full Site gives you": "ما الذي يمنحك إياه الموقع الكامل",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "خادم Tovu الكامل — لوحة التحكم، المساعد، الدفع، كل شيء يعمل.",
    Providers: "مزوّدو الخدمة",
    Planned: "مخطَّط له",
    "No credential fields yet — this instance has no backend to store them.":
      "لا توجد حقول بيانات اعتماد بعد — لا تملك هذه النسخة خلفية لتخزينها.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "جهاز صغير يعمل باستمرار وقريب من زوّارك — حوالي 2–9 دولارات شهريًا.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "منصة حاويات مُدارة بتدفق نشر بسيط — خطة Hobby تبدأ من 5 دولارات شهريًا.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "منصة حاويات مُدارة بأقراص دائمة — خطة Starter تبدأ من 7 دولارات شهريًا (خدمة واحدة لكل قرص).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "تحكم كامل في الجهاز، مع ما يصاحب ذلك من تعقيد وتسعير خاصَّين بـ AWS.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "جهاز افتراضي بسيط (Droplet) — الخطط الأساسية تبدأ من حوالي 4–6 دولارات شهريًا.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "أي خادم لديك بالفعل وصول SSH إليه — بأي تكلفة تتحملها بالفعل عنه.",
    "Loading Dockerfile…": "جارٍ تحميل Dockerfile…",
    "Not generated yet": "لم يُنشأ بعد",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "لا يوجد Dockerfile في جذر المستودع بعد. بمجرد إضافته، سيظهر محتواه هنا.",
    Copy: "نسخ",
    "Copied!": "تم النسخ!",
    Download: "تنزيل",
    "Building is a terminal command (docker build …), not a button here.":
      "بناء الصورة هو أمر طرفية (docker build …)، وليس زرًا هنا.",
    "No deploys yet": "لا عمليات نشر بعد",
    "Builds and deploys will show up here once a real host is wired up.":
      "ستظهر عمليات البناء والنشر هنا بمجرد ربط مضيف حقيقي.",
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
    "Falls back to a public default.": "未設定の場合、公開されているデフォルト値が使われます。",
    'Falls back to "admin".': '未設定の場合、"admin" が使われます。',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "本番環境での起動に必要です。ローカルで未設定の場合、代わりにAIアシスタント画面で503として表示されます。",
    "Falls back to port 4319.": "未設定の場合、ポート4319が使われます。",
    "What Static Site produces": "静的サイトが生成するもの",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "このサイトの公開済みページの高速な読み取り専用コピー — 背後にサーバーはありません。",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "決済なし、管理画面のオンライン稼働なし、アシスタントなし、動的な機能はいっさいありません。",
    "Not built yet": "まだ構築されていません",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovuには静的エクスポーターがなく、サイトマップだけではそれを実現できません — サイトマップは公開済みの投稿のみを列挙し、ホームページ、商品、テーマページ、リダイレクト、404ページ、アセットは含みません。",
    "Static hosts": "静的ホスティング先",
    "Build it from a terminal": "ターミナルからビルドする",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "tovu export <dir> を実行すると、Tovuはこのサイトの静的コピー——すべての投稿、ホームページ、商品、テーマページ——をフォルダに書き出します。",
    "Not available from this screen yet — run tovu export from a terminal.": "この画面からはまだ利用できません — ターミナルでtovu exportを実行してください。",
    "Build static export": "静的エクスポートをビルド",
    "Not available yet — see above.": "まだ利用できません — 上記を参照してください。",
    "What Full Site gives you": "フルサイトで得られるもの",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "完全なTovuサーバー — 管理画面、アシスタント、決済、すべてが動作します。",
    Providers: "プロバイダー",
    Planned: "予定",
    "No credential fields yet — this instance has no backend to store them.":
      "認証情報の入力欄はまだありません — このインスタンスには保存先のバックエンドがありません。",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "訪問者の近くで常時稼働する小さなマシン — 月額およそ2〜9ドル。",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "シンプルなデプロイフローを持つマネージドコンテナプラットフォーム — Hobbyプランは月額5ドルから。",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "永続ディスクを備えたマネージドコンテナプラットフォーム — Starterプランは月額7ドルから(ディスク1つにつきサービス1つ)。",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "マシンを完全に制御できる一方、AWS特有の複雑さと料金体系が伴います。",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "シンプルな仮想マシン(Droplet) — 基本プランは月額およそ4〜6ドルから。",
    "Any server you already have SSH access to — whatever it already costs you.":
      "すでにSSHでアクセスできるサーバーなら何でも — すでに支払っている費用のままです。",
    "Loading Dockerfile…": "Dockerfileを読み込み中…",
    "Not generated yet": "まだ生成されていません",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "リポジトリのルートにはまだDockerfileがありません。追加されると、その内容がここに表示されます。",
    Copy: "コピー",
    "Copied!": "コピーしました!",
    Download: "ダウンロード",
    "Building is a terminal command (docker build …), not a button here.":
      "イメージのビルドはターミナルコマンド(docker build …)であり、ここにあるボタンではありません。",
    "No deploys yet": "デプロイはまだありません",
    "Builds and deploys will show up here once a real host is wired up.":
      "実際のホストが接続されると、ビルドとデプロイがここに表示されます。",
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
    "Falls back to a public default.": "설정하지 않으면 공개 기본값을 사용합니다.",
    'Falls back to "admin".': '설정하지 않으면 "admin"을 사용합니다.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "프로덕션에서 부팅하려면 필요합니다. 로컬에서 없으면 대신 AI 어시스턴트 화면에 503으로 표시됩니다.",
    "Falls back to port 4319.": "설정하지 않으면 포트 4319를 사용합니다.",
    "What Static Site produces": "정적 사이트가 생성하는 것",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "이 사이트의 게시된 페이지를 빠르게 읽기 전용으로 복사한 것 — 그 뒤에 서버는 없습니다.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "결제 없음, 온라인 관리자 없음, 어시스턴트 없음, 동적인 기능 전혀 없음.",
    "Not built yet": "아직 구현되지 않음",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu에는 정적 내보내기 기능이 없으며, 사이트맵만으로는 이를 생성할 수 없습니다 — 사이트맵은 게시된 글만 나열할 뿐, 홈페이지, 제품, 테마 페이지, 리디렉션, 404 페이지, 자산은 포함하지 않습니다.",
    "Static hosts": "정적 호스팅",
    "Build it from a terminal": "터미널에서 빌드하기",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "tovu export <dir>를 실행하면 Tovu가 이 사이트의 정적 사본 — 모든 게시물, 홈페이지, 제품, 테마 페이지 — 을 폴더에 씁니다.",
    "Not available from this screen yet — run tovu export from a terminal.": "이 화면에서는 아직 사용할 수 없습니다 — 터미널에서 tovu export를 실행하세요.",
    "Build static export": "정적 내보내기 빌드",
    "Not available yet — see above.": "아직 사용할 수 없습니다 — 위 내용을 참고하세요.",
    "What Full Site gives you": "전체 사이트가 제공하는 것",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "완전한 Tovu 서버 — 관리자, 어시스턴트, 결제까지 모든 것이 작동합니다.",
    Providers: "제공업체",
    Planned: "예정됨",
    "No credential fields yet — this instance has no backend to store them.":
      "아직 자격 증명 입력란이 없습니다 — 이 인스턴스에는 이를 저장할 백엔드가 없습니다.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "방문자와 가까운 곳에서 항상 켜져 있는 소형 머신 — 월 약 2~9달러.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "간단한 배포 흐름을 가진 관리형 컨테이너 플랫폼 — Hobby 요금제는 월 5달러부터.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "영구 디스크를 갖춘 관리형 컨테이너 플랫폼 — Starter 요금제는 월 7달러부터(디스크당 서비스 1개).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "머신에 대한 완전한 제어권을 가지되, AWS 특유의 복잡성과 요금 체계가 따릅니다.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "간단한 가상 머신(Droplet) — 기본 요금제는 월 약 4~6달러부터.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "이미 SSH로 접근 가능한 서버라면 무엇이든 — 이미 지불하고 있는 비용 그대로.",
    "Loading Dockerfile…": "Dockerfile을 불러오는 중…",
    "Not generated yet": "아직 생성되지 않음",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "저장소 루트에 아직 Dockerfile이 없습니다. 추가되면 이곳에 내용이 표시됩니다.",
    Copy: "복사",
    "Copied!": "복사됨!",
    Download: "다운로드",
    "Building is a terminal command (docker build …), not a button here.":
      "이미지 빌드는 터미널 명령(docker build …)이며, 이곳의 버튼이 아닙니다.",
    "No deploys yet": "아직 배포 없음",
    "Builds and deploys will show up here once a real host is wired up.":
      "실제 호스트가 연결되면 빌드와 배포가 이곳에 표시됩니다.",
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
    "Falls back to a public default.": "Bez ustawienia używana jest publiczna wartość domyślna.",
    'Falls back to "admin".': 'Bez ustawienia używane jest „admin”.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Wymagana do uruchomienia w środowisku produkcyjnym. Jeśli brakuje jej lokalnie, zamiast tego na ekranie Asystenta AI pojawia się błąd 503.",
    "Falls back to port 4319.": "Bez ustawienia używany jest port 4319.",
    "What Static Site produces": "Co tworzy Witryna statyczna",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Szybka, tylko do odczytu kopia opublikowanych stron tej witryny — bez serwera z tyłu.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "Brak płatności, brak działającego panelu administracyjnego, brak asystenta, brak czegokolwiek dynamicznego.",
    "Not built yet": "Jeszcze nie zbudowane",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu nie ma eksportera statycznego, a sama mapa witryny nie wystarczy, by go stworzyć — wymienia tylko opublikowane wpisy, a nie stronę główną, produkty, strony motywu, przekierowania, stronę 404 ani zasoby.",
    "Static hosts": "Hosty statyczne",
    "Build it from a terminal": "Zbuduj z terminala",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "Uruchom tovu export <dir>, a Tovu zapisze statyczną kopię tej witryny — każdy wpis, stronę główną, produkty i strony motywu — do folderu.",
    "Not available from this screen yet — run tovu export from a terminal.": "Jeszcze niedostępne z tego ekranu — uruchom tovu export z terminala.",
    "Build static export": "Zbuduj eksport statyczny",
    "Not available yet — see above.": "Jeszcze niedostępne — zobacz powyżej.",
    "What Full Site gives you": "Co daje Pełna witryna",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Pełny serwer Tovu — panel administracyjny, asystent, płatności, wszystko działa.",
    Providers: "Dostawcy",
    Planned: "Planowane",
    "No credential fields yet — this instance has no backend to store them.":
      "Jeszcze brak pól na dane uwierzytelniające — ta instancja nie ma backendu do ich przechowywania.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "Mała, stale działająca maszyna blisko Twoich odwiedzających — około 2–9 USD/mies.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "Zarządzana platforma kontenerowa z prostym procesem wdrażania — plan Hobby od 5 USD/mies.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "Zarządzana platforma kontenerowa z trwałymi dyskami — plan Starter od 7 USD/mies. (jedna usługa na dysk).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "Pełna kontrola nad maszyną, wraz z właściwą dla AWS złożonością i cennikiem.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "Prosta maszyna wirtualna (Droplet) — plany podstawowe od około 4–6 USD/mies.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "Dowolny serwer, do którego masz już dostęp SSH — za tyle, ile już za niego płacisz.",
    "Loading Dockerfile…": "Wczytywanie Dockerfile…",
    "Not generated yet": "Jeszcze niewygenerowany",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "W katalogu głównym repozytorium nie ma jeszcze Dockerfile. Gdy zostanie dodany, jego zawartość pojawi się tutaj.",
    Copy: "Kopiuj",
    "Copied!": "Skopiowano!",
    Download: "Pobierz",
    "Building is a terminal command (docker build …), not a button here.":
      "Budowanie obrazu to polecenie terminala (docker build …), a nie przycisk tutaj.",
    "No deploys yet": "Jeszcze brak wdrożeń",
    "Builds and deploys will show up here once a real host is wired up.":
      "Kompilacje i wdrożenia pojawią się tutaj, gdy zostanie podłączony prawdziwy host.",
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
    "Falls back to a public default.": "Hiányában nyilvános alapértelmezett értéket használ.",
    'Falls back to "admin".': 'Hiányában az "admin" értéket használja.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Az éles indításhoz szükséges. Ha helyileg hiányzik, helyette az AI asszisztens képernyőjén 503-as hiba jelenik meg.",
    "Falls back to port 4319.": "Hiányában a 4319-es portot használja.",
    "What Static Site produces": "Mit hoz létre a Statikus oldal",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Az oldal publikált lapjainak gyors, csak olvasható másolata — szerver nélkül a háttérben.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "Nincs fizetés, nincs élő admin felület, nincs asszisztens, semmi dinamikus.",
    "Not built yet": "Még nincs kiépítve",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "A Tovu-nak nincs statikus exportálója, és önmagában a webhelytérkép sem elegendő ehhez — csak a publikált bejegyzéseket sorolja fel, a kezdőlapot, termékeket, sablonoldalakat, átirányításokat, a 404-es oldalt vagy az erőforrásokat nem.",
    "Static hosts": "Statikus szolgáltatók",
    "Build it from a terminal": "Építsd meg terminálból",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "Futtasd a tovu export <dir> parancsot, és a Tovu ebbe a mappába írja ki az oldal statikus másolatát — minden bejegyzést, a kezdőlapot, a termékeket és a sablonoldalakat.",
    "Not available from this screen yet — run tovu export from a terminal.": "Erről a képernyőről még nem érhető el — futtasd a tovu export parancsot terminálból.",
    "Build static export": "Statikus export létrehozása",
    "Not available yet — see above.": "Még nem elérhető — lásd fent.",
    "What Full Site gives you": "Mit ad a Teljes oldal",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "A teljes Tovu szerver — admin, asszisztens, fizetés, minden működik.",
    Providers: "Szolgáltatók",
    Planned: "Tervezett",
    "No credential fields yet — this instance has no backend to store them.":
      "Még nincsenek hitelesítési mezők — ennek a példánynak nincs háttérrendszere ezek tárolására.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "Kis, folyamatosan futó gép a látogatóid közelében — kb. 2–9 USD/hó.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "Menedzselt konténerplatform egyszerű telepítési folyamattal — Hobby csomag 5 USD/hótól.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "Menedzselt konténerplatform tartós lemezekkel — Starter csomag 7 USD/hótól (lemezenként egy szolgáltatás).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "Teljes kontroll a gép felett, az AWS-re jellemző összetettséggel és árazással.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "Egyszerű virtuális gép (Droplet) — alapcsomagok kb. 4–6 USD/hótól.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "Bármely szerver, amelyhez már van SSH-hozzáférésed — amennyibe már most is kerül.",
    "Loading Dockerfile…": "Dockerfile betöltése…",
    "Not generated yet": "Még nincs legenerálva",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "A repó gyökerében még nincs Dockerfile. Amint hozzáadják, a tartalma itt fog megjelenni.",
    Copy: "Másolás",
    "Copied!": "Másolva!",
    Download: "Letöltés",
    "Building is a terminal command (docker build …), not a button here.":
      "A build egy terminálparancs (docker build …), nem egy gomb itt.",
    "No deploys yet": "Még nincs telepítés",
    "Builds and deploys will show up here once a real host is wired up.":
      "A buildek és telepítések itt jelennek majd meg, ha egy valódi host csatlakoztatva lesz.",
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
    "Falls back to a public default.": "Utilise une valeur par défaut publique si absente.",
    'Falls back to "admin".': 'Utilise « admin » si absente.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Requise pour démarrer en production. Si elle est absente en local, une erreur 503 apparaît à la place sur l'écran de l'assistant IA.",
    "Falls back to port 4319.": "Utilise le port 4319 si absente.",
    "What Static Site produces": "Ce que produit le Site statique",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Une copie rapide et en lecture seule des pages publiées de ce site — sans serveur derrière.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "Pas de paiement, pas d'administration en ligne, pas d'assistant, rien de dynamique.",
    "Not built yet": "Pas encore développé",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu n'a pas d'exportateur statique, et le plan du site seul ne peut pas en générer un — il liste uniquement les articles publiés, pas la page d'accueil, les produits, les pages du thème, les redirections, la page 404 ni les ressources.",
    "Static hosts": "Hébergeurs statiques",
    "Build it from a terminal": "Générez-le depuis un terminal",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "Exécutez tovu export <dir> et Tovu écrit une copie statique de ce site — chaque article, la page d'accueil, les produits et les pages du thème — dans un dossier.",
    "Not available from this screen yet — run tovu export from a terminal.": "Pas encore disponible depuis cet écran — exécutez tovu export depuis un terminal.",
    "Build static export": "Générer l'export statique",
    "Not available yet — see above.": "Pas encore disponible — voir ci-dessus.",
    "What Full Site gives you": "Ce que vous offre le Site complet",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Le serveur Tovu complet — administration, assistant, paiement, tout fonctionne.",
    Providers: "Fournisseurs",
    Planned: "Prévu",
    "No credential fields yet — this instance has no backend to store them.":
      "Pas encore de champs d'identifiants — cette instance n'a pas de backend pour les stocker.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "Une petite machine toujours active, proche de vos visiteurs — environ 2 à 9 $/mois.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "Une plateforme de conteneurs gérée avec un déploiement simple — forfait Hobby à partir de 5 $/mois.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "Une plateforme de conteneurs gérée avec des disques persistants — forfait Starter à partir de 7 $/mois (un service par disque).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "Un contrôle total sur la machine, avec la complexité et la tarification propres à AWS.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "Une machine virtuelle simple (Droplet) — forfaits de base à partir d'environ 4 à 6 $/mois.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "N'importe quel serveur auquel vous avez déjà accès en SSH — au coût que vous payez déjà.",
    "Loading Dockerfile…": "Chargement du Dockerfile…",
    "Not generated yet": "Pas encore généré",
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
    "Builds and deploys will show up here once a real host is wired up.":
      "Les builds et déploiements apparaîtront ici une fois un hébergeur réel connecté.",
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
    "Falls back to a public default.": "За відсутності використовується публічне значення за замовчуванням.",
    'Falls back to "admin".': 'За відсутності використовується «admin».',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Обов'язкова для запуску в продакшні. Якщо відсутня локально, натомість на екрані ШІ-асистента з'явиться помилка 503.",
    "Falls back to port 4319.": "За відсутності використовується порт 4319.",
    "What Static Site produces": "Що дає Статичний сайт",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Швидка копія опублікованих сторінок сайту лише для читання — без сервера позаду неї.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "Немає оформлення замовлення, немає доступної адмінки, немає асистента, немає нічого динамічного.",
    "Not built yet": "Ще не реалізовано",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "У Tovu немає статичного експортера, а самої карти сайту недостатньо для його створення — вона перелічує лише опубліковані записи, але не головну сторінку, товари, сторінки теми, редіректи, сторінку 404 чи ресурси.",
    "Static hosts": "Статичний хостинг",
    "Build it from a terminal": "Зберіть через термінал",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "Виконайте tovu export <dir>, і Tovu запише статичну копію цього сайту — кожен запис, головну сторінку, товари та сторінки теми — у папку.",
    "Not available from this screen yet — run tovu export from a terminal.": "Поки недоступно з цього екрана — виконайте tovu export у терміналі.",
    "Build static export": "Зібрати статичний експорт",
    "Not available yet — see above.": "Поки недоступно — див. вище.",
    "What Full Site gives you": "Що дає Повноцінний сайт",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Повноцінний сервер Tovu — адмінка, асистент, оформлення замовлення, все працює.",
    Providers: "Провайдери",
    Planned: "Заплановано",
    "No credential fields yet — this instance has no backend to store them.":
      "Полів для облікових даних поки немає — цей екземпляр не має бекенду для їх зберігання.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "Невелика постійно працююча машина поруч із вашими відвідувачами — приблизно $2–9/міс.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "Керована контейнерна платформа з простим процесом деплою — тариф Hobby від $5/міс.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "Керована контейнерна платформа з постійними дисками — тариф Starter від $7/міс (один сервіс на диск).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "Повний контроль над машиною — з усією складністю та цінами, властивими AWS.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "Проста віртуальна машина (Droplet) — базові тарифи приблизно від $4–6/міс.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "Будь-який сервер, до якого у вас уже є доступ по SSH — за ціною, яку ви вже платите.",
    "Loading Dockerfile…": "Завантаження Dockerfile…",
    "Not generated yet": "Ще не створено",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "У корені репозиторію поки немає Dockerfile. Щойно його додадуть, вміст з'явиться тут.",
    Copy: "Копіювати",
    "Copied!": "Скопійовано!",
    Download: "Завантажити",
    "Building is a terminal command (docker build …), not a button here.":
      "Збірка образу — це команда терміналу (docker build …), а не кнопка тут.",
    "No deploys yet": "Розгортань поки немає",
    "Builds and deploys will show up here once a real host is wired up.":
      "Збірки та розгортання з'являться тут після підключення реального хостингу.",
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
    "Falls back to a public default.": "Ayarlanmazsa herkese açık bir varsayılan kullanılır.",
    'Falls back to "admin".': 'Ayarlanmazsa "admin" kullanılır.',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Üretimde başlatmak için gereklidir. Yerelde eksikse, bunun yerine Yapay Zeka Asistanı ekranında 503 olarak görünür.",
    "Falls back to port 4319.": "Ayarlanmazsa 4319 numaralı port kullanılır.",
    "What Static Site produces": "Statik Site ne üretir",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Bu sitenin yayınlanmış sayfalarının hızlı, salt okunur bir kopyası — arkasında sunucu yok.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "Ödeme yok, çevrimiçi yönetim paneli yok, asistan yok, dinamik hiçbir şey yok.",
    "Not built yet": "Henüz oluşturulmadı",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu'nun statik bir dışa aktarıcısı yok ve site haritası tek başına bunu oluşturamaz — yalnızca yayınlanmış yazıları listeler; ana sayfayı, ürünleri, tema sayfalarını, yönlendirmeleri, 404 sayfasını veya varlıkları listelemez.",
    "Static hosts": "Statik barındırıcılar",
    "Build it from a terminal": "Terminalden oluşturun",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "tovu export <dir> komutunu çalıştırın, Tovu bu sitenin statik bir kopyasını — her yazıyı, ana sayfayı, ürünleri ve tema sayfalarını — bir klasöre yazsın.",
    "Not available from this screen yet — run tovu export from a terminal.": "Bu ekrandan henüz kullanılamıyor — terminalden tovu export komutunu çalıştırın.",
    "Build static export": "Statik dışa aktarma oluştur",
    "Not available yet — see above.": "Henüz kullanılamıyor — yukarıya bakın.",
    "What Full Site gives you": "Tam Site size ne sağlar",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Eksiksiz Tovu sunucusu — yönetim paneli, asistan, ödeme, her şey çalışır.",
    Providers: "Sağlayıcılar",
    Planned: "Planlandı",
    "No credential fields yet — this instance has no backend to store them.":
      "Henüz kimlik bilgisi alanları yok — bu örneğin bunları saklayacak bir arka ucu yok.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "Ziyaretçilerinize yakın, sürekli açık küçük bir makine — ayda yaklaşık 2–9 $.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "Basit bir dağıtım akışına sahip yönetilen konteyner platformu — Hobby planı aylık 5 $'dan başlar.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "Kalıcı disklere sahip yönetilen konteyner platformu — Starter planı aylık 7 $'dan başlar (disk başına bir servis).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "Makine üzerinde tam kontrol, AWS'ye özgü karmaşıklık ve fiyatlandırmayla birlikte.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "Basit bir sanal makine (Droplet) — temel planlar ayda yaklaşık 4–6 $'dan başlar.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "Zaten SSH erişiminiz olan herhangi bir sunucu — size şu anda neye mal oluyorsa o kadar.",
    "Loading Dockerfile…": "Dockerfile yükleniyor…",
    "Not generated yet": "Henüz oluşturulmadı",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "Depo kök dizininde henüz bir Dockerfile yok. Eklendiğinde içeriği burada görünecek.",
    Copy: "Kopyala",
    "Copied!": "Kopyalandı!",
    Download: "İndir",
    "Building is a terminal command (docker build …), not a button here.":
      "İmajı oluşturmak bir terminal komutudur (docker build …), buradaki bir düğme değildir.",
    "No deploys yet": "Henüz dağıtım yok",
    "Builds and deploys will show up here once a real host is wired up.":
      "Gerçek bir sunucu bağlandığında derlemeler ve dağıtımlar burada görünecek.",
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
    "Falls back to a public default.": "ใช้ค่าเริ่มต้นสาธารณะเมื่อไม่ได้ตั้งค่า",
    'Falls back to "admin".': 'ใช้ "admin" เมื่อไม่ได้ตั้งค่า',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "จำเป็นสำหรับการบูตในโปรดักชัน หากไม่มีในโลคัล จะแสดงเป็น 503 ที่หน้าจอผู้ช่วย AI แทน",
    "Falls back to port 4319.": "ใช้พอร์ต 4319 เมื่อไม่ได้ตั้งค่า",
    "What Static Site produces": "เว็บไซต์แบบสแตติกสร้างอะไร",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "สำเนาแบบอ่านอย่างเดียวที่รวดเร็วของหน้าที่เผยแพร่ของเว็บไซต์นี้ — ไม่มีเซิร์ฟเวอร์อยู่เบื้องหลัง",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "ไม่มีการชำระเงิน ไม่มีระบบผู้ดูแลออนไลน์ ไม่มีผู้ช่วย ไม่มีสิ่งใดที่เป็นไดนามิก",
    "Not built yet": "ยังไม่ได้สร้าง",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu ยังไม่มีตัวส่งออกแบบสแตติก และแผนผังเว็บไซต์เพียงอย่างเดียวไม่สามารถสร้างสิ่งนี้ได้ — มันแสดงเฉพาะโพสต์ที่เผยแพร่แล้ว ไม่รวมหน้าแรก สินค้า หน้าธีม การเปลี่ยนเส้นทาง หน้า 404 หรือไฟล์ทรัพยากร",
    "Static hosts": "โฮสต์แบบสแตติก",
    "Build it from a terminal": "สร้างจากเทอร์มินัล",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "รันคำสั่ง tovu export <dir> แล้ว Tovu จะเขียนสำเนาแบบสแตติกของเว็บไซต์นี้ — ทุกโพสต์ หน้าแรก สินค้า และหน้าธีม — ลงในโฟลเดอร์",
    "Not available from this screen yet — run tovu export from a terminal.": "ยังไม่พร้อมใช้งานจากหน้าจอนี้ — รันคำสั่ง tovu export จากเทอร์มินัล",
    "Build static export": "สร้างการส่งออกแบบสแตติก",
    "Not available yet — see above.": "ยังไม่พร้อมใช้งาน — ดูด้านบน",
    "What Full Site gives you": "เว็บไซต์แบบเต็มรูปแบบให้อะไรกับคุณ",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "เซิร์ฟเวอร์ Tovu แบบสมบูรณ์ — ระบบผู้ดูแล ผู้ช่วย การชำระเงิน ทุกอย่างทำงานได้",
    Providers: "ผู้ให้บริการ",
    Planned: "วางแผนไว้",
    "No credential fields yet — this instance has no backend to store them.":
      "ยังไม่มีช่องกรอกข้อมูลรับรอง — อินสแตนซ์นี้ยังไม่มีแบ็กเอนด์สำหรับจัดเก็บ",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "เครื่องขนาดเล็กที่เปิดใช้งานตลอดเวลาใกล้กับผู้เยี่ยมชมของคุณ — ประมาณ 2–9 ดอลลาร์/เดือน",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "แพลตฟอร์มคอนเทนเนอร์แบบจัดการที่มีขั้นตอนการปรับใช้ที่เรียบง่าย — แพ็กเกจ Hobby เริ่มต้น 5 ดอลลาร์/เดือน",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "แพลตฟอร์มคอนเทนเนอร์แบบจัดการที่มีดิสก์แบบถาวร — แพ็กเกจ Starter เริ่มต้น 7 ดอลลาร์/เดือน (หนึ่งบริการต่อหนึ่งดิสก์)",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "ควบคุมเครื่องได้อย่างเต็มที่ พร้อมความซับซ้อนและราคาแบบเฉพาะของ AWS",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "เครื่องเสมือนแบบเรียบง่าย (Droplet) — แพ็กเกจพื้นฐานเริ่มต้นประมาณ 4–6 ดอลลาร์/เดือน",
    "Any server you already have SSH access to — whatever it already costs you.":
      "เซิร์ฟเวอร์ใดก็ตามที่คุณมีสิทธิ์เข้าถึงผ่าน SSH อยู่แล้ว — ตามค่าใช้จ่ายที่คุณจ่ายอยู่แล้ว",
    "Loading Dockerfile…": "กำลังโหลด Dockerfile…",
    "Not generated yet": "ยังไม่ได้สร้าง",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "ยังไม่มี Dockerfile ที่รากของที่เก็บโค้ด เมื่อมีการเพิ่มแล้ว เนื้อหาจะปรากฏที่นี่",
    Copy: "คัดลอก",
    "Copied!": "คัดลอกแล้ว!",
    Download: "ดาวน์โหลด",
    "Building is a terminal command (docker build …), not a button here.":
      "การสร้างอิมเมจเป็นคำสั่งเทอร์มินัล (docker build …) ไม่ใช่ปุ่มที่นี่",
    "No deploys yet": "ยังไม่มีการปรับใช้",
    "Builds and deploys will show up here once a real host is wired up.":
      "การสร้างและการปรับใช้จะปรากฏที่นี่เมื่อมีการเชื่อมต่อโฮสต์จริง",
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
    "Falls back to a public default.": "Se assente, usa un valore predefinito pubblico.",
    'Falls back to "admin".': 'Se assente, usa "admin".',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "Necessaria per l'avvio in produzione. Se assente in locale, appare invece come errore 503 nella schermata dell'Assistente IA.",
    "Falls back to port 4319.": "Se assente, usa la porta 4319.",
    "What Static Site produces": "Cosa produce il Sito statico",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "Una copia veloce e di sola lettura delle pagine pubblicate di questo sito — senza server dietro.",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "Nessun checkout, nessun pannello di amministrazione online, nessun assistente, niente di dinamico.",
    "Not built yet": "Non ancora realizzato",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu non ha un esportatore statico, e la sitemap da sola non può generarne uno — elenca solo gli articoli pubblicati, non la home page, i prodotti, le pagine del tema, i redirect, la pagina 404 o le risorse.",
    "Static hosts": "Host statici",
    "Build it from a terminal": "Generalo da un terminale",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "Esegui tovu export <dir> e Tovu scrive una copia statica di questo sito — ogni articolo, la home page, i prodotti e le pagine del tema — in una cartella.",
    "Not available from this screen yet — run tovu export from a terminal.": "Non ancora disponibile da questa schermata — esegui tovu export da un terminale.",
    "Build static export": "Genera esportazione statica",
    "Not available yet — see above.": "Non ancora disponibile — vedi sopra.",
    "What Full Site gives you": "Cosa offre il Sito completo",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "Il server Tovu completo — amministrazione, assistente, checkout, tutto funziona.",
    Providers: "Fornitori",
    Planned: "Pianificato",
    "No credential fields yet — this instance has no backend to store them.":
      "Ancora nessun campo per le credenziali — questa istanza non ha un backend per archiviarle.",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "Una piccola macchina sempre attiva vicino ai tuoi visitatori — circa 2–9 $/mese.",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "Una piattaforma di container gestita con un flusso di distribuzione semplice — piano Hobby da 5 $/mese.",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "Una piattaforma di container gestita con dischi persistenti — piano Starter da 7 $/mese (un servizio per disco).",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "Controllo completo sulla macchina, con la complessità e i prezzi tipici di AWS.",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "Una macchina virtuale semplice (Droplet) — piani base da circa 4–6 $/mese.",
    "Any server you already have SSH access to — whatever it already costs you.":
      "Qualsiasi server a cui hai già accesso SSH — al costo che già sostieni.",
    "Loading Dockerfile…": "Caricamento del Dockerfile…",
    "Not generated yet": "Non ancora generato",
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
    "Builds and deploys will show up here once a real host is wired up.":
      "Build e distribuzioni appariranno qui una volta collegato un host reale.",
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
    "Falls back to a public default.": "सेट न होने पर सार्वजनिक डिफ़ॉल्ट का उपयोग करता है।",
    'Falls back to "admin".': 'सेट न होने पर "admin" का उपयोग करता है।',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "प्रोडक्शन में बूट के लिए आवश्यक है। लोकल में न होने पर, इसके बजाय AI असिस्टेंट स्क्रीन पर 503 के रूप में दिखता है।",
    "Falls back to port 4319.": "सेट न होने पर पोर्ट 4319 का उपयोग करता है।",
    "What Static Site produces": "स्थिर साइट क्या उत्पन्न करती है",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "इस साइट के प्रकाशित पृष्ठों की एक तेज़, केवल-पढ़ने योग्य प्रति — इसके पीछे कोई सर्वर नहीं।",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "कोई चेकआउट नहीं, कोई ऑनलाइन एडमिन नहीं, कोई असिस्टेंट नहीं, कुछ भी डायनामिक नहीं।",
    "Not built yet": "अभी नहीं बना",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu के पास कोई स्थिर एक्सपोर्टर नहीं है, और अकेला साइटमैप इसे नहीं बना सकता — यह केवल प्रकाशित पोस्ट सूचीबद्ध करता है, होम पेज, उत्पाद, थीम पेज, रीडायरेक्ट, 404 पेज या एसेट्स नहीं।",
    "Static hosts": "स्थिर होस्ट",
    "Build it from a terminal": "टर्मिनल से बनाएं",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "tovu export <dir> चलाएं और Tovu इस साइट की एक स्थिर प्रति — हर पोस्ट, होम पेज, उत्पाद और थीम पेज — एक फ़ोल्डर में लिखेगा।",
    "Not available from this screen yet — run tovu export from a terminal.": "यह स्क्रीन से अभी उपलब्ध नहीं — टर्मिनल से tovu export चलाएं।",
    "Build static export": "स्थिर एक्सपोर्ट बनाएं",
    "Not available yet — see above.": "अभी उपलब्ध नहीं — ऊपर देखें।",
    "What Full Site gives you": "पूर्ण साइट आपको क्या देती है",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "संपूर्ण Tovu सर्वर — एडमिन, असिस्टेंट, चेकआउट, सब कुछ काम करता है।",
    Providers: "प्रदाता",
    Planned: "नियोजित",
    "No credential fields yet — this instance has no backend to store them.":
      "अभी कोई क्रेडेंशियल फ़ील्ड नहीं — इस इंस्टेंस के पास इन्हें संग्रहीत करने के लिए बैकएंड नहीं है।",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "आपके विज़िटर के पास एक छोटी हमेशा-चालू मशीन — लगभग $2–9/माह।",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "एक सरल डिप्लॉय फ़्लो वाला प्रबंधित कंटेनर प्लेटफ़ॉर्म — Hobby प्लान $5/माह से।",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "स्थायी डिस्क वाला प्रबंधित कंटेनर प्लेटफ़ॉर्म — Starter प्लान $7/माह से (प्रति डिस्क एक सेवा)।",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "मशीन पर पूर्ण नियंत्रण, AWS की अपनी जटिलता और मूल्य निर्धारण के साथ।",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "एक सीधी वर्चुअल मशीन (Droplet) — बेसिक प्लान लगभग $4–6/माह से।",
    "Any server you already have SSH access to — whatever it already costs you.":
      "कोई भी सर्वर जिस तक आपकी पहले से SSH पहुंच है — जो लागत आप पहले से वहन कर रहे हैं।",
    "Loading Dockerfile…": "Dockerfile लोड हो रहा है…",
    "Not generated yet": "अभी उत्पन्न नहीं हुआ",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "रेपो रूट में अभी कोई Dockerfile मौजूद नहीं है। एक बार जोड़े जाने पर, इसकी सामग्री यहां दिखाई देगी।",
    Copy: "कॉपी करें",
    "Copied!": "कॉपी हो गया!",
    Download: "डाउनलोड करें",
    "Building is a terminal command (docker build …), not a button here.":
      "इमेज बनाना एक टर्मिनल कमांड है (docker build …), यहां का बटन नहीं।",
    "No deploys yet": "अभी तक कोई डिप्लॉयमेंट नहीं",
    "Builds and deploys will show up here once a real host is wired up.":
      "वास्तविक होस्ट जुड़ने के बाद बिल्ड और डिप्लॉयमेंट यहां दिखाई देंगे।",
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
    "Falls back to a public default.": "سیٹ نہ ہونے پر عوامی ڈیفالٹ استعمال ہوتا ہے۔",
    'Falls back to "admin".': 'سیٹ نہ ہونے پر "admin" استعمال ہوتا ہے۔',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "پروڈکشن میں بوٹ کے لیے ضروری ہے۔ لوکل میں نہ ہونے کی صورت میں، اس کے بجائے AI اسسٹنٹ اسکرین پر 503 کے طور پر ظاہر ہوتا ہے۔",
    "Falls back to port 4319.": "سیٹ نہ ہونے پر پورٹ 4319 استعمال ہوتا ہے۔",
    "What Static Site produces": "جامد سائٹ کیا پیدا کرتی ہے",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "اس سائٹ کے شائع شدہ صفحات کی تیز، صرف پڑھنے کے قابل کاپی — اس کے پیچھے کوئی سرور نہیں۔",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "کوئی چیک آؤٹ نہیں، کوئی آن لائن ایڈمن نہیں، کوئی اسسٹنٹ نہیں، کچھ بھی متحرک نہیں۔",
    "Not built yet": "ابھی تک نہیں بنایا گیا",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu کے پاس کوئی جامد ایکسپورٹر نہیں ہے، اور اکیلا سائٹ میپ اسے نہیں بنا سکتا — یہ صرف شائع شدہ پوسٹس درج کرتا ہے، ہوم پیج، پروڈکٹس، تھیم پیجز، ری ڈائریکٹس، 404 پیج یا اثاثے نہیں۔",
    "Static hosts": "جامد میزبان",
    "Build it from a terminal": "ٹرمینل سے بنائیں",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "tovu export <dir> چلائیں اور Tovu اس سائٹ کی ایک جامد کاپی — ہر پوسٹ، ہوم پیج، پروڈکٹس اور تھیم پیجز — ایک فولڈر میں لکھے گا۔",
    "Not available from this screen yet — run tovu export from a terminal.": "یہ اسکرین سے ابھی دستیاب نہیں — ٹرمینل سے tovu export چلائیں۔",
    "Build static export": "جامد ایکسپورٹ بنائیں",
    "Not available yet — see above.": "ابھی دستیاب نہیں — اوپر دیکھیں۔",
    "What Full Site gives you": "مکمل سائٹ آپ کو کیا دیتی ہے",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "مکمل Tovu سرور — ایڈمن، اسسٹنٹ، چیک آؤٹ، سب کچھ کام کرتا ہے۔",
    Providers: "فراہم کنندگان",
    Planned: "منصوبہ بند",
    "No credential fields yet — this instance has no backend to store them.":
      "ابھی تک کوئی کریڈینشل فیلڈز نہیں — اس انسٹنس کے پاس انہیں محفوظ کرنے کے لیے بیک اینڈ نہیں ہے۔",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "آپ کے وزیٹرز کے قریب ایک چھوٹی ہمیشہ آن مشین — تقریباً $2–9/ماہ۔",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "ایک آسان ڈیپلائے فلو والا مینیجڈ کنٹینر پلیٹ فارم — Hobby پلان $5/ماہ سے۔",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "مستقل ڈسکس والا مینیجڈ کنٹینر پلیٹ فارم — Starter پلان $7/ماہ سے (فی ڈسک ایک سروس)۔",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "مشین پر مکمل کنٹرول، AWS کی اپنی پیچیدگی اور قیمتوں کے ساتھ۔",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "ایک سیدھی ورچوئل مشین (Droplet) — بنیادی پلانز تقریباً $4–6/ماہ سے۔",
    "Any server you already have SSH access to — whatever it already costs you.":
      "کوئی بھی سرور جس تک آپ کو پہلے ہی SSH رسائی حاصل ہے — جو لاگت آپ پہلے ہی برداشت کر رہے ہیں۔",
    "Loading Dockerfile…": "Dockerfile لوڈ ہو رہا ہے…",
    "Not generated yet": "ابھی تیار نہیں ہوا",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "ریپو کی جڑ میں ابھی تک کوئی Dockerfile موجود نہیں۔ ایک بار شامل ہونے پر، اس کا مواد یہاں ظاہر ہوگا۔",
    Copy: "کاپی کریں",
    "Copied!": "کاپی ہو گیا!",
    Download: "ڈاؤن لوڈ کریں",
    "Building is a terminal command (docker build …), not a button here.":
      "امیج بنانا ایک ٹرمینل کمانڈ ہے (docker build …)، یہاں کا بٹن نہیں۔",
    "No deploys yet": "ابھی تک کوئی ڈیپلائے منٹ نہیں",
    "Builds and deploys will show up here once a real host is wired up.":
      "حقیقی میزبان جڑنے کے بعد بلڈز اور ڈیپلائے منٹس یہاں ظاہر ہوں گے۔",
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
    "Falls back to a public default.": "সেট না থাকলে একটি পাবলিক ডিফল্ট ব্যবহার করে।",
    'Falls back to "admin".': '"admin" ব্যবহার করে সেট না থাকলে।',
    "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.":
      "প্রোডাকশনে বুট করার জন্য প্রয়োজনীয়। লোকালে না থাকলে, পরিবর্তে AI সহায়ক স্ক্রিনে 503 হিসেবে দেখা যাবে।",
    "Falls back to port 4319.": "সেট না থাকলে পোর্ট 4319 ব্যবহার করে।",
    "What Static Site produces": "স্ট্যাটিক সাইট কী তৈরি করে",
    "A fast, read-only copy of this site's published pages — no server behind it.":
      "এই সাইটের প্রকাশিত পৃষ্ঠাগুলোর একটি দ্রুত, শুধুমাত্র-পঠনযোগ্য কপি — এর পিছনে কোনো সার্ভার নেই।",
    "No checkout, no admin online, no assistant, no dynamic anything.":
      "কোনো চেকআউট নেই, কোনো অনলাইন অ্যাডমিন নেই, কোনো সহায়ক নেই, কোনো ডায়নামিক কিছু নেই।",
    "Not built yet": "এখনও তৈরি হয়নি",
    "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.":
      "Tovu-এর কোনো স্ট্যাটিক এক্সপোর্টার নেই, এবং একা সাইটম্যাপ এটি তৈরি করতে পারে না — এটি শুধুমাত্র প্রকাশিত পোস্টগুলো তালিকাভুক্ত করে, হোম পেজ, পণ্য, থিম পেজ, রিডাইরেক্ট, 404 পেজ বা অ্যাসেট নয়।",
    "Static hosts": "স্ট্যাটিক হোস্ট",
    "Build it from a terminal": "টার্মিনাল থেকে তৈরি করুন",
    "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.": "tovu export <dir> চালান এবং Tovu এই সাইটের একটি স্ট্যাটিক কপি — প্রতিটি পোস্ট, হোম পেজ, পণ্য এবং থিম পেজ — একটি ফোল্ডারে লিখবে।",
    "Not available from this screen yet — run tovu export from a terminal.": "এই স্ক্রিন থেকে এখনও উপলব্ধ নয় — টার্মিনাল থেকে tovu export চালান।",
    "Build static export": "স্ট্যাটিক এক্সপোর্ট তৈরি করুন",
    "Not available yet — see above.": "এখনও উপলব্ধ নয় — উপরে দেখুন।",
    "What Full Site gives you": "সম্পূর্ণ সাইট আপনাকে কী দেয়",
    "The complete Tovu server — admin, assistant, checkout, everything works.":
      "সম্পূর্ণ Tovu সার্ভার — অ্যাডমিন, সহায়ক, চেকআউট, সবকিছু কাজ করে।",
    Providers: "প্রদানকারী",
    Planned: "পরিকল্পিত",
    "No credential fields yet — this instance has no backend to store them.":
      "এখনও কোনো পরিচয়পত্র ক্ষেত্র নেই — এই ইনস্ট্যান্সের সেগুলো সংরক্ষণের জন্য কোনো ব্যাকএন্ড নেই।",
    "A small always-on machine close to your visitors — roughly $2–9/mo.":
      "আপনার দর্শকদের কাছাকাছি একটি ছোট সর্বদা-চালু মেশিন — প্রায় $2–9/মাস।",
    "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.":
      "একটি সহজ ডিপ্লয় প্রবাহসহ পরিচালিত কনটেইনার প্ল্যাটফর্ম — Hobby প্ল্যান $5/মাস থেকে।",
    "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).":
      "স্থায়ী ডিস্কসহ পরিচালিত কনটেইনার প্ল্যাটফর্ম — Starter প্ল্যান $7/মাস থেকে (প্রতি ডিস্কে একটি সেবা)।",
    "Full control over the machine, at AWS's own complexity and pricing.":
      "মেশিনের উপর সম্পূর্ণ নিয়ন্ত্রণ, AWS-এর নিজস্ব জটিলতা ও মূল্যসহ।",
    "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.":
      "একটি সহজবোধ্য ভার্চুয়াল মেশিন (Droplet) — মৌলিক প্ল্যান প্রায় $4–6/মাস থেকে।",
    "Any server you already have SSH access to — whatever it already costs you.":
      "যেকোনো সার্ভার যেখানে আপনার ইতিমধ্যে SSH অ্যাক্সেস আছে — যা খরচ আপনি ইতিমধ্যে বহন করছেন।",
    "Loading Dockerfile…": "Dockerfile লোড হচ্ছে…",
    "Not generated yet": "এখনও তৈরি হয়নি",
    "No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.":
      "রিপোর মূলে এখনও কোনো Dockerfile নেই। একবার যোগ করা হলে, এর বিষয়বস্তু এখানে প্রদর্শিত হবে।",
    Copy: "কপি করুন",
    "Copied!": "কপি হয়েছে!",
    Download: "ডাউনলোড করুন",
    "Building is a terminal command (docker build …), not a button here.":
      "ইমেজ তৈরি করা একটি টার্মিনাল কমান্ড (docker build …), এখানকার বাটন নয়।",
    "No deploys yet": "এখনও কোনো ডিপ্লয়মেন্ট নেই",
    "Builds and deploys will show up here once a real host is wired up.":
      "একটি প্রকৃত হোস্ট সংযুক্ত হলে বিল্ড এবং ডিপ্লয়মেন্ট এখানে প্রদর্শিত হবে।",
  },
};

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
  return interpolate(OVERVIEW_LOAD_ERROR_TEMPLATE[locale] ?? OVERVIEW_LOAD_ERROR_TEMPLATE.en, { error });
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
  return interpolate(DOCKERFILE_LOAD_ERROR_TEMPLATE[locale] ?? DOCKERFILE_LOAD_ERROR_TEMPLATE.en, { error });
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
  return interpolate(DOCKERFILE_SAVE_ERROR_TEMPLATE[locale] ?? DOCKERFILE_SAVE_ERROR_TEMPLATE.en, { error });
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
  return interpolate(EXPORT_LOAD_ERROR_TEMPLATE[locale] ?? EXPORT_LOAD_ERROR_TEMPLATE.en, { error });
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
  return interpolate(EXPORT_TRIGGER_ERROR_TEMPLATE[locale] ?? EXPORT_TRIGGER_ERROR_TEMPLATE.en, { error });
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
  return interpolate(EXPORT_POLL_ERROR_TEMPLATE[locale] ?? EXPORT_POLL_ERROR_TEMPLATE.en, { error });
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
  return interpolate(PUBLISH_LOAD_ERROR_TEMPLATE[locale] ?? PUBLISH_LOAD_ERROR_TEMPLATE.en, { error });
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
  return interpolate(PUBLISH_PREVIEW_ERROR_TEMPLATE[locale] ?? PUBLISH_PREVIEW_ERROR_TEMPLATE.en, { error });
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
  return interpolate(PUBLISH_TRIGGER_ERROR_TEMPLATE[locale] ?? PUBLISH_TRIGGER_ERROR_TEMPLATE.en, { error });
}

/** The Static Site tab's publish POLL-error banner — same split and same 2026-08-15 fix
 *  {@link exportPollErrorMessage} documents for the export half of this tab, applied to
 *  `use-static-publish.hooks.ts`'s own poll loop. English-only for now, same partial-locale-coverage
 *  precedent as that function. */
const PUBLISH_POLL_ERROR_TEMPLATE: Record<string, string> = {
  en: "Lost track of this publish's status and stopped checking ({error}). It may still be running — try again in a moment.",
};

export function publishPollErrorMessage(locale: string, error: string): string {
  return interpolate(PUBLISH_POLL_ERROR_TEMPLATE[locale] ?? PUBLISH_POLL_ERROR_TEMPLATE.en, { error });
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
  return interpolate(PUBLISH_CREDENTIALS_LOAD_ERROR_TEMPLATE[locale] ?? PUBLISH_CREDENTIALS_LOAD_ERROR_TEMPLATE.en, { error });
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
  return interpolate(PUBLISH_CREDENTIAL_SAVE_ERROR_TEMPLATE[locale] ?? PUBLISH_CREDENTIAL_SAVE_ERROR_TEMPLATE.en, { error });
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
  return interpolate(PUBLISH_CREDENTIAL_VERIFY_ERROR_TEMPLATE[locale] ?? PUBLISH_CREDENTIAL_VERIFY_ERROR_TEMPLATE.en, { error });
}
