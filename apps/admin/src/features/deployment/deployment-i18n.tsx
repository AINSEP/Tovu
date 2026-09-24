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
    "Set (generated key file)": "Diatur (file kunci yang dibuat)",
    "Invalid — the keyring rejects it": "Tidak valid — keyring menolaknya",
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
    "Set (generated key file)": "Gesetzt (generierte Schlüsseldatei)",
    "Invalid — the keyring rejects it": "Ungültig — der Schlüsselbund lehnt sie ab",
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
    "Set (generated key file)": "已设置（生成的密钥文件）",
    "Invalid — the keyring rejects it": "无效 — 密钥环拒绝了它",
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
    "Set (generated key file)": "已設定（產生的金鑰檔案）",
    "Invalid — the keyring rejects it": "無效 — 金鑰環拒絕了它",
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
    "Set (generated key file)": "Definida (arquivo de chave gerado)",
    "Invalid — the keyring rejects it": "Inválida — o chaveiro a rejeita",
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
    "Set (generated key file)": "Задана (сгенерированный файл ключа)",
    "Invalid — the keyring rejects it": "Недействительна — хранилище ключей её отклоняет",
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
    "Set (generated key file)": "تنظیم‌شده (فایل کلید تولیدشده)",
    "Invalid — the keyring rejects it": "نامعتبر — کلیددان آن را رد می‌کند",
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
    "Set (generated key file)": "مضبوطة (ملف مفتاح مُنشأ)",
    "Invalid — the keyring rejects it": "غير صالحة — حلقة المفاتيح ترفضها",
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
    "Set (generated key file)": "設定済み（生成されたキーファイル）",
    "Invalid — the keyring rejects it": "無効 — キーリングが拒否しています",
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
    "Set (generated key file)": "설정됨(생성된 키 파일)",
    "Invalid — the keyring rejects it": "유효하지 않음 — 키링이 거부합니다",
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
    "Set (generated key file)": "Ustawiona (wygenerowany plik klucza)",
    "Invalid — the keyring rejects it": "Nieprawidłowa — pęk kluczy ją odrzuca",
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
    "Set (generated key file)": "Beállítva (generált kulcsfájl)",
    "Invalid — the keyring rejects it": "Érvénytelen — a kulcstartó elutasítja",
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
    "Set (generated key file)": "Définie (fichier de clé généré)",
    "Invalid — the keyring rejects it": "Invalide — le trousseau la rejette",
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
    "Set (generated key file)": "Задано (згенерований файл ключа)",
    "Invalid — the keyring rejects it": "Недійсна — сховище ключів її відхиляє",
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
    "Set (generated key file)": "Ayarlı (oluşturulan anahtar dosyası)",
    "Invalid — the keyring rejects it": "Geçersiz — anahtarlık bunu reddediyor",
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
    "Set (generated key file)": "ตั้งค่าแล้ว (ไฟล์คีย์ที่สร้างขึ้น)",
    "Invalid — the keyring rejects it": "ไม่ถูกต้อง — คีย์ริงปฏิเสธ",
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
    "Set (generated key file)": "Impostata (file di chiave generato)",
    "Invalid — the keyring rejects it": "Non valida — il portachiavi la rifiuta",
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
    "Set (generated key file)": "सेट है (जनरेट की गई कुंजी फ़ाइल)",
    "Invalid — the keyring rejects it": "अमान्य — कीरिंग इसे अस्वीकार करता है",
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
    "Set (generated key file)": "سیٹ ہے (بنائی گئی کلید فائل)",
    "Invalid — the keyring rejects it": "غلط — کی رنگ اسے مسترد کرتا ہے",
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
    "Set (generated key file)": "সেট করা (তৈরি করা কী ফাইল)",
    "Invalid — the keyring rejects it": "অবৈধ — কীরিং এটি প্রত্যাখ্যান করে",
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
    "Builds and deploys will show up here once a real host is wired up.":
      "একটি প্রকৃত হোস্ট সংযুক্ত হলে বিল্ড এবং ডিপ্লয়মেন্ট এখানে প্রদর্শিত হবে।",
  },
};

/** Strings added with the Static Site publishing UI.  Keep this list separate so every locale gets
 * the same key set; locale-specific entries below deliberately override the English source text. */
const DEPLOYMENT_AUDIT_STRINGS: Record<string, string> = {
  "{count} lines": "{count} lines",
  "Not supported": "Not supported", Supported: "Supported", "No Dockerfile yet": "No Dockerfile yet",
  "Someone else saved a different version of this Dockerfile while you were editing — your changes below were NOT saved.": "Someone else saved a different version of this Dockerfile while you were editing — your changes below were NOT saved.",
  "Its current contents on the server are:": "Its current contents on the server are:", "It was deleted on the server.": "It was deleted on the server.",
  "Your own edits below are untouched. Compare them against the current contents above, reconcile by hand, then Save again.": "Your own edits below are untouched. Compare them against the current contents above, reconcile by hand, then Save again.",
  "Load the current version": "Load the current version", "Available from a terminal": "Available from a terminal",
  "Runs on any static host, including free ones. Nothing dynamic survives the export.": "Runs on any static host, including free ones. Nothing dynamic survives the export.",
  "View Static Site details": "View Static Site details", "Not wired up yet": "Not wired up yet",
  "Needs a host to run on — provider setup is planned, not wired up yet.": "Needs a host to run on — provider setup is planned, not wired up yet.",
  "View Full Site details": "View Full Site details", Set: "Set", Routes: "Routes", succeeded: "succeeded", failed: "failed", "Written to": "Written to", "Failed routes": "Failed routes", "Failed assets": "Failed assets",
  "Tovu writes every published post, the home page, products and theme pages into the folder you name.": "Tovu writes every published post, the home page, products and theme pages into the folder you name.",
  "Copy the export command": "Copy the export command", "Replace <dir> with the folder to write into. It is a required argument — there is no default.": "Replace <dir> with the folder to write into. It is a required argument — there is no default.",
  "Overwrite existing files in the output folder": "Overwrite existing files in the output folder", "Off by default. The exporter refuses to write into a non-empty folder unless this is checked — it never deletes unknown files silently.": "Off by default. The exporter refuses to write into a non-empty folder unless this is checked — it never deletes unknown files silently.",
  "Exporting…": "Exporting…", "Detected on this server": "Detected on this server", "Not detected on this server": "Not detected on this server", "Checking…": "Checking…", "Getting it online": "Getting it online",
  "The export is just a folder of files. Pick where it goes, then either let the assistant drive the CLI or publish straight from here.": "The export is just a folder of files. Pick where it goes, then either let the assistant drive the CLI or publish straight from here.",
  "Publish target": "Publish target", Connected: "Connected", "Fastest — ask the assistant": "Fastest — ask the assistant",
  "Tovu's assistant runs as a command-line coding agent with its own shell, so it can drive this tool to publish the export for you — nothing to paste here, and no credentials stored.": "Tovu's assistant runs as a command-line coding agent with its own shell, so it can drive this tool to publish the export for you — nothing to paste here, and no credentials stored.",
  or: "or", "Need to save more than one token, rename one, or manage every saved credential in one place?": "Need to save more than one token, rename one, or manage every saved credential in one place?", "Create access token": "Create access token", "Loading credentials…": "Loading credentials…", "Account ID": "Account ID", "Shown on your Cloudflare dashboard's own sidebar.": "Shown on your Cloudflare dashboard's own sidebar.", connected: "connected as", Verify: "Verify", "Verifying…": "Verifying…", "Which saved token publishes": "Which saved token publishes", "This workspace has more than one saved": "This workspace has more than one saved", "token. Pick which one Tovu publishes with.": "token. Pick which one Tovu publishes with.", "GitHub owner or org": "GitHub owner or org", Repository: "Repository", "Branch (optional)": "Branch (optional)", "Vercel team (optional)": "Vercel team (optional)", "Publishing…": "Publishing…", "This is immediately live on the public internet once it finishes — there is no draft or review step.": "This is immediately live on the public internet once it finishes — there is no draft or review step.", "Where this publish goes": "Where this publish goes", "The account above only proves you're allowed to publish — this says exactly where this one goes.": "The account above only proves you're allowed to publish — this says exactly where this one goes.", "Base path": "Base path", "None — serves from the domain root": "None — serves from the domain root", Credential: "Credential", "Published:": "Published:",
};

