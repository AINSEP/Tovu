/**
 * @file Spanish translation for the `plugins` feature's own screens (`Plugins.tsx` and
 * `AgentPlugins.tsx`) — this feature's own dictionary, not the shared `lib/admin-nav-i18n.ts` one,
 * so parallel translation passes over other admin sections can't collide on the same file. Same
 * two-step fallback every other `t()` in this app uses: translated value, else the English source
 * string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const PLUGINS_DICT: Record<string, Record<string, string>> = {
  es: {
    Enable: "Activar",
    Disable: "Desactivar",
    "Inspect package files": "Inspeccionar los archivos del paquete",
    "Add-Ons": "Complementos",
    Plugins: "Plugins",
    "Loading plugins…": "Cargando plugins…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "Activa o desactiva los plugins detectados en el directorio de instalación de plugins de este sitio.",
    "No plugins installed.": "No hay plugins instalados.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "Uno nuevo aparecerá aquí en la próxima carga, una vez que se descomprima en el directorio de instalación de plugins del sitio.",
    Version: "Versión",
    Source: "Origen",
    Tier: "Nivel",
    Enabled: "Activado",
    "Disabled": "Desactivado",
    "Uninstall": "Desinstalar",
    "unavailable": "no disponible",
    Errors: "Errores",
    "Agent Plugins": "Plugins de agentes",
    "Agent Plugins is coming soon.": "Los plugins de agentes estarán disponibles próximamente.",
    "This is from the": "Esto proviene del",
    "Agent Plugins open standard": "estándar abierto Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
    "— que empaqueta habilidades, herramientas y servidores MCP en plugins portables.",

    // AgentPlugins.tsx's Downloaded/Installed tab split (2026-09-09) — new strings that split
    // introduced. Downloaded's own lede/empty-state reuse pre-split keys verbatim (see this file's
    // git history — those two were ALREADY untranslated at HEAD before the split, not something
    // this pass broke), so only the genuinely new copy is added here.
    Downloaded: "Descargado",
    "Downloaded Agent Plugins": "Plugins de agentes descargados",
    "Every package downloaded to this workspace.": "Todos los paquetes descargados en este espacio de trabajo.",
    "No Agent Plugins are enabled for this workspace.": "No hay Plugins de agentes activados en este espacio de trabajo.",
    "These plugins are enabled. Their skills reach the assistant's prompt on every run.":
      "Estos plugins están activados. Sus habilidades llegan al prompt del asistente en cada ejecución.",
    "Until then, the downloaded packages on the Downloaded tab are the ones Tovu ships.":
      "Mientras tanto, los paquetes descargados en la pestaña Descargados son los que incluye Tovu.",

    // Pre-existing gap, not introduced by the Downloaded/Installed split above: the Installed and
    // Marketplace tab labels, the reused Downloaded lede/empty-state, and the whole Marketplace
    // panel's own copy had no dictionary entry at all before this split (verified against the
    // commit before it started) — this closes that, all at once, rather than leaving the Spanish
    // view of this screen half-translated in a way later work would misattribute to the split.
    Installed: "Instalado",
    Marketplace: "Mercado",
    "An installed plugin sits inert until you enable it. Enabling one puts its skills in the assistant's prompt for every run.":
      "Un plugin instalado permanece inactivo hasta que lo activas. Activarlo hace que sus habilidades lleguen al prompt del asistente en cada ejecución.",
    "No Agent Plugins are installed in this workspace.": "No hay Plugins de agentes instalados en este espacio de trabajo.",
    "Agent Plugin Marketplace": "Mercado de plugins de agentes",
    "A future place to discover portable Agent Plugins.": "Un futuro lugar para descubrir Plugins de agentes portables.",
    "Nothing to browse yet": "Todavía no hay nada para explorar",
    "Marketplace is planned for a future release. Tovu does not fetch, install, or list marketplace packages yet.":
      "El mercado está planeado para una versión futura. Tovu aún no descarga, instala ni lista paquetes del mercado.",
    "Read the package format": "Leer el formato del paquete",
    "Package format:": "Formato del paquete:",
    "Uninstall is unavailable: these packages ship with Tovu and are restored on the next restart.":
      "Desinstalar no está disponible: estos paquetes se incluyen con Tovu y se restauran en el próximo reinicio.",

    // Plugins.tsx's Installed/Downloaded/Marketplace tab rebuild (2026-09-09) — this screen's OWN
    // new copy. "Installed"/"Downloaded"/"Marketplace"/"Nothing to browse yet" are reused verbatim
    // from the keys above (shared tab-label vocabulary across both screens in this dictionary).
    Remove: "Eliminar",
    "No plugins are enabled for this site.": "No hay plugins activados en este sitio.",
    "Enabled plugins extend what this site can do.": "Los plugins activados amplían lo que este sitio puede hacer.",
    "Built-in plugins ship with Tovu itself and have no on-disk files to remove.":
      "Los plugins integrados se incluyen con el propio Tovu y no tienen archivos en disco para eliminar.",
    "Marketplace is planned for a future release. Tovu does not fetch, list, or install plugins from a marketplace yet.":
      "El mercado está planeado para una versión futura. Tovu aún no descarga, lista ni instala plugins desde un mercado.",
    "Install a plugin by placing its files in this site's plugin install directory.":
      "Instala un plugin colocando sus archivos en el directorio de instalación de plugins de este sitio.",

    // Hook-level notice/error strings (use-plugins.hooks.ts) — these never got translated during
    // the JSX-only pass since they live in `.hooks.ts` files.
    "failed to load plugins": "no se pudieron cargar los plugins",
    "failed to update plugin": "no se pudo actualizar el plugin",
    "failed to remove plugin": "no se pudo eliminar el plugin",
    "failed to update agent plugin": "no se pudo actualizar el plugin de agentes",
  },
  id: {
    Enable: "Aktifkan",
    Disable: "Nonaktifkan",
    "Inspect package files": "Periksa berkas paket",
    Plugins: "Plugin",
    "Loading plugins…": "Memuat plugin…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "Aktifkan atau nonaktifkan plugin yang ditemukan di direktori instalasi plugin situs ini.",
    "No plugins installed.": "Belum ada plugin yang terpasang.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "Yang baru akan muncul di sini pada pemuatan berikutnya, setelah diekstrak ke direktori instalasi plugin situs.",
    Version: "Versi",
    Source: "Sumber",
    Tier: "Tingkat",
    Enabled: "Diaktifkan",
    "Disabled": "Nonaktif",
    "Uninstall": "Copot pemasangan",
    "unavailable": "tidak tersedia",
    Errors: "Kesalahan",
    "Agent Plugins": "Plugin Agen",
    "Agent Plugins is coming soon.": "Plugin Agen akan segera hadir.",
    "This is from the": "Ini berasal dari",
    "Agent Plugins open standard": "standar terbuka Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " — yang mengemas kemampuan, alat, dan server MCP menjadi plugin portabel.",

    "failed to load plugins": "gagal memuat plugin",
    "failed to update plugin": "gagal memperbarui plugin",
    "failed to update agent plugin": "gagal memperbarui plugin agen",
  },
  de: {
    Enable: "Aktivieren",
    Disable: "Deaktivieren",
    "Inspect package files": "Paketdateien untersuchen",
    Plugins: "Plugins",
    "Loading plugins…": "Plugins werden geladen…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "Aktivieren oder deaktivieren Sie Plugins, die im Plugin-Installationsverzeichnis dieser Website gefunden wurden.",
    "No plugins installed.": "Keine Plugins installiert.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "Ein neues erscheint hier beim nächsten Laden, sobald es in das Plugin-Installationsverzeichnis der Website entpackt wurde.",
    Version: "Version",
    Source: "Quelle",
    Tier: "Stufe",
    Enabled: "Aktiviert",
    "Disabled": "Deaktiviert",
    "Uninstall": "Deinstallieren",
    "unavailable": "nicht verfügbar",
    Errors: "Fehler",
    "Agent Plugins": "Agent-Plugins",
    "Agent Plugins is coming soon.": "Agent-Plugins sind bald verfügbar.",
    "This is from the": "Dies stammt aus dem",
    "Agent Plugins open standard": "offenen Agent-Plugins-Standard",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " — der Skills, Tools und MCP-Server in portable Plugins verpackt.",

    "failed to load plugins": "Plugins konnten nicht geladen werden",
    "failed to update plugin": "Plugin konnte nicht aktualisiert werden",
    "failed to update agent plugin": "Agent-Plugin konnte nicht aktualisiert werden",
  },
  "zh-CN": {
    Enable: "启用",
    Disable: "禁用",
    "Inspect package files": "检查软件包文件",
    Plugins: "插件",
    "Loading plugins…": "正在加载插件…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "启用或禁用在此站点插件安装目录中发现的插件。",
    "No plugins installed.": "尚未安装任何插件。",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "解压到站点插件安装目录后，新插件将在下次加载时显示在此处。",
    Version: "版本",
    Source: "来源",
    Tier: "层级",
    Enabled: "已启用",
    "Disabled": "已禁用",
    "Uninstall": "卸载",
    "unavailable": "不可用",
    Errors: "错误",
    "Agent Plugins": "智能体插件",
    "Agent Plugins is coming soon.": "智能体插件即将推出。",
    "This is from the": "这来自",
    "Agent Plugins open standard": "Agent Plugins 开放标准",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      "——将技能、工具和 MCP 服务器打包为可移植插件。",

    "failed to load plugins": "加载插件失败",
    "failed to update plugin": "更新插件失败",
    "failed to update agent plugin": "更新智能体插件失败",
  },
  "zh-TW": {
    Enable: "啟用",
    Disable: "停用",
    "Inspect package files": "檢視套件檔案",
    Plugins: "外掛",
    "Loading plugins…": "正在載入外掛…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "啟用或停用在此網站外掛安裝目錄中偵測到的外掛。",
    "No plugins installed.": "尚未安裝任何外掛。",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "解壓縮到網站外掛安裝目錄後，新的外掛將於下次載入時顯示於此。",
    Version: "版本",
    Source: "來源",
    Tier: "層級",
    Enabled: "已啟用",
    "Disabled": "已停用",
    "Uninstall": "解除安裝",
    "unavailable": "無法使用",
    Errors: "錯誤",
    "Agent Plugins": "代理程式外掛",
    "Agent Plugins is coming soon.": "代理程式外掛即將推出。",
    "This is from the": "這源自",
    "Agent Plugins open standard": "Agent Plugins 開放標準",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      "——將技能、工具與 MCP 伺服器打包為可攜式外掛。",

    "failed to load plugins": "載入外掛失敗",
    "failed to update plugin": "更新外掛失敗",
    "failed to update agent plugin": "更新代理程式外掛失敗",
  },
  "pt-BR": {
    Enable: "Ativar",
    Disable: "Desativar",
    "Inspect package files": "Inspecionar arquivos do pacote",
    Plugins: "Plugins",
    "Loading plugins…": "Carregando plugins…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "Ative ou desative os plugins encontrados no diretório de instalação de plugins deste site.",
    "No plugins installed.": "Nenhum plugin instalado.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "Um novo aparecerá aqui no próximo carregamento, assim que for descompactado no diretório de instalação de plugins do site.",
    Version: "Versão",
    Source: "Origem",
    Tier: "Nível",
    Enabled: "Ativado",
    "Disabled": "Desativado",
    "Uninstall": "Desinstalar",
    "unavailable": "indisponível",
    Errors: "Erros",
    "Agent Plugins": "Plugins de agentes",
    "Agent Plugins is coming soon.": "Os plugins de agentes estarão disponíveis em breve.",
    "This is from the": "Isso vem do",
    "Agent Plugins open standard": "padrão aberto Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " — que empacota habilidades, ferramentas e servidores MCP em plugins portáteis.",

    "failed to load plugins": "não foi possível carregar os plugins",
    "failed to update plugin": "não foi possível atualizar o plugin",
    "failed to update agent plugin": "não foi possível atualizar o plugin de agentes",
  },
  ru: {
    Enable: "Включить",
    Disable: "Отключить",
    "Inspect package files": "Просмотреть файлы пакета",
    Plugins: "Плагины",
    "Loading plugins…": "Загрузка плагинов…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "Включайте или отключайте плагины, найденные в каталоге установки плагинов этого сайта.",
    "No plugins installed.": "Плагины не установлены.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "Новый плагин появится здесь при следующей загрузке, как только он будет распакован в каталог установки плагинов сайта.",
    Version: "Версия",
    Source: "Источник",
    Tier: "Уровень",
    Enabled: "Включён",
    "Disabled": "Отключено",
    "Uninstall": "Удалить",
    "unavailable": "недоступно",
    Errors: "Ошибки",
    "Agent Plugins": "Плагины агентов",
    "Agent Plugins is coming soon.": "Плагины агентов скоро появятся.",
    "This is from the": "Это часть",
    "Agent Plugins open standard": "открытого стандарта Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " — который упаковывает навыки, инструменты и MCP-серверы в переносимые плагины.",

    "failed to load plugins": "не удалось загрузить плагины",
    "failed to update plugin": "не удалось обновить плагин",
    "failed to update agent plugin": "не удалось обновить плагин агента",
  },
  fa: {
    Enable: "فعال‌سازی",
    Disable: "غیرفعال‌سازی",
    "Inspect package files": "بررسی فایل‌های بسته",
    Plugins: "افزونه‌ها",
    "Loading plugins…": "در حال بارگذاری افزونه‌ها…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "افزونه‌های یافت‌شده در دایرکتوری نصب افزونه‌های این سایت را فعال یا غیرفعال کنید.",
    "No plugins installed.": "هیچ افزونه‌ای نصب نشده است.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "پس از استخراج در دایرکتوری نصب افزونه‌های سایت، مورد جدید در بارگذاری بعدی در اینجا نمایش داده می‌شود.",
    Version: "نسخه",
    Source: "منبع",
    Tier: "سطح",
    Enabled: "فعال",
    "Disabled": "غیرفعال",
    "Uninstall": "حذف نصب",
    "unavailable": "در دسترس نیست",
    Errors: "خطاها",
    "Agent Plugins": "افزونه‌های عامل",
    "Agent Plugins is coming soon.": "افزونه‌های عامل به‌زودی در دسترس خواهند بود.",
    "This is from the": "این بخشی از استاندارد باز",
    "Agent Plugins open standard": "Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " است — که مهارت‌ها، ابزارها و سرورهای MCP را در قالب افزونه‌های قابل‌حمل بسته‌بندی می‌کند.",

    "failed to load plugins": "بارگذاری افزونه‌ها ناموفق بود",
    "failed to update plugin": "به‌روزرسانی افزونه ناموفق بود",
    "failed to update agent plugin": "به‌روزرسانی افزونه عامل ناموفق بود",
  },
  ar: {
    Enable: "تفعيل",
    Disable: "تعطيل",
    "Inspect package files": "فحص ملفات الحزمة",
    Plugins: "الإضافات",
    "Loading plugins…": "جارٍ تحميل الإضافات…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "فعّل أو عطّل الإضافات المكتشفة في دليل تثبيت الإضافات الخاص بهذا الموقع.",
    "No plugins installed.": "لا توجد إضافات مثبَّتة.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "سيظهر إضافة جديدة هنا عند التحميل التالي، بمجرد فك ضغطها في دليل تثبيت إضافات الموقع.",
    Version: "الإصدار",
    Source: "المصدر",
    Tier: "المستوى",
    Enabled: "مفعّل",
    "Disabled": "معطّل",
    "Uninstall": "إلغاء التثبيت",
    "unavailable": "غير متاح",
    Errors: "الأخطاء",
    "Agent Plugins": "إضافات الوكلاء",
    "Agent Plugins is coming soon.": "ستتوفر إضافات الوكلاء قريبًا.",
    "This is from the": "هذا جزء من",
    "Agent Plugins open standard": "المعيار المفتوح لـ Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " — الذي يحزم المهارات والأدوات وخوادم MCP في إضافات قابلة للنقل.",

    "failed to load plugins": "تعذّر تحميل الإضافات",
    "failed to update plugin": "تعذّر تحديث الإضافة",
    "failed to update agent plugin": "تعذّر تحديث إضافة الوكيل",
  },
  ja: {
    Enable: "有効にする",
    Disable: "無効にする",
    "Inspect package files": "パッケージファイルを確認",
    Plugins: "プラグイン",
    "Loading plugins…": "プラグインを読み込み中…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "このサイトのプラグインインストールディレクトリで検出されたプラグインを有効または無効にします。",
    "No plugins installed.": "インストールされているプラグインはありません。",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "サイトのプラグインインストールディレクトリに展開されると、次回の読み込み時に新しいプラグインがここに表示されます。",
    Version: "バージョン",
    Source: "ソース",
    Tier: "ティア",
    Enabled: "有効",
    "Disabled": "無効",
    "Uninstall": "アンインストール",
    "unavailable": "利用できません",
    Errors: "エラー",
    "Agent Plugins": "エージェントプラグイン",
    "Agent Plugins is coming soon.": "エージェントプラグインは近日公開予定です。",
    "This is from the": "これは、",
    "Agent Plugins open standard": "スキルやツール、MCPサーバーをポータブルなプラグインにまとめるオープンスタンダードであるAgent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      "の一部です。",

    "failed to load plugins": "プラグインの読み込みに失敗しました",
    "failed to update plugin": "プラグインの更新に失敗しました",
    "failed to update agent plugin": "エージェントプラグインの更新に失敗しました",
  },
  ko: {
    Enable: "사용",
    Disable: "사용 안 함",
    "Inspect package files": "패키지 파일 검사",
    Plugins: "플러그인",
    "Loading plugins…": "플러그인을 불러오는 중…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "이 사이트의 플러그인 설치 디렉터리에서 발견된 플러그인을 활성화하거나 비활성화하세요.",
    "No plugins installed.": "설치된 플러그인이 없습니다.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "사이트의 플러그인 설치 디렉터리에 압축이 풀리면 다음 로드 시 새 플러그인이 여기에 표시됩니다.",
    Version: "버전",
    Source: "출처",
    Tier: "등급",
    Enabled: "사용",
    "Disabled": "비활성화됨",
    "Uninstall": "제거",
    "unavailable": "사용할 수 없음",
    Errors: "오류",
    "Agent Plugins": "에이전트 플러그인",
    "Agent Plugins is coming soon.": "에이전트 플러그인은 곧 제공될 예정입니다.",
    "This is from the": "이는 ",
    "Agent Plugins open standard": "스킬, 도구, MCP 서버를 이식 가능한 플러그인으로 패키징하는 개방형 표준인 Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      "의 일부입니다.",

    "failed to load plugins": "플러그인을 불러오지 못했습니다",
    "failed to update plugin": "플러그인을 업데이트하지 못했습니다",
    "failed to update agent plugin": "에이전트 플러그인을 업데이트하지 못했습니다",
  },
  pl: {
    Enable: "Włącz",
    Disable: "Wyłącz",
    "Inspect package files": "Sprawdź pliki pakietu",
    Plugins: "Wtyczki",
    "Loading plugins…": "Wczytywanie wtyczek…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "Włączaj lub wyłączaj wtyczki wykryte w katalogu instalacji wtyczek tej witryny.",
    "No plugins installed.": "Brak zainstalowanych wtyczek.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "Nowa wtyczka pojawi się tutaj przy następnym wczytaniu, gdy tylko zostanie rozpakowana w katalogu instalacji wtyczek witryny.",
    Version: "Wersja",
    Source: "Źródło",
    Tier: "Poziom",
    Enabled: "Włączone",
    "Disabled": "Wyłączone",
    "Uninstall": "Odinstaluj",
    "unavailable": "niedostępne",
    Errors: "Błędy",
    "Agent Plugins": "Wtyczki agentów",
    "Agent Plugins is coming soon.": "Wtyczki agentów będą dostępne wkrótce.",
    "This is from the": "Pochodzi to z",
    "Agent Plugins open standard": "otwartego standardu Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " — który pakuje umiejętności, narzędzia i serwery MCP w przenośne wtyczki.",

    "failed to load plugins": "nie udało się wczytać wtyczek",
    "failed to update plugin": "nie udało się zaktualizować wtyczki",
    "failed to update agent plugin": "nie udało się zaktualizować wtyczki agenta",
  },
  hu: {
    Enable: "Engedélyezés",
    Disable: "Letiltás",
    "Inspect package files": "Csomagfájlok megtekintése",
    Plugins: "Bővítmények",
    "Loading plugins…": "Bővítmények betöltése…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "Engedélyezd vagy tiltsd le a webhely bővítménytelepítési könyvtárában talált bővítményeket.",
    "No plugins installed.": "Nincs telepített bővítmény.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "Az újonnan kicsomagolt bővítmény a webhely bővítménytelepítési könyvtárába kerülve a következő betöltéskor jelenik meg itt.",
    Version: "Verzió",
    Source: "Forrás",
    Tier: "Szint",
    Enabled: "Engedélyezve",
    "Disabled": "Letiltva",
    "Uninstall": "Eltávolítás",
    "unavailable": "nem érhető el",
    Errors: "Hibák",
    "Agent Plugins": "Ügynök-bővítmények",
    "Agent Plugins is coming soon.": "Az ügynök-bővítmények hamarosan elérhetők lesznek.",
    "This is from the": "Ez az",
    "Agent Plugins open standard": "Agent Plugins nyílt szabvány",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " része — amely készségeket, eszközöket és MCP-szervereket csomagol hordozható bővítményekbe.",

    "failed to load plugins": "a bővítmények betöltése sikertelen",
    "failed to update plugin": "a bővítmény frissítése sikertelen",
    "failed to update agent plugin": "az ügynök-bővítmény frissítése sikertelen",
  },
  fr: {
    Enable: "Activer",
    Disable: "Désactiver",
    "Inspect package files": "Inspecter les fichiers du paquet",
    Plugins: "Extensions",
    "Loading plugins…": "Chargement des extensions…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "Activez ou désactivez les extensions détectées dans le répertoire d'installation des extensions de ce site.",
    "No plugins installed.": "Aucune extension installée.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "Une nouvelle extension apparaîtra ici au prochain chargement, une fois décompressée dans le répertoire d'installation des extensions du site.",
    Version: "Version",
    Source: "Source",
    Tier: "Niveau",
    Enabled: "Activé",
    "Disabled": "Désactivé",
    "Uninstall": "Désinstaller",
    "unavailable": "indisponible",
    Errors: "Erreurs",
    "Agent Plugins": "Extensions d'agents",
    "Agent Plugins is coming soon.": "Les extensions d'agents seront bientôt disponibles.",
    "This is from the": "Ceci provient du",
    "Agent Plugins open standard": "standard ouvert Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " — qui regroupe des compétences, des outils et des serveurs MCP dans des extensions portables.",

    "failed to load plugins": "échec du chargement des extensions",
    "failed to update plugin": "échec de la mise à jour de l'extension",
    "failed to update agent plugin": "échec de la mise à jour de l'extension d'agent",
  },
  uk: {
    Enable: "Увімкнути",
    Disable: "Вимкнути",
    "Inspect package files": "Переглянути файли пакета",
    Plugins: "Плагіни",
    "Loading plugins…": "Завантаження плагінів…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "Вмикайте або вимикайте плагіни, знайдені в каталозі встановлення плагінів цього сайту.",
    "No plugins installed.": "Немає встановлених плагінів.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "Новий плагін з'явиться тут під час наступного завантаження, щойно його розпакують у каталог встановлення плагінів сайту.",
    Version: "Версія",
    Source: "Джерело",
    Tier: "Рівень",
    Enabled: "Увімкнено",
    "Disabled": "Вимкнено",
    "Uninstall": "Видалити",
    "unavailable": "недоступно",
    Errors: "Помилки",
    "Agent Plugins": "Плагіни агентів",
    "Agent Plugins is coming soon.": "Плагіни агентів незабаром стануть доступними.",
    "This is from the": "Це частина",
    "Agent Plugins open standard": "відкритого стандарту Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " — який упаковує навички, інструменти та MCP-сервери в портативні плагіни.",

    "failed to load plugins": "не вдалося завантажити плагіни",
    "failed to update plugin": "не вдалося оновити плагін",
    "failed to update agent plugin": "не вдалося оновити плагін агента",
  },
  tr: {
    Enable: "Etkinleştir",
    Disable: "Devre dışı bırak",
    "Inspect package files": "Paket dosyalarını incele",
    Plugins: "Eklentiler",
    "Loading plugins…": "Eklentiler yükleniyor…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "Bu sitenin eklenti kurulum dizininde bulunan eklentileri etkinleştirin veya devre dışı bırakın.",
    "No plugins installed.": "Yüklü eklenti yok.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "Sitenin eklenti kurulum dizinine açıldıktan sonra yeni bir tanesi bir sonraki yüklemede burada görünür.",
    Version: "Sürüm",
    Source: "Kaynak",
    Tier: "Katman",
    Enabled: "Etkin",
    "Disabled": "Devre dışı",
    "Uninstall": "Kaldır",
    "unavailable": "kullanılamıyor",
    Errors: "Hatalar",
    "Agent Plugins": "Ajan Eklentileri",
    "Agent Plugins is coming soon.": "Ajan Eklentileri yakında kullanıma sunulacak.",
    "This is from the": "Bu,",
    "Agent Plugins open standard": "beceri, araç ve MCP sunucularını taşınabilir eklentiler halinde paketleyen açık standart Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      "'ın bir parçasıdır.",

    "failed to load plugins": "eklentiler yüklenemedi",
    "failed to update plugin": "eklenti güncellenemedi",
    "failed to update agent plugin": "ajan eklentisi güncellenemedi",
  },
  th: {
    Enable: "เปิดใช้งาน",
    Disable: "ปิดใช้งาน",
    "Inspect package files": "ตรวจสอบไฟล์แพ็กเกจ",
    Plugins: "ปลั๊กอิน",
    "Loading plugins…": "กำลังโหลดปลั๊กอิน…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "เปิดหรือปิดใช้งานปลั๊กอินที่พบในไดเรกทอรีติดตั้งปลั๊กอินของเว็บไซต์นี้",
    "No plugins installed.": "ไม่มีปลั๊กอินที่ติดตั้ง",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "รายการใหม่จะปรากฏที่นี่ในการโหลดครั้งถัดไป เมื่อแตกไฟล์ลงในไดเรกทอรีติดตั้งปลั๊กอินของเว็บไซต์แล้ว",
    Version: "เวอร์ชัน",
    Source: "แหล่งที่มา",
    Tier: "ระดับ",
    Enabled: "เปิดใช้งานแล้ว",
    "Disabled": "ปิดใช้งาน",
    "Uninstall": "ถอนการติดตั้ง",
    "unavailable": "ใช้งานไม่ได้",
    Errors: "ข้อผิดพลาด",
    "Agent Plugins": "ปลั๊กอินเอเจนต์",
    "Agent Plugins is coming soon.": "ปลั๊กอินเอเจนต์จะเปิดให้ใช้งานเร็ว ๆ นี้",
    "This is from the": "นี่มาจาก",
    "Agent Plugins open standard": "มาตรฐานเปิด Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " — ที่รวมสกิล เครื่องมือ และเซิร์ฟเวอร์ MCP ไว้ในปลั๊กอินที่พกพาได้",

    "failed to load plugins": "โหลดปลั๊กอินไม่สำเร็จ",
    "failed to update plugin": "อัปเดตปลั๊กอินไม่สำเร็จ",
    "failed to update agent plugin": "อัปเดตปลั๊กอินเอเจนต์ไม่สำเร็จ",
  },
  it: {
    Enable: "Abilita",
    Disable: "Disabilita",
    "Inspect package files": "Ispeziona i file del pacchetto",
    Plugins: "Plugin",
    "Loading plugins…": "Caricamento plugin…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "Abilita o disabilita i plugin rilevati nella directory di installazione dei plugin di questo sito.",
    "No plugins installed.": "Nessun plugin installato.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "Un nuovo plugin apparirà qui al prossimo caricamento, una volta decompresso nella directory di installazione dei plugin del sito.",
    Version: "Versione",
    Source: "Origine",
    Tier: "Livello",
    Enabled: "Abilitato",
    "Disabled": "Disattivato",
    "Uninstall": "Disinstalla",
    "unavailable": "non disponibile",
    Errors: "Errori",
    "Agent Plugins": "Plugin per agenti",
    "Agent Plugins is coming soon.": "I plugin per agenti saranno disponibili a breve.",
    "This is from the": "Questo proviene dallo",
    "Agent Plugins open standard": "standard aperto Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " — che impacchetta competenze, strumenti e server MCP in plugin portabili.",

    "failed to load plugins": "impossibile caricare i plugin",
    "failed to update plugin": "impossibile aggiornare il plugin",
    "failed to update agent plugin": "impossibile aggiornare il plugin per agenti",
  },
  hi: {
    Enable: "सक्षम करें",
    Disable: "अक्षम करें",
    "Inspect package files": "पैकेज फ़ाइलें देखें",
    Plugins: "प्लगिन",
    "Loading plugins…": "प्लगिन लोड हो रहे हैं…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "इस साइट की प्लगिन इंस्टॉल डायरेक्टरी में मिले प्लगिन को सक्षम या अक्षम करें।",
    "No plugins installed.": "कोई प्लगिन इंस्टॉल नहीं है।",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "साइट की प्लगिन इंस्टॉल डायरेक्टरी में अनपैक होने के बाद, नया प्लगिन अगली बार लोड होने पर यहाँ दिखाई देगा।",
    Version: "संस्करण",
    Source: "स्रोत",
    Tier: "स्तर",
    Enabled: "सक्षम",
    "Disabled": "अक्षम",
    "Uninstall": "अनइंस्टॉल करें",
    "unavailable": "उपलब्ध नहीं",
    Errors: "त्रुटियां",
    "Agent Plugins": "एजेंट प्लगिन",
    "Agent Plugins is coming soon.": "एजेंट प्लगिन जल्द आ रहे हैं।",
    "This is from the": "यह ",
    "Agent Plugins open standard": "Agent Plugins ओपन स्टैंडर्ड से है",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " — जो स्किल, टूल और MCP सर्वर को पोर्टेबल प्लगिन में पैकेज करता है।",

    "failed to load plugins": "प्लगिन लोड नहीं हो सके",
    "failed to update plugin": "प्लगिन अपडेट नहीं हो सका",
    "failed to update agent plugin": "एजेंट प्लगिन अपडेट नहीं हो सका",
  },
  ur: {
    Enable: "فعال کریں",
    Disable: "غیرفعال کریں",
    "Inspect package files": "پیکیج فائلیں دیکھیں",
    Plugins: "پلگ اِنز",
    "Loading plugins…": "پلگ اِنز لوڈ ہو رہے ہیں…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "اس سائٹ کی پلگ اِن انسٹال ڈائرکٹری میں ملنے والے پلگ اِنز کو فعال یا غیرفعال کریں۔",
    "No plugins installed.": "کوئی پلگ اِن انسٹال نہیں ہے۔",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "سائٹ کی پلگ اِن انسٹال ڈائرکٹری میں ان پیک ہونے کے بعد، نیا پلگ اِن اگلی بار لوڈ ہونے پر یہاں ظاہر ہوگا۔",
    Version: "ورژن",
    Source: "ماخذ",
    Tier: "درجہ",
    Enabled: "فعال",
    "Disabled": "غیر فعال",
    "Uninstall": "اَن انسٹال کریں",
    "unavailable": "دستیاب نہیں",
    Errors: "خرابیاں",
    "Agent Plugins": "ایجنٹ پلگ اِنز",
    "Agent Plugins is coming soon.": "ایجنٹ پلگ اِنز جلد آ رہے ہیں۔",
    "This is from the": "یہ ",
    "Agent Plugins open standard": "Agent Plugins اوپن اسٹینڈرڈ سے ہے",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " — جو اسکلز، ٹولز، اور MCP سرورز کو پورٹیبل پلگ اِنز میں پیک کرتا ہے۔",

    "failed to load plugins": "پلگ اِنز لوڈ نہ ہو سکے",
    "failed to update plugin": "پلگ اِن اپ ڈیٹ نہ ہو سکا",
    "failed to update agent plugin": "ایجنٹ پلگ اِن اپ ڈیٹ نہ ہو سکا",
  },
  bn: {
    Enable: "সক্ষম করুন",
    Disable: "নিষ্ক্রিয় করুন",
    "Inspect package files": "প্যাকেজ ফাইল পরীক্ষা করুন",
    Plugins: "প্লাগইন",
    "Loading plugins…": "প্লাগইন লোড হচ্ছে…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "এই সাইটের প্লাগইন ইনস্টল ডিরেক্টরিতে পাওয়া প্লাগইন সক্ষম বা নিষ্ক্রিয় করুন।",
    "No plugins installed.": "কোনো প্লাগইন ইনস্টল করা নেই।",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "সাইটের প্লাগইন ইনস্টল ডিরেক্টরিতে আনপ্যাক হওয়ার পর, নতুনটি পরের বার লোড হলে এখানে দেখা যাবে।",
    Version: "সংস্করণ",
    Source: "উৎস",
    Tier: "স্তর",
    Enabled: "সক্ষম করা হয়েছে",
    "Disabled": "নিষ্ক্রিয়",
    "Uninstall": "আনইনস্টল করুন",
    "unavailable": "উপলব্ধ নয়",
    Errors: "ত্রুটি",
    "Agent Plugins": "এজেন্ট প্লাগইন",
    "Agent Plugins is coming soon.": "এজেন্ট প্লাগইন শীঘ্রই আসছে।",
    "This is from the": "এটি ",
    "Agent Plugins open standard": "Agent Plugins ওপেন স্ট্যান্ডার্ডের অংশ",
    "— packaging skills, tools, and MCP servers into portable plugins.":
      " — যা স্কিল, টুল এবং MCP সার্ভারকে পোর্টেবল প্লাগইনে প্যাকেজ করে।",

    "failed to load plugins": "প্লাগইন লোড করা যায়নি",
    "failed to update plugin": "প্লাগইন আপডেট করা যায়নি",
    "failed to update agent plugin": "এজেন্ট প্লাগইন আপডেট করা যায়নি",
  },
};

export const t = createDictionaryTranslator(PLUGINS_DICT);