const DEPLOYMENT_AUDIT_ES: Record<string, string> = {
  "{count} lines": "{count} líneas", "Not supported": "No compatible", Supported: "Compatible", "No Dockerfile yet": "Aún no hay Dockerfile",
  "Someone else saved a different version of this Dockerfile while you were editing — your changes below were NOT saved.": "Otra persona guardó una versión distinta de este Dockerfile mientras editabas; los cambios de abajo NO se guardaron.",
  "Its current contents on the server are:": "Su contenido actual en el servidor es:", "It was deleted on the server.": "Se eliminó en el servidor.",
  "Your own edits below are untouched. Compare them against the current contents above, reconcile by hand, then Save again.": "Tus ediciones de abajo no se modificaron. Compáralas con el contenido actual de arriba, reconcilia los cambios manualmente y vuelve a guardar.",
  "Load the current version": "Cargar la versión actual", "Available from a terminal": "Disponible desde una terminal",
  "Runs on any static host, including free ones. Nothing dynamic survives the export.": "Funciona en cualquier alojamiento estático, incluso gratuito. Nada dinámico se conserva al exportar.",
  "View Static Site details": "Ver detalles del sitio estático", "Not wired up yet": "Aún no está conectado",
  "Needs a host to run on — provider setup is planned, not wired up yet.": "Necesita un alojamiento para ejecutarse; la configuración del proveedor está prevista, pero aún no está conectada.",
  "View Full Site details": "Ver detalles del sitio completo", Set: "Configurada", Routes: "Rutas", succeeded: "correctas", failed: "fallidas", "Written to": "Escrito en", "Failed routes": "Rutas fallidas", "Failed assets": "Recursos fallidos",
  "Tovu writes every published post, the home page, products and theme pages into the folder you name.": "Tovu escribe cada publicación publicada, la página de inicio, los productos y las páginas del tema en la carpeta que indiques.",
  "Copy the export command": "Copiar el comando de exportación", "Replace <dir> with the folder to write into. It is a required argument — there is no default.": "Reemplaza <dir> por la carpeta donde escribir. Es un argumento obligatorio; no hay valor predeterminado.",
  "Overwrite existing files in the output folder": "Sobrescribir archivos existentes en la carpeta de salida", "Off by default. The exporter refuses to write into a non-empty folder unless this is checked — it never deletes unknown files silently.": "Está desactivado de forma predeterminada. El exportador no escribe en una carpeta no vacía salvo que se marque esta opción; nunca elimina archivos desconocidos en silencio.",
  "Exporting…": "Exportando…", "Detected on this server": "Detectado en este servidor", "Not detected on this server": "No detectado en este servidor", "Checking…": "Comprobando…", "Getting it online": "Publicarlo en línea",
  "The export is just a folder of files. Pick where it goes, then either let the assistant drive the CLI or publish straight from here.": "La exportación es solo una carpeta de archivos. Elige dónde va y deja que el asistente use la CLI o publícala directamente desde aquí.",
  "Publish target": "Destino de publicación", Connected: "Conectado", "Fastest — ask the assistant": "Lo más rápido: pide al asistente",
  "Tovu's assistant runs as a command-line coding agent with its own shell, so it can drive this tool to publish the export for you — nothing to paste here, and no credentials stored.": "El asistente de Tovu se ejecuta como agente de programación de línea de comandos con su propia consola, por lo que puede usar esta herramienta para publicar la exportación por ti; no hay nada que pegar ni credenciales almacenadas.",
  or: "o", "Need to save more than one token, rename one, or manage every saved credential in one place?": "¿Necesitas guardar más de un token, cambiarle el nombre o administrar todas las credenciales guardadas en un lugar?", "Create access token": "Crear token de acceso", "Loading credentials…": "Cargando credenciales…", "Account ID": "ID de cuenta", "Shown on your Cloudflare dashboard's own sidebar.": "Se muestra en la barra lateral de tu panel de Cloudflare.", connected: "conectado como", Verify: "Verificar", "Verifying…": "Verificando…", "Which saved token publishes": "Qué token guardado publica", "This workspace has more than one saved": "Este espacio de trabajo tiene más de un", "token. Pick which one Tovu publishes with.": "token guardado. Elige cuál usa Tovu para publicar.", "GitHub owner or org": "Propietario u organización de GitHub", Repository: "Repositorio", "Branch (optional)": "Rama (opcional)", "Vercel team (optional)": "Equipo de Vercel (opcional)", "Publishing…": "Publicando…", "This is immediately live on the public internet once it finishes — there is no draft or review step.": "Esto estará en Internet públicamente en cuanto termine; no hay borrador ni paso de revisión.", "Where this publish goes": "Dónde se publica", "The account above only proves you're allowed to publish — this says exactly where this one goes.": "La cuenta anterior solo demuestra que puedes publicar; esto indica exactamente dónde se publica.", "Base path": "Ruta base", "None — serves from the domain root": "Ninguna: se sirve desde la raíz del dominio", Credential: "Credencial", "Published:": "Publicado:",
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
    "{count} baris", "Tidak didukung", "Didukung", "Belum ada Dockerfile", "Orang lain menyimpan versi Dockerfile yang berbeda saat Anda mengedit — perubahan Anda di bawah TIDAK disimpan.", "Isi saat ini di server adalah:", "File itu dihapus di server.", "Suntingan Anda di bawah tidak berubah. Bandingkan dengan isi saat ini di atas, selaraskan secara manual, lalu Simpan lagi.", "Muat versi saat ini", "Tersedia dari terminal", "Berjalan di host statis apa pun, termasuk yang gratis. Tidak ada yang dinamis yang bertahan setelah ekspor.", "Lihat detail Situs Statis", "Belum terhubung", "Memerlukan host untuk berjalan — penyiapan penyedia direncanakan, tetapi belum terhubung.", "Lihat detail Situs Lengkap", "Diatur", "Rute", "berhasil", "gagal", "Ditulis ke", "Rute gagal", "Aset gagal", "Tovu menulis setiap pos yang diterbitkan, halaman utama, produk, dan halaman tema ke dalam folder yang Anda namai.", "Salin perintah ekspor", "Ganti <dir> dengan folder tujuan penulisan. Ini argumen wajib — tidak ada nilai bawaan.", "Timpa file yang ada di folder keluaran", "Nonaktif secara bawaan. Pengekspor menolak menulis ke folder yang tidak kosong kecuali ini dicentang — ia tidak pernah menghapus file yang tidak dikenal secara diam-diam.", "Mengekspor…", "Terdeteksi di server ini", "Tidak terdeteksi di server ini", "Memeriksa…", "Membawanya online", "Ekspor hanyalah folder berisi file. Pilih tujuannya, lalu biarkan asisten menjalankan CLI atau terbitkan langsung dari sini.", "Target publikasi", "Terhubung", "Paling cepat — tanyakan asisten", "Asisten Tovu berjalan sebagai agen pemrograman baris perintah dengan shell sendiri, sehingga dapat menjalankan alat ini untuk menerbitkan ekspor bagi Anda — tidak perlu menempelkan apa pun di sini, dan tidak ada kredensial yang disimpan.", "atau", "Perlu menyimpan lebih dari satu token, mengganti namanya, atau mengelola semua kredensial tersimpan di satu tempat?", "Buat token akses", "Memuat kredensial…", "ID akun", "Ditampilkan di bilah sisi dasbor Cloudflare Anda sendiri.", "terhubung sebagai", "Verifikasi", "Memverifikasi…", "Token tersimpan mana yang menerbitkan", "Ruang kerja ini memiliki lebih dari satu", "token tersimpan. Pilih token yang digunakan Tovu untuk menerbitkan.", "Pemilik atau organisasi GitHub", "Repositori", "Branch (opsional)", "Tim Vercel (opsional)", "Menerbitkan…", "Ini langsung aktif di internet publik setelah selesai — tidak ada tahap draf atau peninjauan.", "Tujuan publikasi ini", "Akun di atas hanya membuktikan bahwa Anda diizinkan menerbitkan — ini menjelaskan tepatnya tujuan publikasi ini.", "Jalur dasar", "Tidak ada — disajikan dari akar domain", "Kredensial", "Diterbitkan:" 
  ]),
  de: auditTranslationEntries([
    "{count} Zeilen", "Nicht unterstützt", "Unterstützt", "Noch kein Dockerfile", "Während Sie dieses Dockerfile bearbeitet haben, hat jemand anderes eine andere Version gespeichert — Ihre Änderungen unten wurden NICHT gespeichert.", "Der aktuelle Inhalt auf dem Server ist:", "Es wurde auf dem Server gelöscht.", "Ihre eigenen Änderungen unten sind unverändert. Vergleichen Sie sie mit dem aktuellen Inhalt oben, führen Sie sie von Hand zusammen und speichern Sie dann erneut.", "Aktuelle Version laden", "Über ein Terminal verfügbar", "Läuft auf jedem statischen Host, auch auf kostenlosen. Beim Export bleibt nichts Dynamisches erhalten.", "Details der statischen Website anzeigen", "Noch nicht verbunden", "Benötigt einen Host zum Ausführen — die Anbieter-Einrichtung ist geplant, aber noch nicht verbunden.", "Details der vollständigen Website anzeigen", "Festgelegt", "Routen", "erfolgreich", "fehlgeschlagen", "Geschrieben nach", "Fehlgeschlagene Routen", "Fehlgeschlagene Assets", "Tovu schreibt jeden veröffentlichten Beitrag, die Startseite, Produkte und Themenseiten in den von Ihnen benannten Ordner.", "Exportbefehl kopieren", "Ersetzen Sie <dir> durch den Ordner, in den geschrieben werden soll. Dies ist ein Pflichtargument — es gibt keinen Standardwert.", "Vorhandene Dateien im Ausgabeordner überschreiben", "Standardmäßig aus. Der Exporter weigert sich, in einen nicht leeren Ordner zu schreiben, solange dies nicht aktiviert ist — unbekannte Dateien werden niemals stillschweigend gelöscht.", "Wird exportiert…", "Auf diesem Server erkannt", "Auf diesem Server nicht erkannt", "Wird geprüft…", "Online bringen", "Der Export ist nur ein Ordner mit Dateien. Wählen Sie sein Ziel und lassen Sie entweder den Assistenten die CLI steuern oder veröffentlichen Sie direkt von hier.", "Veröffentlichungsziel", "Verbunden", "Am schnellsten — fragen Sie den Assistenten", "Tovus Assistent läuft als programmierender Befehlszeilen-Agent mit eigener Shell und kann dieses Werkzeug nutzen, um den Export für Sie zu veröffentlichen — hier ist nichts einzufügen und es werden keine Zugangsdaten gespeichert.", "oder", "Möchten Sie mehr als einen Token speichern, einen umbenennen oder alle gespeicherten Zugangsdaten an einem Ort verwalten?", "Zugriffstoken erstellen", "Zugangsdaten werden geladen…", "Konto-ID", "Wird in der eigenen Seitenleiste Ihres Cloudflare-Dashboards angezeigt.", "verbunden als", "Überprüfen", "Wird überprüft…", "Welcher gespeicherte Token veröffentlicht", "Dieser Arbeitsbereich hat mehr als einen gespeicherten", "Token. Wählen Sie, welchen Tovu zum Veröffentlichen verwendet.", "GitHub-Inhaber oder -Organisation", "Repository", "Branch (optional)", "Vercel-Team (optional)", "Wird veröffentlicht…", "Sobald dies fertig ist, ist es sofort im öffentlichen Internet verfügbar — es gibt keinen Entwurfs- oder Prüfschritt.", "Wohin diese Veröffentlichung geht", "Das Konto oben beweist nur, dass Sie veröffentlichen dürfen — dies zeigt genau, wohin diese Veröffentlichung geht.", "Basispfad", "Keiner — wird vom Stammverzeichnis der Domain bereitgestellt", "Zugangsdaten", "Veröffentlicht:"
  ]),
  fr: auditTranslationEntries([
    "{count} lignes", "Non pris en charge", "Pris en charge", "Pas encore de Dockerfile", "Quelqu’un d’autre a enregistré une version différente de ce Dockerfile pendant que vous le modifiiez — vos modifications ci-dessous n’ont PAS été enregistrées.", "Son contenu actuel sur le serveur est :", "Il a été supprimé sur le serveur.", "Vos propres modifications ci-dessous sont intactes. Comparez-les au contenu actuel ci-dessus, réconciliez-les à la main, puis enregistrez à nouveau.", "Charger la version actuelle", "Disponible depuis un terminal", "Fonctionne sur n’importe quel hébergeur statique, y compris gratuit. Rien de dynamique ne survit à l’exportation.", "Voir les détails du site statique", "Pas encore connecté", "Nécessite un hébergeur pour fonctionner — la configuration du fournisseur est prévue, mais pas encore connectée.", "Voir les détails du site complet", "Défini", "Routes", "réussi", "échoué", "Écrit dans", "Routes échouées", "Ressources échouées", "Tovu écrit chaque publication, la page d’accueil, les produits et les pages de thème publiés dans le dossier que vous indiquez.", "Copier la commande d’exportation", "Remplacez <dir> par le dossier dans lequel écrire. C’est un argument obligatoire — il n’y a pas de valeur par défaut.", "Écraser les fichiers existants dans le dossier de sortie", "Désactivé par défaut. L’exportateur refuse d’écrire dans un dossier non vide sauf si cette option est cochée — il ne supprime jamais silencieusement des fichiers inconnus.", "Exportation…", "Détecté sur ce serveur", "Non détecté sur ce serveur", "Vérification…", "Mettre en ligne", "L’exportation n’est qu’un dossier de fichiers. Choisissez où elle va, puis laissez l’assistant piloter la CLI ou publiez directement depuis ici.", "Cible de publication", "Connecté", "Le plus rapide — demandez à l’assistant", "L’assistant de Tovu s’exécute comme un agent de programmation en ligne de commande avec son propre shell ; il peut donc utiliser cet outil pour publier l’exportation pour vous — rien à coller ici et aucun identifiant stocké.", "ou", "Besoin d’enregistrer plus d’un jeton, d’en renommer un ou de gérer tous les identifiants enregistrés au même endroit ?", "Créer un jeton d’accès", "Chargement des identifiants…", "ID de compte", "Affiché dans la barre latérale de votre propre tableau de bord Cloudflare.", "connecté en tant que", "Vérifier", "Vérification…", "Quel jeton enregistré publie", "Cet espace de travail contient plus d’un", "jeton enregistré. Choisissez celui que Tovu utilise pour publier.", "Propriétaire ou organisation GitHub", "Dépôt", "Branche (facultatif)", "Équipe Vercel (facultatif)", "Publication…", "Ce sera immédiatement en ligne sur Internet public une fois terminé — il n’y a aucune étape de brouillon ou de révision.", "Où va cette publication", "Le compte ci-dessus prouve seulement que vous êtes autorisé à publier — ceci indique exactement où va celle-ci.", "Chemin de base", "Aucun — servi depuis la racine du domaine", "Identifiant", "Publié :"
  ]),
  it: auditTranslationEntries([
    "{count} righe", "Non supportato", "Supportato", "Nessun Dockerfile ancora", "Qualcun altro ha salvato una versione diversa di questo Dockerfile mentre lo modificavi — le modifiche qui sotto NON sono state salvate.", "Il contenuto attuale sul server è:", "È stato eliminato sul server.", "Le tue modifiche qui sotto sono intatte. Confrontale con il contenuto attuale sopra, riconciliale a mano, quindi salva di nuovo.", "Carica la versione attuale", "Disponibile da un terminale", "Funziona su qualsiasi host statico, inclusi quelli gratuiti. Nulla di dinamico sopravvive all’esportazione.", "Visualizza i dettagli del sito statico", "Non ancora collegato", "Richiede un host su cui eseguire — la configurazione del provider è pianificata, ma non ancora collegata.", "Visualizza i dettagli del sito completo", "Impostato", "Percorsi", "riuscito", "non riuscito", "Scritto in", "Percorsi non riusciti", "Risorse non riuscite", "Tovu scrive ogni post pubblicato, la home page, i prodotti e le pagine del tema nella cartella che indichi.", "Copia il comando di esportazione", "Sostituisci <dir> con la cartella in cui scrivere. È un argomento obbligatorio — non esiste un valore predefinito.", "Sovrascrivi i file esistenti nella cartella di output", "Disattivato per impostazione predefinita. L’esportatore rifiuta di scrivere in una cartella non vuota a meno che questa opzione non sia selezionata — non elimina mai silenziosamente file sconosciuti.", "Esportazione…", "Rilevato su questo server", "Non rilevato su questo server", "Verifica…", "Mettilo online", "L’esportazione è solo una cartella di file. Scegli dove va, poi lascia che l’assistente gestisca la CLI oppure pubblica direttamente da qui.", "Destinazione di pubblicazione", "Connesso", "Più veloce — chiedi all’assistente", "L’assistente di Tovu funziona come agente di programmazione da riga di comando con una shell propria, quindi può usare questo strumento per pubblicare l’esportazione per te — qui non c’è nulla da incollare e non vengono salvate credenziali.", "oppure", "Devi salvare più di un token, rinominarne uno o gestire tutte le credenziali salvate in un unico posto?", "Crea token di accesso", "Caricamento credenziali…", "ID account", "Mostrato nella barra laterale della tua dashboard Cloudflare.", "connesso come", "Verifica", "Verifica in corso…", "Quale token salvato pubblica", "Questo spazio di lavoro ha più di un", "token salvato. Scegli quale usa Tovu per pubblicare.", "Proprietario o organizzazione GitHub", "Repository", "Ramo (facoltativo)", "Team Vercel (facoltativo)", "Pubblicazione…", "Sarà immediatamente online su Internet pubblico al termine — non esiste una fase di bozza o revisione.", "Dove va questa pubblicazione", "L’account sopra dimostra solo che puoi pubblicare — questo indica esattamente dove va questa pubblicazione.", "Percorso di base", "Nessuno — servito dalla radice del dominio", "Credenziale", "Pubblicato:"
  ]),
  "pt-BR": auditTranslationEntries([
    "{count} linhas", "Não compatível", "Compatível", "Ainda não há Dockerfile", "Outra pessoa salvou uma versão diferente deste Dockerfile enquanto você editava — suas alterações abaixo NÃO foram salvas.", "O conteúdo atual no servidor é:", "Ele foi excluído no servidor.", "Suas próprias edições abaixo permanecem intactas. Compare-as com o conteúdo atual acima, reconcilie manualmente e salve novamente.", "Carregar a versão atual", "Disponível em um terminal", "Funciona em qualquer hospedagem estática, inclusive gratuita. Nada dinâmico sobrevive à exportação.", "Ver detalhes do site estático", "Ainda não conectado", "Precisa de uma hospedagem para executar — a configuração do provedor está planejada, mas ainda não está conectada.", "Ver detalhes do site completo", "Definido", "Rotas", "bem-sucedido", "falhou", "Gravado em", "Rotas com falha", "Recursos com falha", "O Tovu grava cada post publicado, a página inicial, os produtos e as páginas do tema na pasta que você nomear.", "Copiar o comando de exportação", "Substitua <dir> pela pasta onde gravar. É um argumento obrigatório — não há padrão.", "Substituir arquivos existentes na pasta de saída", "Desativado por padrão. O exportador se recusa a gravar em uma pasta não vazia a menos que isto seja marcado — ele nunca exclui arquivos desconhecidos silenciosamente.", "Exportando…", "Detectado neste servidor", "Não detectado neste servidor", "Verificando…", "Colocar online", "A exportação é apenas uma pasta de arquivos. Escolha para onde ela vai e deixe o assistente controlar a CLI ou publique diretamente daqui.", "Destino de publicação", "Conectado", "Mais rápido — peça ao assistente", "O assistente do Tovu funciona como um agente de programação de linha de comando com seu próprio shell, por isso pode usar esta ferramenta para publicar a exportação para você — nada para colar aqui e nenhuma credencial armazenada.", "ou", "Precisa salvar mais de um token, renomear um ou gerenciar todas as credenciais salvas em um só lugar?", "Criar token de acesso", "Carregando credenciais…", "ID da conta", "Exibido na própria barra lateral do seu painel do Cloudflare.", "conectado como", "Verificar", "Verificando…", "Qual token salvo publica", "Este espaço de trabalho tem mais de um", "token salvo. Escolha qual o Tovu usa para publicar.", "Proprietário ou organização do GitHub", "Repositório", "Branch (opcional)", "Equipe Vercel (opcional)", "Publicando…", "Isto fica imediatamente ativo na internet pública quando termina — não há etapa de rascunho ou revisão.", "Para onde vai esta publicação", "A conta acima apenas prova que você tem permissão para publicar — isto informa exatamente para onde esta publicação vai.", "Caminho base", "Nenhum — servido a partir da raiz do domínio", "Credencial", "Publicado:"
  ]),
  "zh-CN": auditTranslationEntries([
    "{count} 行", "不支持", "支持", "尚无 Dockerfile", "您编辑此 Dockerfile 时，其他人保存了不同版本——您下方的更改未保存。", "服务器上的当前内容为：", "它已在服务器上删除。", "您下方的编辑未受影响。请与上方当前内容比较，手动协调后再次保存。", "加载当前版本", "可在终端中使用", "可在任何静态主机上运行，包括免费主机。导出后不会保留任何动态内容。", "查看静态站点详情", "尚未连接", "需要主机才能运行——已计划配置提供商，但尚未连接。", "查看完整站点详情", "已设置", "路由", "成功", "失败", "写入到", "失败的路由", "失败的资源", "Tovu 会将每篇已发布文章、主页、产品和主题页面写入您指定的文件夹。", "复制导出命令", "将 <dir> 替换为要写入的文件夹。这是必填参数——没有默认值。", "覆盖输出文件夹中的现有文件", "默认关闭。除非选中此项，否则导出器拒绝写入非空文件夹——它绝不会悄悄删除未知文件。", "正在导出…", "已在此服务器上检测到", "未在此服务器上检测到", "正在检查…", "上线发布", "导出只是一个文件夹。选择其去向，然后让助手操作 CLI，或直接在此发布。", "发布目标", "已连接", "最快方式——询问助手", "Tovu 的助手作为拥有自己 shell 的命令行编程代理运行，因此它可以操作此工具为您发布导出内容——这里无需粘贴任何内容，也不会存储凭据。", "或", "需要保存多个令牌、重命名令牌，或在一处管理所有已保存凭据？", "创建访问令牌", "正在加载凭据…", "账户 ID", "显示在您自己的 Cloudflare 仪表板侧边栏中。", "连接为", "验证", "正在验证…", "哪个已保存令牌用于发布", "此工作区保存了多个", "令牌。请选择 Tovu 用于发布的令牌。", "GitHub 所有者或组织", "仓库", "分支（可选）", "Vercel 团队（可选）", "正在发布…", "完成后会立即在公共互联网上上线——没有草稿或审核步骤。", "此次发布的去向", "上方账户仅证明您有发布权限——这里明确说明此次发布的确切去向。", "基础路径", "无——从域名根目录提供服务", "凭据", "已发布："
  ]),
  "zh-TW": auditTranslationEntries([
    "{count} 行", "不支援", "支援", "尚無 Dockerfile", "您編輯此 Dockerfile 時，其他人儲存了不同版本——您下方的變更未儲存。", "伺服器上的目前內容為：", "它已在伺服器上刪除。", "您下方的編輯未受影響。請與上方目前內容比較，手動協調後再次儲存。", "載入目前版本", "可從終端機使用", "可在任何靜態主機上執行，包括免費主機。匯出後不會保留任何動態內容。", "檢視靜態網站詳細資料", "尚未連線", "需要主機才能執行——已規劃設定供應商，但尚未連線。", "檢視完整網站詳細資料", "已設定", "路由", "成功", "失敗", "寫入至", "失敗的路由", "失敗的資源", "Tovu 會將每篇已發佈文章、首頁、產品和佈景主題頁面寫入您指定的資料夾。", "複製匯出命令", "將 <dir> 替換為要寫入的資料夾。這是必要引數——沒有預設值。", "覆寫輸出資料夾中的現有檔案", "預設為關閉。除非勾選此項，否則匯出工具會拒絕寫入非空資料夾——它絕不會悄悄刪除未知檔案。", "正在匯出…", "已在此伺服器上偵測到", "未在此伺服器上偵測到", "正在檢查…", "上線發佈", "匯出只是一個檔案資料夾。選擇其去向，然後讓助理操作 CLI，或直接從這裡發佈。", "發佈目標", "已連線", "最快方式——詢問助理", "Tovu 的助理以擁有自己 shell 的命令列程式設計代理身分執行，因此可以操作此工具為您發佈匯出內容——這裡無需貼上任何內容，也不會儲存憑證。", "或", "需要儲存多個權杖、重新命名權杖，或在一處管理所有已儲存憑證嗎？", "建立存取權杖", "正在載入憑證…", "帳戶 ID", "顯示在您自己的 Cloudflare 儀表板側邊欄中。", "連線身分", "驗證", "正在驗證…", "哪個已儲存權杖用於發佈", "此工作區儲存了多個", "權杖。請選擇 Tovu 用於發佈的權杖。", "GitHub 擁有者或組織", "儲存庫", "分支（選用）", "Vercel 團隊（選用）", "正在發佈…", "完成後會立即在公開網際網路上線——沒有草稿或審核步驟。", "此次發佈的去向", "上方帳戶僅證明您有發佈權限——這裡明確說明此次發佈的確切去向。", "基礎路徑", "無——從網域根目錄提供服務", "憑證", "已發佈："
  ]),
  ja: auditTranslationEntries([
    "{count} 行", "非対応", "対応", "Dockerfile はまだありません", "編集中に別のユーザーがこの Dockerfile の別バージョンを保存しました。下の変更は保存されていません。", "サーバー上の現在の内容:", "サーバー上で削除されました。", "下の編集内容はそのままです。上の現在の内容と比較して手動で調整し、もう一度保存してください。", "現在のバージョンを読み込む", "ターミナルから利用可能", "無料のものを含む任意の静的ホストで動作します。エクスポート後に動的な機能は残りません。", "静的サイトの詳細を見る", "まだ接続されていません", "実行するにはホストが必要です。プロバイダー設定は予定されていますが、まだ接続されていません。", "完全なサイトの詳細を見る", "設定済み", "ルート", "成功", "失敗", "書き込み先", "失敗したルート", "失敗したアセット", "Tovu は公開済みの各投稿、ホームページ、商品、テーマページを指定したフォルダーに書き出します。", "エクスポートコマンドをコピー", "<dir> を書き込み先フォルダーに置き換えてください。必須の引数で、既定値はありません。", "出力フォルダー内の既存ファイルを上書きする", "既定ではオフです。これを選択しない限り、エクスポーターは空でないフォルダーへの書き込みを拒否します。不明なファイルを黙って削除することはありません。", "エクスポート中…", "このサーバーで検出", "このサーバーでは未検出", "確認中…", "オンラインにする", "エクスポートは単なるファイルフォルダーです。保存先を選び、アシスタントに CLI を操作させるか、ここから直接公開します。", "公開先", "接続済み", "最速 — アシスタントに依頼", "Tovu のアシスタントは専用シェルを持つコマンドラインのコーディングエージェントとして動作するため、このツールでエクスポートを公開できます。ここに貼り付けるものはなく、資格情報も保存されません。", "または", "複数のトークンを保存、名前変更、または保存済み資格情報を一か所で管理しますか？", "アクセストークンを作成", "資格情報を読み込み中…", "アカウント ID", "Cloudflare ダッシュボードのサイドバーに表示されます。", "接続先", "検証", "検証中…", "どの保存済みトークンで公開するか", "このワークスペースには複数の保存済み", "トークンがあります。Tovu が公開に使うものを選んでください。", "GitHub 所有者または組織", "リポジトリ", "ブランチ（任意）", "Vercel チーム（任意）", "公開中…", "完了するとすぐに公開インターネット上で公開されます。下書きやレビューの手順はありません。", "この公開先", "上のアカウントは公開の権限を示すだけです。ここでは今回の公開先を正確に指定します。", "ベースパス", "なし — ドメインのルートから提供", "資格情報", "公開済み:"
  ]),
  ko: auditTranslationEntries([
    "{count}줄", "지원되지 않음", "지원됨", "Dockerfile이 아직 없습니다", "편집하는 동안 다른 사용자가 이 Dockerfile의 다른 버전을 저장했습니다. 아래 변경 사항은 저장되지 않았습니다.", "서버의 현재 내용:", "서버에서 삭제되었습니다.", "아래의 편집 내용은 그대로입니다. 위의 현재 내용과 비교하여 수동으로 조정한 후 다시 저장하세요.", "현재 버전 불러오기", "터미널에서 사용 가능", "무료 호스트를 포함한 모든 정적 호스트에서 실행됩니다. 내보낸 뒤에는 동적 기능이 남지 않습니다.", "정적 사이트 세부 정보 보기", "아직 연결되지 않음", "실행하려면 호스트가 필요합니다. 제공업체 설정은 계획되어 있지만 아직 연결되지 않았습니다.", "전체 사이트 세부 정보 보기", "설정됨", "경로", "성공", "실패", "작성 위치", "실패한 경로", "실패한 자산", "Tovu는 게시된 모든 글, 홈 페이지, 제품 및 테마 페이지를 지정한 폴더에 씁니다.", "내보내기 명령 복사", "<dir>을 쓸 폴더로 바꾸세요. 필수 인수이며 기본값은 없습니다.", "출력 폴더의 기존 파일 덮어쓰기", "기본적으로 꺼져 있습니다. 이를 선택하지 않으면 내보내기가 비어 있지 않은 폴더에 쓰기를 거부하며, 알 수 없는 파일을 조용히 삭제하지 않습니다.", "내보내는 중…", "이 서버에서 감지됨", "이 서버에서 감지되지 않음", "확인 중…", "온라인으로 게시", "내보내기는 파일 폴더일 뿐입니다. 위치를 선택한 후 도우미가 CLI를 실행하게 하거나 여기에서 바로 게시하세요.", "게시 대상", "연결됨", "가장 빠른 방법 — 도우미에게 요청", "Tovu 도우미는 자체 셸을 가진 명령줄 코딩 에이전트로 실행되므로 이 도구를 사용해 내보내기를 게시할 수 있습니다. 여기에 붙여 넣을 내용도 없고 자격 증명도 저장되지 않습니다.", "또는", "토큰을 둘 이상 저장하거나 이름을 바꾸거나, 저장된 모든 자격 증명을 한 곳에서 관리해야 하나요?", "액세스 토큰 만들기", "자격 증명 불러오는 중…", "계정 ID", "Cloudflare 대시보드의 자체 사이드바에 표시됩니다.", "다음으로 연결됨", "확인", "확인 중…", "어떤 저장된 토큰으로 게시할지", "이 작업 공간에는 저장된", "토큰이 둘 이상 있습니다. Tovu가 게시에 사용할 토큰을 선택하세요.", "GitHub 소유자 또는 조직", "리포지토리", "브랜치(선택 사항)", "Vercel 팀(선택 사항)", "게시 중…", "완료되면 즉시 공개 인터넷에 게시됩니다. 초안이나 검토 단계는 없습니다.", "이번 게시의 대상", "위 계정은 게시 권한이 있음을 증명할 뿐입니다. 여기에서 이번 게시가 정확히 어디로 가는지 지정합니다.", "기본 경로", "없음 — 도메인 루트에서 제공", "자격 증명", "게시됨:"
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
  "Commit message": "Commit message",
  "Used as the commit message when Tovu pushes the export to the gh-pages branch.": "Used as the commit message when Tovu pushes the export to the gh-pages branch.",
  "Vercel project name": "Vercel project name",
  "Vercel finds or creates a project with this name on every publish.": "Vercel finds or creates a project with this name on every publish.",
  "Site name": "Site name",
  "Netlify finds or creates a site with this name on every publish.": "Netlify finds or creates a site with this name on every publish.",
  "Project name": "Project name",
  "Cloudflare Pages finds or creates a project with this name on every publish.": "Cloudflare Pages finds or creates a project with this name on every publish.",
  "Not started": "Not started",
  "Export failed": "Export failed",
  "Finished with failures": "Finished with failures",
  "Export finished": "Export finished",
  "Publish failed": "Publish failed",
  "Creates the repo, pushes the exported folder, and switches GitHub Pages on.": "Creates the repo, pushes the exported folder, and switches GitHub Pages on.",
  "Deploys the exported folder straight to Vercel.": "Deploys the exported folder straight to Vercel.",
  "Copy this request to the assistant (GitHub CLI)": "Copy this request to the assistant (GitHub CLI)",
  "Copy this request to the assistant (Vercel CLI)": "Copy this request to the assistant (Vercel CLI)",
  'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents and Pages permissions set to Read and write.': 'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents and Pages permissions set to Read and write.',
  "An access token from your Vercel account.": "An access token from your Vercel account.",
  "A personal access token from your Netlify account.": "A personal access token from your Netlify account.",
  "Needs an API token with Cloudflare Pages Edit permission, plus the account ID shown on your Cloudflare dashboard's own sidebar — Cloudflare cannot resolve a project without it.": "Needs an API token with Cloudflare Pages Edit permission, plus the account ID shown on your Cloudflare dashboard's own sidebar — Cloudflare cannot resolve a project without it.",
  "This workspace can't use your computer's terminal — connecting here is the only way to publish.": "This workspace can't use your computer's terminal — connecting here is the only way to publish.",
  "Save a personal access token so Tovu can publish on your behalf.": "Save a personal access token so Tovu can publish on your behalf.",
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
    "Esta conexión ya se guardó; recarga la página e inténtalo de nuevo.", "Error desconocido", "Páginas, publicaciones y productos", "Pago y pedidos", "Panel de administración, en línea", "Asistente de IA", "Mensaje de confirmación", "Se usa como mensaje de confirmación cuando Tovu envía la exportación a la rama gh-pages.", "Nombre del proyecto de Vercel", "Vercel busca o crea un proyecto con este nombre en cada publicación.", "Nombre del sitio", "Netlify busca o crea un sitio con este nombre en cada publicación.", "Nombre del proyecto", "Cloudflare Pages busca o crea un proyecto con este nombre en cada publicación.", "Sin iniciar", "La exportación falló", "Terminó con errores", "La exportación terminó", "La publicación falló", "Crea el repositorio, envía la carpeta exportada y activa GitHub Pages.", "Publica la carpeta exportada directamente en Vercel.", "Copiar esta solicitud al asistente (GitHub CLI)", "Copiar esta solicitud al asistente (Vercel CLI)", "Necesita un token de acceso personal clásico con el alcance \"repo\", o un token de granularidad fina con permisos Contents y Pages configurados en Read and write.", "Un token de acceso de tu cuenta de Vercel.", "Un token de acceso personal de tu cuenta de Netlify.", "Necesita un token de API con permiso Cloudflare Pages Edit, además del ID de cuenta que aparece en la barra lateral de tu panel de Cloudflare; Cloudflare no puede resolver un proyecto sin él.", "Este espacio de trabajo no puede usar el terminal de tu computadora; conectarte aquí es la única forma de publicar.", "Guarda un token de acceso personal para que Tovu pueda publicar en tu nombre."
  ]),
  id: candidateGapTranslationEntries([
    "Koneksi ini sudah disimpan — muat ulang halaman dan coba lagi.", "Kesalahan tidak diketahui", "Halaman, pos & produk", "Checkout & pesanan", "Panel admin, online", "Asisten AI", "Pesan commit", "Digunakan sebagai pesan commit saat Tovu mendorong ekspor ke branch gh-pages.", "Nama proyek Vercel", "Vercel menemukan atau membuat proyek dengan nama ini setiap kali menerbitkan.", "Nama situs", "Netlify menemukan atau membuat situs dengan nama ini setiap kali menerbitkan.", "Nama proyek", "Cloudflare Pages menemukan atau membuat proyek dengan nama ini setiap kali menerbitkan.", "Belum dimulai", "Ekspor gagal", "Selesai dengan kegagalan", "Ekspor selesai", "Publikasi gagal", "Membuat repo, mendorong folder hasil ekspor, dan menyalakan GitHub Pages.", "Menerapkan folder hasil ekspor langsung ke Vercel.", "Salin permintaan ini ke asisten (GitHub CLI)", "Salin permintaan ini ke asisten (Vercel CLI)", "Memerlukan token akses pribadi klasik dengan cakupan \"repo\", atau token terperinci dengan izin Contents dan Pages yang disetel ke Read and write.", "Token akses dari akun Vercel Anda.", "Token akses pribadi dari akun Netlify Anda.", "Memerlukan token API dengan izin Cloudflare Pages Edit, serta ID akun yang ditampilkan di sidebar dasbor Cloudflare Anda — Cloudflare tidak dapat menentukan proyek tanpa itu.", "Ruang kerja ini tidak dapat menggunakan terminal komputer Anda — menghubungkan di sini adalah satu-satunya cara untuk menerbitkan.", "Simpan token akses pribadi agar Tovu dapat menerbitkan atas nama Anda."
  ]),
  de: candidateGapTranslationEntries([
    "Diese Verbindung wurde bereits gespeichert — laden Sie die Seite neu und versuchen Sie es erneut.", "Unbekannter Fehler", "Seiten, Beiträge und Produkte", "Checkout und Bestellungen", "Admin-Bereich, online", "KI-Assistent", "Commit-Nachricht", "Wird als Commit-Nachricht verwendet, wenn Tovu den Export in den Branch gh-pages pusht.", "Vercel-Projektname", "Vercel findet oder erstellt bei jeder Veröffentlichung ein Projekt mit diesem Namen.", "Website-Name", "Netlify findet oder erstellt bei jeder Veröffentlichung eine Website mit diesem Namen.", "Projektname", "Cloudflare Pages findet oder erstellt bei jeder Veröffentlichung ein Projekt mit diesem Namen.", "Nicht gestartet", "Export fehlgeschlagen", "Mit Fehlern beendet", "Export abgeschlossen", "Veröffentlichung fehlgeschlagen", "Erstellt das Repository, pusht den exportierten Ordner und aktiviert GitHub Pages.", "Stellt den exportierten Ordner direkt bei Vercel bereit.", "Diese Anfrage an den Assistenten kopieren (GitHub CLI)", "Diese Anfrage an den Assistenten kopieren (Vercel CLI)", "Benötigt einen klassischen persönlichen Zugriffstoken mit dem Bereich \"repo\" oder einen feingranularen Token mit den Berechtigungen Contents und Pages auf Read and write.", "Ein Zugriffstoken aus Ihrem Vercel-Konto.", "Ein persönlicher Zugriffstoken aus Ihrem Netlify-Konto.", "Benötigt einen API-Token mit der Berechtigung Cloudflare Pages Edit sowie die Konto-ID aus der Seitenleiste Ihres Cloudflare-Dashboards — ohne sie kann Cloudflare kein Projekt auflösen.", "Dieser Arbeitsbereich kann das Terminal Ihres Computers nicht verwenden — die Verbindung hier ist die einzige Möglichkeit zu veröffentlichen.", "Speichern Sie einen persönlichen Zugriffstoken, damit Tovu in Ihrem Namen veröffentlichen kann."
  ]),
  fr: candidateGapTranslationEntries([
    "Cette connexion est déjà enregistrée — rechargez la page et réessayez.", "Erreur inconnue", "Pages, publications et produits", "Paiement et commandes", "Panneau d’administration, en ligne", "Assistant IA", "Message de commit", "Utilisé comme message de commit lorsque Tovu envoie l’export vers la branche gh-pages.", "Nom du projet Vercel", "Vercel trouve ou crée un projet portant ce nom à chaque publication.", "Nom du site", "Netlify trouve ou crée un site portant ce nom à chaque publication.", "Nom du projet", "Cloudflare Pages trouve ou crée un projet portant ce nom à chaque publication.", "Non démarré", "Échec de l’exportation", "Terminé avec des échecs", "Exportation terminée", "Échec de la publication", "Crée le dépôt, envoie le dossier exporté et active GitHub Pages.", "Déploie directement le dossier exporté sur Vercel.", "Copier cette demande à l’assistant (GitHub CLI)", "Copier cette demande à l’assistant (Vercel CLI)", "Nécessite un jeton d’accès personnel classique avec la portée \"repo\", ou un jeton à granularité fine avec les autorisations Contents et Pages réglées sur Read and write.", "Un jeton d’accès de votre compte Vercel.", "Un jeton d’accès personnel de votre compte Netlify.", "Nécessite un jeton API avec l’autorisation Cloudflare Pages Edit, ainsi que l’ID de compte affiché dans la barre latérale de votre tableau de bord Cloudflare — Cloudflare ne peut pas résoudre un projet sans lui.", "Cet espace de travail ne peut pas utiliser le terminal de votre ordinateur — vous connecter ici est la seule façon de publier.", "Enregistrez un jeton d’accès personnel afin que Tovu puisse publier en votre nom."
  ]),
  it: candidateGapTranslationEntries([
    "Questa connessione è già stata salvata — ricarica la pagina e riprova.", "Errore sconosciuto", "Pagine, post e prodotti", "Checkout e ordini", "Pannello di amministrazione, online", "Assistente IA", "Messaggio di commit", "Usato come messaggio di commit quando Tovu invia l’esportazione al branch gh-pages.", "Nome del progetto Vercel", "Vercel trova o crea un progetto con questo nome a ogni pubblicazione.", "Nome del sito", "Netlify trova o crea un sito con questo nome a ogni pubblicazione.", "Nome del progetto", "Cloudflare Pages trova o crea un progetto con questo nome a ogni pubblicazione.", "Non avviato", "Esportazione non riuscita", "Terminato con errori", "Esportazione terminata", "Pubblicazione non riuscita", "Crea il repository, invia la cartella esportata e attiva GitHub Pages.", "Distribuisce la cartella esportata direttamente su Vercel.", "Copia questa richiesta all’assistente (GitHub CLI)", "Copia questa richiesta all’assistente (Vercel CLI)", "Richiede un token di accesso personale classico con l’ambito \"repo\", oppure un token granulare con i permessi Contents e Pages impostati su Read and write.", "Un token di accesso dal tuo account Vercel.", "Un token di accesso personale dal tuo account Netlify.", "Richiede un token API con il permesso Cloudflare Pages Edit, oltre all’ID account mostrato nella barra laterale del tuo dashboard Cloudflare — Cloudflare non può risolvere un progetto senza di esso.", "Questo spazio di lavoro non può usare il terminale del tuo computer — collegarti qui è l’unico modo per pubblicare.", "Salva un token di accesso personale affinché Tovu possa pubblicare per tuo conto."
  ]),
  "pt-BR": candidateGapTranslationEntries([
    "Esta conexão já foi salva — recarregue a página e tente novamente.", "Erro desconhecido", "Páginas, posts e produtos", "Checkout e pedidos", "Painel administrativo, online", "Assistente de IA", "Mensagem de commit", "Usada como mensagem de commit quando o Tovu envia a exportação para a branch gh-pages.", "Nome do projeto Vercel", "A Vercel encontra ou cria um projeto com este nome em cada publicação.", "Nome do site", "A Netlify encontra ou cria um site com este nome em cada publicação.", "Nome do projeto", "A Cloudflare Pages encontra ou cria um projeto com este nome em cada publicação.", "Não iniciado", "A exportação falhou", "Terminou com falhas", "Exportação concluída", "A publicação falhou", "Cria o repositório, envia a pasta exportada e ativa o GitHub Pages.", "Implanta a pasta exportada diretamente na Vercel.", "Copiar esta solicitação para o assistente (GitHub CLI)", "Copiar esta solicitação para o assistente (Vercel CLI)", "Precisa de um token de acesso pessoal clássico com o escopo \"repo\", ou de um token refinado com as permissões Contents e Pages definidas como Read and write.", "Um token de acesso da sua conta Vercel.", "Um token de acesso pessoal da sua conta Netlify.", "Precisa de um token de API com a permissão Cloudflare Pages Edit, além do ID da conta exibido na barra lateral do seu painel da Cloudflare — a Cloudflare não consegue resolver um projeto sem ele.", "Este espaço de trabalho não pode usar o terminal do seu computador — conectar aqui é a única forma de publicar.", "Salve um token de acesso pessoal para que o Tovu possa publicar em seu nome."
  ]),
  "zh-CN": candidateGapTranslationEntries([
    "此连接已保存——请重新加载页面后重试。", "未知错误", "页面、文章和产品", "结账和订单", "管理面板，在线", "AI 助手", "提交消息", "Tovu 将导出内容推送到 gh-pages 分支时，会使用此消息作为提交消息。", "Vercel 项目名称", "Vercel 会在每次发布时查找或创建使用此名称的项目。", "站点名称", "Netlify 会在每次发布时查找或创建使用此名称的站点。", "项目名称", "Cloudflare Pages 会在每次发布时查找或创建使用此名称的项目。", "尚未开始", "导出失败", "完成但有失败", "导出完成", "发布失败", "创建仓库、推送导出文件夹，并启用 GitHub Pages。", "将导出文件夹直接部署到 Vercel。", "将此请求复制给助手（GitHub CLI）", "将此请求复制给助手（Vercel CLI）", "需要具有 \"repo\" 范围的经典个人访问令牌，或将 Contents 和 Pages 权限设为 Read and write 的细粒度令牌。", "来自您 Vercel 帐户的访问令牌。", "来自您 Netlify 帐户的个人访问令牌。", "需要具有 Cloudflare Pages Edit 权限的 API 令牌，以及 Cloudflare 控制面板侧栏显示的帐户 ID——没有它，Cloudflare 无法解析项目。", "此工作区无法使用您计算机的终端——在此连接是唯一的发布方式。", "保存个人访问令牌，以便 Tovu 代表您发布。"
  ]),
  "zh-TW": candidateGapTranslationEntries([
    "此連線已儲存——請重新載入頁面後再試。", "未知錯誤", "頁面、文章與產品", "結帳與訂單", "管理面板，在線", "AI 助理", "提交訊息", "Tovu 將匯出內容推送至 gh-pages 分支時，會使用此訊息作為提交訊息。", "Vercel 專案名稱", "Vercel 會在每次發佈時尋找或建立使用此名稱的專案。", "網站名稱", "Netlify 會在每次發佈時尋找或建立使用此名稱的網站。", "專案名稱", "Cloudflare Pages 會在每次發佈時尋找或建立使用此名稱的專案。", "尚未開始", "匯出失敗", "完成但有失敗", "匯出完成", "發佈失敗", "建立儲存庫、推送匯出資料夾，並啟用 GitHub Pages。", "將匯出資料夾直接部署到 Vercel。", "將此請求複製給助理（GitHub CLI）", "將此請求複製給助理（Vercel CLI）", "需要具有 \"repo\" 範圍的傳統個人存取權杖，或將 Contents 與 Pages 權限設為 Read and write 的細微權杖。", "您 Vercel 帳戶的存取權杖。", "您 Netlify 帳戶的個人存取權杖。", "需要具有 Cloudflare Pages Edit 權限的 API 權杖，以及 Cloudflare 控制台側欄顯示的帳戶 ID——沒有它，Cloudflare 無法解析專案。", "此工作區無法使用您電腦的終端機——在此連線是唯一的發佈方式。", "儲存個人存取權杖，讓 Tovu 能代表您發佈。"
  ]),
  ar: candidateGapTranslationEntries([
    "تم حفظ هذا الاتصال بالفعل — أعد تحميل الصفحة وحاول مرة أخرى.", "خطأ غير معروف", "الصفحات والمنشورات والمنتجات", "الدفع والطلبات", "لوحة الإدارة، متصلة", "مساعد الذكاء الاصطناعي", "رسالة الالتزام", "تُستخدم كرسالة التزام عندما يدفع Tovu التصدير إلى فرع gh-pages.", "اسم مشروع Vercel", "يعثر Vercel على مشروع بهذا الاسم أو ينشئه عند كل نشر.", "اسم الموقع", "يعثر Netlify على موقع بهذا الاسم أو ينشئه عند كل نشر.", "اسم المشروع", "يعثر Cloudflare Pages على مشروع بهذا الاسم أو ينشئه عند كل نشر.", "لم يبدأ", "فشل التصدير", "انتهى مع إخفاقات", "اكتمل التصدير", "فشل النشر", "ينشئ المستودع ويدفع المجلد المُصدَّر ويفعّل GitHub Pages.", "ينشر المجلد المُصدَّر مباشرةً إلى Vercel.", "انسخ هذا الطلب إلى المساعد (GitHub CLI)", "انسخ هذا الطلب إلى المساعد (Vercel CLI)", "يتطلب رمز وصول شخصياً تقليدياً بنطاق \"repo\"، أو رمزاً دقيق الصلاحيات مع تعيين أذونات Contents وPages إلى Read and write.", "رمز وصول من حساب Vercel الخاص بك.", "رمز وصول شخصي من حساب Netlify الخاص بك.", "يتطلب رمز API مع إذن Cloudflare Pages Edit، بالإضافة إلى معرّف الحساب الظاهر في الشريط الجانبي للوحة Cloudflare الخاصة بك — لا يستطيع Cloudflare حل مشروع بدونه.", "لا يمكن لمساحة العمل هذه استخدام طرفية جهازك — الاتصال هنا هو الطريقة الوحيدة للنشر.", "احفظ رمز وصول شخصياً لكي يتمكن Tovu من النشر نيابةً عنك."
  ]),
  bn: candidateGapTranslationEntries([
    "এই সংযোগটি ইতিমধ্যেই সংরক্ষিত হয়েছে — পৃষ্ঠাটি পুনরায় লোড করে আবার চেষ্টা করুন।", "অজানা ত্রুটি", "পৃষ্ঠা, পোস্ট ও পণ্য", "চেকআউট ও অর্ডার", "অ্যাডমিন প্যানেল, অনলাইন", "AI সহায়ক", "কমিট বার্তা", "Tovu যখন gh-pages শাখায় এক্সপোর্ট পুশ করে, তখন এটি কমিট বার্তা হিসেবে ব্যবহৃত হয়।", "Vercel প্রকল্পের নাম", "Vercel প্রতিটি প্রকাশনার সময় এই নামের একটি প্রকল্প খুঁজে বা তৈরি করে।", "সাইটের নাম", "Netlify প্রতিটি প্রকাশনার সময় এই নামের একটি সাইট খুঁজে বা তৈরি করে।", "প্রকল্পের নাম", "Cloudflare Pages প্রতিটি প্রকাশনার সময় এই নামের একটি প্রকল্প খুঁজে বা তৈরি করে।", "শুরু হয়নি", "এক্সপোর্ট ব্যর্থ হয়েছে", "ব্যর্থতা সহ শেষ হয়েছে", "এক্সপোর্ট শেষ হয়েছে", "প্রকাশনা ব্যর্থ হয়েছে", "রিপোজিটরি তৈরি করে, এক্সপোর্ট করা ফোল্ডার পুশ করে এবং GitHub Pages চালু করে।", "এক্সপোর্ট করা ফোল্ডারটি সরাসরি Vercel-এ ডিপ্লয় করে।", "সহায়কের কাছে এই অনুরোধটি কপি করুন (GitHub CLI)", "সহায়কের কাছে এই অনুরোধটি কপি করুন (Vercel CLI)", "\"repo\" স্কোপসহ একটি ক্লাসিক ব্যক্তিগত অ্যাক্সেস টোকেন, অথবা Contents এবং Pages অনুমতি Read and write-এ সেট করা একটি সূক্ষ্ম-গ্রেইন টোকেন প্রয়োজন।", "আপনার Vercel অ্যাকাউন্টের একটি অ্যাক্সেস টোকেন।", "আপনার Netlify অ্যাকাউন্টের একটি ব্যক্তিগত অ্যাক্সেস টোকেন।", "Cloudflare Pages Edit অনুমতিসহ একটি API টোকেন এবং আপনার Cloudflare ড্যাশবোর্ডের সাইডবারে দেখানো অ্যাকাউন্ট ID প্রয়োজন — এটি ছাড়া Cloudflare একটি প্রকল্প সমাধান করতে পারে না।", "এই কর্মক্ষেত্রটি আপনার কম্পিউটারের টার্মিনাল ব্যবহার করতে পারে না — এখানে সংযুক্ত করাই প্রকাশের একমাত্র উপায়।", "একটি ব্যক্তিগত অ্যাক্সেস টোকেন সংরক্ষণ করুন যাতে Tovu আপনার হয়ে প্রকাশ করতে পারে।"
  ]),
  fa: candidateGapTranslationEntries([
    "این اتصال قبلاً ذخیره شده است — صفحه را دوباره بارگیری کنید و دوباره تلاش کنید.", "خطای ناشناخته", "صفحه‌ها، نوشته‌ها و محصولات", "پرداخت و سفارش‌ها", "پنل مدیریت، آنلاین", "دستیار هوش مصنوعی", "پیام کامیت", "وقتی Tovu خروجی را به شاخه gh-pages پوش می‌کند، از این به‌عنوان پیام کامیت استفاده می‌شود.", "نام پروژه Vercel", "Vercel در هر انتشار پروژه‌ای با این نام پیدا یا ایجاد می‌کند.", "نام سایت", "Netlify در هر انتشار سایتی با این نام پیدا یا ایجاد می‌کند.", "نام پروژه", "Cloudflare Pages در هر انتشار پروژه‌ای با این نام پیدا یا ایجاد می‌کند.", "شروع نشده", "خروجی ناموفق بود", "با خطاها پایان یافت", "خروجی تمام شد", "انتشار ناموفق بود", "مخزن را ایجاد می‌کند، پوشه خروجی را پوش می‌کند و GitHub Pages را روشن می‌کند.", "پوشه خروجی را مستقیماً در Vercel مستقر می‌کند.", "این درخواست را برای دستیار کپی کنید (GitHub CLI)", "این درخواست را برای دستیار کپی کنید (Vercel CLI)", "به یک توکن دسترسی شخصی کلاسیک با دامنه \"repo\"، یا یک توکن ریزدانه با مجوزهای Contents و Pages روی Read and write نیاز دارد.", "یک توکن دسترسی از حساب Vercel شما.", "یک توکن دسترسی شخصی از حساب Netlify شما.", "به یک توکن API با مجوز Cloudflare Pages Edit و شناسه حساب نشان‌داده‌شده در نوار کناری داشبورد Cloudflare شما نیاز دارد — Cloudflare بدون آن نمی‌تواند پروژه‌ای را حل کند.", "این فضای کاری نمی‌تواند از ترمینال رایانه شما استفاده کند — اتصال در اینجا تنها راه انتشار است.", "یک توکن دسترسی شخصی ذخیره کنید تا Tovu بتواند از طرف شما منتشر کند."
  ]),
  hi: candidateGapTranslationEntries([
    "यह कनेक्शन पहले ही सहेजा जा चुका है — पेज फिर से लोड करें और दोबारा कोशिश करें।", "अज्ञात त्रुटि", "पेज, पोस्ट और उत्पाद", "चेकआउट और ऑर्डर", "एडमिन पैनल, ऑनलाइन", "AI सहायक", "कमिट संदेश", "जब Tovu एक्सपोर्ट को gh-pages शाखा में पुश करता है, तो यह कमिट संदेश के रूप में उपयोग होता है।", "Vercel प्रोजेक्ट नाम", "Vercel हर प्रकाशन पर इस नाम से प्रोजेक्ट खोजता या बनाता है।", "साइट नाम", "Netlify हर प्रकाशन पर इस नाम से साइट खोजता या बनाता है।", "प्रोजेक्ट नाम", "Cloudflare Pages हर प्रकाशन पर इस नाम से प्रोजेक्ट खोजता या बनाता है।", "शुरू नहीं हुआ", "एक्सपोर्ट विफल हुआ", "विफलताओं के साथ समाप्त", "एक्सपोर्ट पूरा हुआ", "प्रकाशन विफल हुआ", "रिपॉज़िटरी बनाता है, एक्सपोर्ट किया हुआ फोल्डर पुश करता है और GitHub Pages चालू करता है।", "एक्सपोर्ट किया हुआ फोल्डर सीधे Vercel पर डिप्लॉय करता है।", "इस अनुरोध को सहायक को कॉपी करें (GitHub CLI)", "इस अनुरोध को सहायक को कॉपी करें (Vercel CLI)", "\"repo\" स्कोप वाला क्लासिक व्यक्तिगत एक्सेस टोकन, या Contents और Pages अनुमतियों को Read and write पर सेट किया गया फाइन-ग्रेन्ड टोकन चाहिए।", "आपके Vercel खाते का एक्सेस टोकन।", "आपके Netlify खाते का व्यक्तिगत एक्सेस टोकन।", "Cloudflare Pages Edit अनुमति वाला API टोकन और आपके Cloudflare डैशबोर्ड की साइडबार में दिखाया गया खाता ID चाहिए — इसके बिना Cloudflare प्रोजेक्ट हल नहीं कर सकता।", "यह कार्यक्षेत्र आपके कंप्यूटर का टर्मिनल उपयोग नहीं कर सकता — यहाँ कनेक्ट करना ही प्रकाशित करने का एकमात्र तरीका है।", "व्यक्तिगत एक्सेस टोकन सहेजें ताकि Tovu आपकी ओर से प्रकाशित कर सके।"
  ]),
  hu: candidateGapTranslationEntries([
    "Ez a kapcsolat már el van mentve — töltse újra az oldalt, és próbálja meg újra.", "Ismeretlen hiba", "Oldalak, bejegyzések és termékek", "Pénztár és rendelések", "Adminisztrációs panel, online", "MI-asszisztens", "Commit üzenet", "Ezt használja commit üzenetként, amikor a Tovu az exportot a gh-pages ágba küldi.", "Vercel-projektnév", "A Vercel minden közzétételkor megkeres vagy létrehoz egy ilyen nevű projektet.", "Webhely neve", "A Netlify minden közzétételkor megkeres vagy létrehoz egy ilyen nevű webhelyet.", "Projekt neve", "A Cloudflare Pages minden közzétételkor megkeres vagy létrehoz egy ilyen nevű projektet.", "Nincs elindítva", "Az export sikertelen", "Hibákkal fejeződött be", "Az export befejeződött", "A közzététel sikertelen", "Létrehozza a repót, feltölti az exportált mappát, és bekapcsolja a GitHub Pages szolgáltatást.", "Az exportált mappát közvetlenül a Vercelre telepíti.", "Kérés másolása az asszisztensnek (GitHub CLI)", "Kérés másolása az asszisztensnek (Vercel CLI)", "Klasszikus személyes hozzáférési token szükséges \"repo\" hatókörrel, vagy finomhangolt token, amelynél a Contents és Pages engedélyek Read and write értékre vannak állítva.", "Hozzáférési token a Vercel-fiókjából.", "Személyes hozzáférési token a Netlify-fiókjából.", "Cloudflare Pages Edit engedélyű API-token és a Cloudflare-irányítópult oldalsávjában látható fiókazonosító szükséges — ezek nélkül a Cloudflare nem tud projektet feloldani.", "Ez a munkaterület nem használhatja a számítógépe terminálját — az itt történő csatlakozás az egyetlen közzétételi mód.", "Mentsen személyes hozzáférési tokent, hogy a Tovu az Ön nevében közzétehessen."
  ]),
  ja: candidateGapTranslationEntries([
    "この接続はすでに保存されています。ページを再読み込みして、もう一度お試しください。", "不明なエラー", "ページ、投稿、商品", "チェックアウトと注文", "管理パネル、オンライン", "AI アシスタント", "コミットメッセージ", "Tovu がエクスポートを gh-pages ブランチへプッシュするときのコミットメッセージとして使われます。", "Vercel プロジェクト名", "Vercel は公開のたびにこの名前のプロジェクトを見つけるか作成します。", "サイト名", "Netlify は公開のたびにこの名前のサイトを見つけるか作成します。", "プロジェクト名", "Cloudflare Pages は公開のたびにこの名前のプロジェクトを見つけるか作成します。", "未開始", "エクスポートに失敗しました", "失敗を含めて完了", "エクスポート完了", "公開に失敗しました", "リポジトリを作成し、エクスポートしたフォルダーをプッシュして GitHub Pages を有効にします。", "エクスポートしたフォルダーを Vercel に直接デプロイします。", "このリクエストをアシスタントにコピー (GitHub CLI)", "このリクエストをアシスタントにコピー (Vercel CLI)", "\"repo\" スコープの従来の個人アクセストークン、または Contents と Pages の権限を Read and write に設定したきめ細かいトークンが必要です。", "Vercel アカウントのアクセストークン。", "Netlify アカウントの個人アクセストークン。", "Cloudflare Pages Edit 権限のある API トークンと、Cloudflare ダッシュボードのサイドバーに表示されるアカウント ID が必要です。これがないと Cloudflare はプロジェクトを解決できません。", "このワークスペースではお使いのコンピューターのターミナルを使用できません。ここで接続することが公開する唯一の方法です。", "Tovu がお客様に代わって公開できるように、個人アクセストークンを保存します。"
  ]),
  ko: candidateGapTranslationEntries([
    "이 연결은 이미 저장되었습니다. 페이지를 새로고침한 뒤 다시 시도하세요.", "알 수 없는 오류", "페이지, 게시물 및 제품", "결제 및 주문", "관리자 패널, 온라인", "AI 도우미", "커밋 메시지", "Tovu가 내보내기를 gh-pages 브랜치로 푸시할 때 커밋 메시지로 사용됩니다.", "Vercel 프로젝트 이름", "Vercel은 게시할 때마다 이 이름의 프로젝트를 찾거나 만듭니다.", "사이트 이름", "Netlify는 게시할 때마다 이 이름의 사이트를 찾거나 만듭니다.", "프로젝트 이름", "Cloudflare Pages는 게시할 때마다 이 이름의 프로젝트를 찾거나 만듭니다.", "시작되지 않음", "내보내기 실패", "실패와 함께 완료", "내보내기 완료", "게시 실패", "저장소를 만들고 내보낸 폴더를 푸시한 뒤 GitHub Pages를 켭니다.", "내보낸 폴더를 Vercel에 바로 배포합니다.", "이 요청을 도우미에게 복사 (GitHub CLI)", "이 요청을 도우미에게 복사 (Vercel CLI)", "\"repo\" 범위가 있는 클래식 개인 액세스 토큰 또는 Contents와 Pages 권한이 Read and write로 설정된 세분화된 토큰이 필요합니다.", "Vercel 계정의 액세스 토큰입니다.", "Netlify 계정의 개인 액세스 토큰입니다.", "Cloudflare Pages Edit 권한이 있는 API 토큰과 Cloudflare 대시보드 사이드바에 표시된 계정 ID가 필요합니다. 없으면 Cloudflare에서 프로젝트를 확인할 수 없습니다.", "이 작업 공간은 컴퓨터의 터미널을 사용할 수 없습니다. 여기에서 연결하는 것이 게시하는 유일한 방법입니다.", "Tovu가 사용자를 대신해 게시할 수 있도록 개인 액세스 토큰을 저장하세요."
  ]),
  pl: candidateGapTranslationEntries([
    "To połączenie zostało już zapisane — odśwież stronę i spróbuj ponownie.", "Nieznany błąd", "Strony, wpisy i produkty", "Kasa i zamówienia", "Panel administracyjny, online", "Asystent AI", "Komunikat commitu", "Używane jako komunikat commitu, gdy Tovu wysyła eksport do gałęzi gh-pages.", "Nazwa projektu Vercel", "Vercel przy każdej publikacji znajduje lub tworzy projekt o tej nazwie.", "Nazwa witryny", "Netlify przy każdej publikacji znajduje lub tworzy witrynę o tej nazwie.", "Nazwa projektu", "Cloudflare Pages przy każdej publikacji znajduje lub tworzy projekt o tej nazwie.", "Nie rozpoczęto", "Eksport nie powiódł się", "Zakończono z niepowodzeniami", "Eksport zakończony", "Publikacja nie powiodła się", "Tworzy repozytorium, wysyła wyeksportowany folder i włącza GitHub Pages.", "Wdraża wyeksportowany folder bezpośrednio w Vercel.", "Kopiuj to żądanie do asystenta (GitHub CLI)", "Kopiuj to żądanie do asystenta (Vercel CLI)", "Wymaga klasycznego osobistego tokenu dostępu z zakresem \"repo\" albo szczegółowego tokenu z uprawnieniami Contents i Pages ustawionymi na Read and write.", "Token dostępu z Twojego konta Vercel.", "Osobisty token dostępu z Twojego konta Netlify.", "Wymaga tokenu API z uprawnieniem Cloudflare Pages Edit oraz identyfikatora konta widocznego na pasku bocznym panelu Cloudflare — bez niego Cloudflare nie może rozpoznać projektu.", "Ten obszar roboczy nie może używać terminala Twojego komputera — połączenie tutaj jest jedynym sposobem publikacji.", "Zapisz osobisty token dostępu, aby Tovu mógł publikować w Twoim imieniu."
  ]),
  ru: candidateGapTranslationEntries([
    "Это подключение уже сохранено — перезагрузите страницу и попробуйте снова.", "Неизвестная ошибка", "Страницы, записи и товары", "Оформление заказа и заказы", "Панель администратора, онлайн", "ИИ-помощник", "Сообщение коммита", "Используется как сообщение коммита, когда Tovu отправляет экспорт в ветку gh-pages.", "Название проекта Vercel", "Vercel при каждой публикации находит или создаёт проект с этим именем.", "Название сайта", "Netlify при каждой публикации находит или создаёт сайт с этим именем.", "Название проекта", "Cloudflare Pages при каждой публикации находит или создаёт проект с этим именем.", "Не запущено", "Экспорт не удался", "Завершено с ошибками", "Экспорт завершён", "Публикация не удалась", "Создаёт репозиторий, отправляет экспортированную папку и включает GitHub Pages.", "Развёртывает экспортированную папку непосредственно в Vercel.", "Скопировать этот запрос помощнику (GitHub CLI)", "Скопировать этот запрос помощнику (Vercel CLI)", "Нужен классический персональный токен доступа с областью \"repo\" или детализированный токен с разрешениями Contents и Pages, установленными в Read and write.", "Токен доступа из вашей учётной записи Vercel.", "Персональный токен доступа из вашей учётной записи Netlify.", "Нужен токен API с разрешением Cloudflare Pages Edit и идентификатор учётной записи из боковой панели вашей панели Cloudflare — без него Cloudflare не может определить проект.", "Это рабочее пространство не может использовать терминал вашего компьютера — подключение здесь является единственным способом публикации.", "Сохраните персональный токен доступа, чтобы Tovu мог публиковать от вашего имени."
  ]),
  th: candidateGapTranslationEntries([
    "บันทึกการเชื่อมต่อนี้แล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง", "ข้อผิดพลาดที่ไม่ทราบสาเหตุ", "หน้า โพสต์ และสินค้า", "ชำระเงินและคำสั่งซื้อ", "แผงผู้ดูแลระบบ ออนไลน์", "ผู้ช่วย AI", "ข้อความคอมมิต", "ใช้เป็นข้อความคอมมิตเมื่อ Tovu พุชการส่งออกไปยังสาขา gh-pages", "ชื่อโปรเจ็กต์ Vercel", "Vercel ค้นหาหรือสร้างโปรเจ็กต์ชื่อนี้ทุกครั้งที่เผยแพร่", "ชื่อเว็บไซต์", "Netlify ค้นหาหรือสร้างเว็บไซต์ชื่อนี้ทุกครั้งที่เผยแพร่", "ชื่อโปรเจ็กต์", "Cloudflare Pages ค้นหาหรือสร้างโปรเจ็กต์ชื่อนี้ทุกครั้งที่เผยแพร่", "ยังไม่เริ่ม", "การส่งออกล้มเหลว", "เสร็จสิ้นพร้อมข้อผิดพลาด", "การส่งออกเสร็จสิ้น", "การเผยแพร่ล้มเหลว", "สร้างรีโพซิทอรี พุชโฟลเดอร์ที่ส่งออก และเปิด GitHub Pages", "ปรับใช้โฟลเดอร์ที่ส่งออกไปยัง Vercel โดยตรง", "คัดลอกคำขอนี้ไปยังผู้ช่วย (GitHub CLI)", "คัดลอกคำขอนี้ไปยังผู้ช่วย (Vercel CLI)", "ต้องใช้โทเค็นการเข้าถึงส่วนบุคคลแบบคลาสสิกที่มีขอบเขต \"repo\" หรือโทเค็นแบบละเอียดที่ตั้งค่าสิทธิ์ Contents และ Pages เป็น Read and write", "โทเค็นการเข้าถึงจากบัญชี Vercel ของคุณ", "โทเค็นการเข้าถึงส่วนบุคคลจากบัญชี Netlify ของคุณ", "ต้องใช้โทเค็น API ที่มีสิทธิ์ Cloudflare Pages Edit และ ID บัญชีที่แสดงในแถบด้านข้างของแดชบอร์ด Cloudflare ของคุณ — Cloudflare ไม่สามารถระบุโปรเจ็กต์ได้หากไม่มีสิ่งนี้", "พื้นที่ทำงานนี้ไม่สามารถใช้เทอร์มินัลของคอมพิวเตอร์คุณได้ — การเชื่อมต่อที่นี่เป็นวิธีเดียวในการเผยแพร่", "บันทึกโทเค็นการเข้าถึงส่วนบุคคลเพื่อให้ Tovu เผยแพร่แทนคุณได้"
  ]),
  tr: candidateGapTranslationEntries([
    "Bu bağlantı zaten kaydedildi — sayfayı yeniden yükleyip tekrar deneyin.", "Bilinmeyen hata", "Sayfalar, gönderiler ve ürünler", "Ödeme ve siparişler", "Yönetici paneli, çevrimiçi", "Yapay zekâ asistanı", "Commit mesajı", "Tovu dışa aktarmayı gh-pages dalına gönderdiğinde commit mesajı olarak kullanılır.", "Vercel proje adı", "Vercel her yayında bu adla bir proje bulur veya oluşturur.", "Site adı", "Netlify her yayında bu adla bir site bulur veya oluşturur.", "Proje adı", "Cloudflare Pages her yayında bu adla bir proje bulur veya oluşturur.", "Başlatılmadı", "Dışa aktarma başarısız", "Hatalarla tamamlandı", "Dışa aktarma tamamlandı", "Yayınlama başarısız", "Depoyu oluşturur, dışa aktarılan klasörü gönderir ve GitHub Pages'i açar.", "Dışa aktarılan klasörü doğrudan Vercel'e dağıtır.", "Bu isteği asistana kopyala (GitHub CLI)", "Bu isteği asistana kopyala (Vercel CLI)", "\"repo\" kapsamına sahip klasik bir kişisel erişim belirteci veya Contents ve Pages izinleri Read and write olarak ayarlanmış ayrıntılı bir belirteç gerekir.", "Vercel hesabınızdan bir erişim belirteci.", "Netlify hesabınızdan bir kişisel erişim belirteci.", "Cloudflare Pages Edit iznine sahip bir API belirteci ve Cloudflare panonuzun kenar çubuğunda gösterilen hesap ID'si gerekir — bunlar olmadan Cloudflare bir projeyi çözemaz.", "Bu çalışma alanı bilgisayarınızın terminalini kullanamaz — buradan bağlanmak yayınlamanın tek yoludur.", "Tovu'nun sizin adınıza yayınlayabilmesi için kişisel erişim belirtecini kaydedin."
  ]),
  uk: candidateGapTranslationEntries([
    "Це підключення вже збережено — перезавантажте сторінку й спробуйте ще раз.", "Невідома помилка", "Сторінки, дописи й товари", "Оформлення замовлення та замовлення", "Панель адміністратора, онлайн", "ШІ-помічник", "Повідомлення коміту", "Використовується як повідомлення коміту, коли Tovu надсилає експорт до гілки gh-pages.", "Назва проєкту Vercel", "Vercel під час кожної публікації знаходить або створює проєкт із цією назвою.", "Назва сайту", "Netlify під час кожної публікації знаходить або створює сайт із цією назвою.", "Назва проєкту", "Cloudflare Pages під час кожної публікації знаходить або створює проєкт із цією назвою.", "Не запущено", "Експорт не вдався", "Завершено з помилками", "Експорт завершено", "Публікація не вдалася", "Створює репозиторій, надсилає експортовану папку та вмикає GitHub Pages.", "Розгортає експортовану папку безпосередньо у Vercel.", "Копіювати цей запит помічнику (GitHub CLI)", "Копіювати цей запит помічнику (Vercel CLI)", "Потрібен класичний персональний токен доступу з областю \"repo\" або деталізований токен із дозволами Contents і Pages, установленими на Read and write.", "Токен доступу з вашого облікового запису Vercel.", "Персональний токен доступу з вашого облікового запису Netlify.", "Потрібен токен API з дозволом Cloudflare Pages Edit і ID облікового запису, показаний на бічній панелі вашої панелі Cloudflare — без нього Cloudflare не може визначити проєкт.", "Цей робочий простір не може використовувати термінал вашого комп’ютера — підключення тут є єдиним способом публікації.", "Збережіть персональний токен доступу, щоб Tovu міг публікувати від вашого імені."
  ]),
  ur: candidateGapTranslationEntries([
    "یہ کنکشن پہلے ہی محفوظ ہو چکا ہے — صفحہ دوبارہ لوڈ کریں اور پھر کوشش کریں۔", "نامعلوم خرابی", "صفحات، پوسٹس اور مصنوعات", "چیک آؤٹ اور آرڈرز", "ایڈمن پینل، آن لائن", "AI معاون", "کمٹ پیغام", "جب Tovu ایکسپورٹ کو gh-pages برانچ پر پش کرتا ہے تو اسے کمٹ پیغام کے طور پر استعمال کیا جاتا ہے۔", "Vercel پروجیکٹ کا نام", "Vercel ہر اشاعت پر اس نام کا پروجیکٹ ڈھونڈتا یا بناتا ہے۔", "سائٹ کا نام", "Netlify ہر اشاعت پر اس نام کی سائٹ ڈھونڈتا یا بناتا ہے۔", "پروجیکٹ کا نام", "Cloudflare Pages ہر اشاعت پر اس نام کا پروجیکٹ ڈھونڈتا یا بناتا ہے۔", "شروع نہیں ہوا", "ایکسپورٹ ناکام ہوا", "ناکامیوں کے ساتھ ختم ہوا", "ایکسپورٹ مکمل ہوا", "اشاعت ناکام ہوئی", "ریپوزٹری بناتا ہے، ایکسپورٹ شدہ فولڈر پش کرتا ہے اور GitHub Pages چالو کرتا ہے۔", "ایکسپورٹ شدہ فولڈر کو براہ راست Vercel پر تعینات کرتا ہے۔", "اس درخواست کو معاون کے لیے کاپی کریں (GitHub CLI)", "اس درخواست کو معاون کے لیے کاپی کریں (Vercel CLI)", "\"repo\" دائرہ کار والا کلاسک ذاتی رسائی ٹوکن، یا Contents اور Pages کی اجازتیں Read and write پر سیٹ والا باریک ٹوکن درکار ہے۔", "آپ کے Vercel اکاؤنٹ کا رسائی ٹوکن۔", "آپ کے Netlify اکاؤنٹ کا ذاتی رسائی ٹوکن۔", "Cloudflare Pages Edit اجازت والا API ٹوکن اور آپ کے Cloudflare ڈیش بورڈ کی سائڈبار میں دکھایا گیا اکاؤنٹ ID درکار ہے — اس کے بغیر Cloudflare پروجیکٹ حل نہیں کر سکتا۔", "یہ ورک اسپیس آپ کے کمپیوٹر کا ٹرمینل استعمال نہیں کر سکتی — یہاں کنکشن کرنا شائع کرنے کا واحد طریقہ ہے۔", "ذاتی رسائی ٹوکن محفوظ کریں تاکہ Tovu آپ کی طرف سے شائع کر سکے۔"
  ]),
};

const DEPLOYMENT_DICT: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(DEPLOYMENT_TRANSLATIONS).map(([locale, entries]) => [
    locale,
    {
      ...entries,
      ...DEPLOYMENT_AUDIT_TRANSLATIONS[locale],
      ...DEPLOYMENT_CANDIDATE_GAP_TRANSLATIONS[locale],
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

/** The "which saved token publishes" picker's failed-switch banner — same shape as
 *  {@link PUBLISH_CREDENTIAL_SAVE_ERROR_TEMPLATE}. Its second sentence is the point: a refused
 *  promotion leaves the server publishing with the token it had, and the picker goes back to showing
 *  that one, so the operator is told the two still agree rather than left to wonder which is live. */
const PUBLISH_CREDENTIAL_SELECT_ERROR_TEMPLATE: Record<string, string> = {
  en: "Could not switch the publishing token ({error}). Publishing still uses the one shown.",
};

export function publishCredentialSelectErrorMessage(locale: string, error: string): string {
  return interpolate(PUBLISH_CREDENTIAL_SELECT_ERROR_TEMPLATE[locale] ?? PUBLISH_CREDENTIAL_SELECT_ERROR_TEMPLATE.en, { error });
}
