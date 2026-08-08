/**
 * @file Spanish dictionary for the `/admin/ai-assistant` screen (`AiAssistant.tsx`) — the page
 * header, both tabs' own copy (visitor switch + credential form, admin switch + execution mode),
 * and the roadmap tab. Same `DICT[locale]?.[key] ?? key` shape every other `*-i18n.ts` file in this
 * app uses.
 *
 * "Protocols" / "Gateways" / "Configured" / "Not configured" / "Save" / "Saving…" duplicate values
 * `@jini-ai/ui`'s own `SETTINGS_DIALOG_DICTIONARIES.es` already carries (`AiAssistant.tsx`'s
 * `I18nProvider` mount is now locale-aware and translates that package's OWN chrome for free) — kept
 * here too, rather than cross-imported, because these five are literal prop VALUES this screen
 * hands to `ProviderChipGroup`/`VisitorCredentialKeyFooter` (not `t()` calls the library makes on
 * this screen's behalf), so this file has to know them either way. Values match verbatim.
 */
export const AI_ASSISTANT_DICT: Record<string, Record<string, string>> = {
  es: {
    // Page header
    "Turn the visitor-facing assistant on or off for your public site.":
      "Activa o desactiva el asistente de cara al visitante en tu sitio público.",
    "Loading AI assistant settings…": "Cargando la configuración del asistente de IA…",

    // Tabs
    "Visitor's AI Assistant": "Asistente de IA del visitante",
    "The assistant your published site offers to readers.": "El asistente que tu sitio publicado ofrece a los lectores.",
    "Admin AI Assistant": "Asistente de IA de administración",
    "The assistant in this admin, for signed-in administrators.":
      "El asistente en esta administración, para administradores con sesión iniciada.",
    "Not built yet": "Aún no implementado",
    "Operator controls that are planned but not implemented.": "Controles del operador planificados pero no implementados.",

    // Visitor tab — public switch
    "Enable the AI assistant on the public site. *API Key needed*":
      "Activar el asistente de IA en el sitio público. *Se necesita clave de API*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "Los visitantes pueden chatear con el asistente. Se sirve en cada página pública.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "Desactivado. El sitio público no incluye código del asistente ni expone ningún endpoint del asistente: es una desactivación completa, no un widget oculto.",

    // Visitor tab — credential form intro
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "Esta clave es para tus visitantes, no para ti. Es lo que permite que las personas que leen tu sitio publicado hagan preguntas y obtengan respuestas. Se almacena en el servidor y se usa en cada conversación de un visitante.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "Es una clave distinta de la que está en Configuración → Modo de ejecución → BYOK. Esa es la tuya propia, se guarda solo en este navegador y alimenta al asistente en esta administración. Un sitio implementado nunca puede usarla, por eso guardar una clave ahí no activa el chat para visitantes.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      'Ignora la nota "Solo se almacena en este host" que aparece más abajo. Pertenece al componente de formulario compartido y es correcta en la pantalla de Configuración, no aquí. Esta clave se almacenará en el servidor, cifrada.',
    "See more about the visitor key": "Ver más sobre la clave del visitante",
    "See more": "Ver más",
    "See less": "Ver menos",

    // Shared with @jini-ai/ui's own SETTINGS_DIALOG_DICTIONARIES — see file header
    Protocols: "Protocolos",
    Gateways: "Puertas de enlace",
    Configured: "Configurado",
    "Not configured": "No configurado",
    Save: "Guardar",
    "Saving…": "Guardando…",

    // Visitor tab — key footer
    "Test Key": "Probar clave",
    "Testing…": "Probando…",
    "Key works — {count} models available.": "La clave funciona — {count} modelos disponibles.",
    "Checks the key against the provider and lists the models it can use.":
      "Verifica la clave con el proveedor y muestra los modelos que puede usar.",
    "Asking the provider which models this key allows…": "Preguntando al proveedor qué modelos permite esta clave…",
    "Saved to the server, encrypted.": "Guardada en el servidor, cifrada.",
    "Not saved yet — press Save.": "Aún no guardada — presiona Guardar.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Almacenada en el servidor, cifrada. Pega una clave nueva para reemplazarla.",
    "Paste your key, check it with Show, then press Save.":
      "Pega tu clave, compruébala con Mostrar y luego presiona Guardar.",

    // Admin tab — panel switch
    "Show the AI assistant on the admin site": "Mostrar el asistente de IA en el sitio de administración",
    "Open. The assistant panel is showing on the right.": "Abierto. El panel del asistente se muestra a la derecha.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "Abre el panel del asistente en esta administración: lo mismo que hace el botón flotante de la esquina inferior derecha.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "Siempre disponible para los administradores con sesión iniciada, así que esto solo muestra u oculta el panel. Úsalo si el botón flotante queda fuera de pantalla o es difícil de encontrar.",

    // Admin tab — execution mode
    "Loading execution settings…": "Cargando la configuración de ejecución…",
    "Detected on the Tovu server, not on your own computer.": "Detectado en el servidor de Tovu, no en tu propio equipo.",
    "Saved.": "Guardado.",

    // Roadmap tab
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "Estos controles del operador están planificados pero no implementados. Nada de lo siguiente está activo: activar el asistente hoy significa ejecutarlo sin límite de costo, sin limitación de frecuencia por visitante y sin una vista de actividad en vivo.",
    "Token / cost budget caps": "Límites de presupuesto de tokens/costo",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "Topes de gasto por día y por conversación, con el asistente desactivándose solo cuando se agota un tope. Hasta que esto exista, el interruptor de arriba es el único control de gasto.",
    "Live status and recent activity": "Estado en vivo y actividad reciente",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "Estado del asistente, recuento de conversaciones recientes y gasto hasta la fecha: la vista que indicaría que un problema de presupuesto o de límite de frecuencia está ocurriendo mientras ocurre.",
    "Not implemented": "No implementado",
  },
  id: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "Aktifkan atau nonaktifkan asisten yang menghadap pengunjung untuk situs publik Anda.",
    "Loading AI assistant settings…": "Memuat pengaturan asisten AI…",
    "Visitor's AI Assistant": "Asisten AI Pengunjung",
    "The assistant your published site offers to readers.": "Asisten yang ditawarkan situs terbit Anda kepada pembaca.",
    "Admin AI Assistant": "Asisten AI Admin",
    "The assistant in this admin, for signed-in administrators.":
      "Asisten di admin ini, untuk administrator yang sudah masuk.",
    "Not built yet": "Belum dibuat",
    "Operator controls that are planned but not implemented.": "Kontrol operator yang direncanakan tetapi belum diterapkan.",
    "Enable the AI assistant on the public site. *API Key needed*":
      "Aktifkan asisten AI di situs publik. *Diperlukan Kunci API*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "Pengunjung dapat mengobrol dengan asisten. Ini disajikan di setiap halaman publik.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "Nonaktif. Situs publik tidak menyertakan kode asisten dan tidak mengekspos endpoint asisten apa pun — ini adalah penonaktifan penuh, bukan widget tersembunyi.",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "Kunci ini untuk pengunjung Anda, bukan untuk Anda. Inilah yang memungkinkan orang yang membaca situs terbit Anda mengajukan pertanyaan dan mendapatkan jawaban. Kunci ini disimpan di server dan digunakan untuk setiap percakapan pengunjung.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "Ini adalah kunci yang berbeda dari yang ada di Pengaturan → Mode eksekusi → BYOK. Kunci itu adalah milik Anda sendiri, hanya disimpan di peramban ini, dan menggerakkan asisten di admin ini. Situs yang sudah diterapkan tidak akan pernah bisa menggunakannya — itulah sebabnya menyimpan kunci di sana tidak mengaktifkan obrolan pengunjung.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      'Abaikan catatan "Hanya disimpan oleh host ini" di bawah. Catatan itu milik komponen formulir bersama dan akurat di layar Pengaturan, bukan di sini. Kunci ini akan disimpan di server, terenkripsi.',
    "See more about the visitor key": "Lihat selengkapnya tentang kunci pengunjung",
    "See more": "Lihat selengkapnya",
    "See less": "Lihat lebih sedikit",
    Protocols: "Protokol",
    Gateways: "Gateway",
    Configured: "Dikonfigurasi",
    "Not configured": "Belum dikonfigurasi",
    Save: "Simpan",
    "Saving…": "Menyimpan…",
    "Test Key": "Uji Kunci",
    "Testing…": "Menguji…",
    "Key works — {count} models available.": "Kunci berfungsi — {count} model tersedia.",
    "Checks the key against the provider and lists the models it can use.":
      "Memeriksa kunci ke penyedia dan mencantumkan model yang dapat digunakannya.",
    "Asking the provider which models this key allows…": "Menanyakan ke penyedia model apa saja yang diizinkan kunci ini…",
    "Saved to the server, encrypted.": "Disimpan ke server, terenkripsi.",
    "Not saved yet — press Save.": "Belum disimpan — tekan Simpan.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Disimpan di server, terenkripsi. Tempel kunci baru untuk menggantinya.",
    "Paste your key, check it with Show, then press Save.":
      "Tempel kunci Anda, periksa dengan Tampilkan, lalu tekan Simpan.",
    "Show the AI assistant on the admin site": "Tampilkan asisten AI di situs admin",
    "Open. The assistant panel is showing on the right.": "Terbuka. Panel asisten ditampilkan di sebelah kanan.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "Membuka panel asisten di admin ini — sama seperti yang dilakukan tombol mengambang di pojok kanan bawah.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "Selalu tersedia untuk administrator yang sudah masuk, jadi ini hanya menampilkan atau menyembunyikan panel. Gunakan jika tombol mengambang berada di luar layar atau sulit ditemukan.",
    "Loading execution settings…": "Memuat pengaturan eksekusi…",
    "Detected on the Tovu server, not on your own computer.": "Terdeteksi di server Tovu, bukan di komputer Anda sendiri.",
    "Saved.": "Tersimpan.",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "Kontrol operator ini direncanakan tetapi belum diterapkan. Tidak ada yang di bawah ini aktif — mengaktifkan asisten hari ini berarti menjalankannya tanpa batas biaya, tanpa pembatasan laju per pengunjung, dan tanpa tampilan aktivitas langsung.",
    "Token / cost budget caps": "Batas anggaran token / biaya",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "Batas pengeluaran per hari dan per percakapan, dengan asisten menonaktifkan dirinya sendiri saat batas habis. Hingga fitur ini ada, sakelar di atas adalah satu-satunya kontrol pengeluaran.",
    "Live status and recent activity": "Status langsung dan aktivitas terbaru",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "Kesehatan asisten, jumlah percakapan terbaru, dan pengeluaran hingga saat ini — tampilan yang akan memberi tahu Anda bahwa masalah anggaran atau batas laju sedang terjadi, saat sedang terjadi.",
    "Not implemented": "Belum diterapkan",
  },
  de: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "Aktivieren oder deaktivieren Sie den besucherseitigen Assistenten für Ihre öffentliche Website.",
    "Loading AI assistant settings…": "KI-Assistent-Einstellungen werden geladen…",
    "Visitor's AI Assistant": "KI-Assistent für Besucher",
    "The assistant your published site offers to readers.": "Der Assistent, den Ihre veröffentlichte Website den Lesern bietet.",
    "Admin AI Assistant": "KI-Assistent für Administratoren",
    "The assistant in this admin, for signed-in administrators.":
      "Der Assistent in diesem Admin-Bereich, für angemeldete Administratoren.",
    "Not built yet": "Noch nicht implementiert",
    "Operator controls that are planned but not implemented.": "Bedienerkontrollen, die geplant, aber nicht implementiert sind.",
    "Enable the AI assistant on the public site. *API Key needed*":
      "Den KI-Assistenten auf der öffentlichen Website aktivieren. *API-Schlüssel erforderlich*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "Besucher können mit dem Assistenten chatten. Er wird auf jeder öffentlichen Seite bereitgestellt.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "Aus. Die öffentliche Website enthält keinen Assistenten-Code und stellt keinen Assistenten-Endpunkt bereit — das ist eine vollständige Deaktivierung, kein verstecktes Widget.",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "Dieser Schlüssel ist für Ihre Besucher, nicht für Sie. Er ermöglicht es Personen, die Ihre veröffentlichte Website lesen, Fragen zu stellen und Antworten zu erhalten. Er wird auf dem Server gespeichert und für jede Besucherunterhaltung verwendet.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "Es ist ein anderer Schlüssel als der unter Einstellungen → Ausführungsmodus → BYOK. Dieser gehört Ihnen, wird nur in diesem Browser gespeichert und betreibt den Assistenten in diesem Admin-Bereich. Eine bereitgestellte Website kann ihn niemals verwenden — deshalb aktiviert das Speichern eines Schlüssels dort nicht den Besucher-Chat.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      'Ignorieren Sie den Hinweis „Nur von diesem Host gespeichert“ unten. Er gehört zur gemeinsamen Formularkomponente und ist auf dem Einstellungen-Bildschirm zutreffend, nicht hier. Dieser Schlüssel wird verschlüsselt auf dem Server gespeichert.',
    "See more about the visitor key": "Mehr über den Besucherschlüssel erfahren",
    "See more": "Mehr anzeigen",
    "See less": "Weniger anzeigen",
    Protocols: "Protokolle",
    Gateways: "Gateways",
    Configured: "Konfiguriert",
    "Not configured": "Nicht konfiguriert",
    Save: "Speichern",
    "Saving…": "Speichern…",
    "Test Key": "Schlüssel testen",
    "Testing…": "Wird getestet…",
    "Key works — {count} models available.": "Schlüssel funktioniert — {count} Modelle verfügbar.",
    "Checks the key against the provider and lists the models it can use.":
      "Überprüft den Schlüssel beim Anbieter und listet die Modelle auf, die er verwenden kann.",
    "Asking the provider which models this key allows…": "Fragt den Anbieter, welche Modelle dieser Schlüssel zulässt…",
    "Saved to the server, encrypted.": "Verschlüsselt auf dem Server gespeichert.",
    "Not saved yet — press Save.": "Noch nicht gespeichert — auf Speichern klicken.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Verschlüsselt auf dem Server gespeichert. Fügen Sie einen neuen Schlüssel ein, um ihn zu ersetzen.",
    "Paste your key, check it with Show, then press Save.":
      "Fügen Sie Ihren Schlüssel ein, prüfen Sie ihn mit Anzeigen und klicken Sie dann auf Speichern.",
    "Show the AI assistant on the admin site": "KI-Assistenten im Admin-Bereich anzeigen",
    "Open. The assistant panel is showing on the right.": "Geöffnet. Das Assistenten-Panel wird rechts angezeigt.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "Öffnet das Assistenten-Panel in diesem Admin-Bereich — dasselbe, was die schwebende Schaltfläche unten rechts tut.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "Für angemeldete Administratoren immer verfügbar, daher zeigt oder verbirgt dies nur das Panel. Verwenden Sie es, wenn die schwebende Schaltfläche außerhalb des Bildschirms oder schwer zu finden ist.",
    "Loading execution settings…": "Ausführungseinstellungen werden geladen…",
    "Detected on the Tovu server, not on your own computer.": "Auf dem Tovu-Server erkannt, nicht auf Ihrem eigenen Computer.",
    "Saved.": "Gespeichert.",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "Diese Bedienerkontrollen sind geplant, aber nicht implementiert. Nichts davon ist derzeit aktiv — den Assistenten heute zu aktivieren bedeutet, ihn ohne Kostenobergrenze, ohne besucherbezogene Ratenbegrenzung und ohne Live-Aktivitätsansicht zu betreiben.",
    "Token / cost budget caps": "Token-/Kostenbudgetgrenzen",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "Tägliche und unterhaltungsbezogene Ausgabenobergrenzen, wobei sich der Assistent selbst deaktiviert, wenn eine Grenze erreicht ist. Bis es das gibt, ist der obige Schalter die einzige Ausgabenkontrolle.",
    "Live status and recent activity": "Live-Status und aktuelle Aktivität",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "Assistenten-Zustand, aktuelle Unterhaltungszahlen und bisherige Ausgaben — die Ansicht, die Ihnen ein Budget- oder Ratenbegrenzungsproblem anzeigen würde, während es passiert.",
    "Not implemented": "Nicht implementiert",
  },
  "zh-CN": {
    "Turn the visitor-facing assistant on or off for your public site.":
      "为您的公开网站开启或关闭面向访客的助手。",
    "Loading AI assistant settings…": "正在加载 AI 助手设置…",
    "Visitor's AI Assistant": "访客 AI 助手",
    "The assistant your published site offers to readers.": "您已发布的网站向读者提供的助手。",
    "Admin AI Assistant": "管理员 AI 助手",
    "The assistant in this admin, for signed-in administrators.": "此管理后台中的助手，供已登录的管理员使用。",
    "Not built yet": "尚未构建",
    "Operator controls that are planned but not implemented.": "已规划但尚未实现的操作员控制项。",
    "Enable the AI assistant on the public site. *API Key needed*": "在公开网站上启用 AI 助手。*需要 API 密钥*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "访客可以与助手聊天。它会在每个公开页面上提供服务。",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "关闭。公开网站不包含任何助手代码，也不暴露任何助手端点——这是完全禁用，而非隐藏的小组件。",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "此密钥是给您的访客使用的，不是给您自己用的。它让阅读您已发布网站的人能够提问并获得答案。它存储在服务器上，用于每一次访客对话。",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "它与「设置 → 执行模式 → BYOK」下的密钥不同。那个密钥是您自己的，仅保存在此浏览器中，并驱动此管理后台中的助手。已部署的网站永远无法使用它——这就是为什么在那里保存密钥不会开启访客聊天。",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      '忽略下方的"仅由此主机存储"提示。该提示属于共享的表单组件，在设置页面上是准确的，但不适用于此处。此密钥将被加密存储在服务器上。',
    "See more about the visitor key": "了解更多关于访客密钥的信息",
    "See more": "查看更多",
    "See less": "收起",
    Protocols: "协议",
    Gateways: "网关",
    Configured: "已配置",
    "Not configured": "未配置",
    Save: "保存",
    "Saving…": "保存中…",
    "Test Key": "测试密钥",
    "Testing…": "测试中…",
    "Key works — {count} models available.": "密钥可用 — 有 {count} 个模型可用。",
    "Checks the key against the provider and lists the models it can use.": "向提供商验证该密钥，并列出它可以使用的模型。",
    "Asking the provider which models this key allows…": "正在向提供商查询此密钥允许使用哪些模型…",
    "Saved to the server, encrypted.": "已加密保存到服务器。",
    "Not saved yet — press Save.": "尚未保存 — 请点击保存。",
    "Stored on the server, encrypted. Paste a new key to replace it.": "已加密存储在服务器上。粘贴新密钥即可替换。",
    "Paste your key, check it with Show, then press Save.": "粘贴您的密钥，使用显示进行检查，然后点击保存。",
    "Show the AI assistant on the admin site": "在管理后台显示 AI 助手",
    "Open. The assistant panel is showing on the right.": "打开。助手面板显示在右侧。",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "打开此管理后台中的助手面板——与右下角悬浮按钮的作用相同。",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "已登录的管理员始终可以使用助手，因此这里只是显示或隐藏面板。如果悬浮按钮超出屏幕或难以找到，可使用此选项。",
    "Loading execution settings…": "正在加载执行设置…",
    "Detected on the Tovu server, not on your own computer.": "在 Tovu 服务器上检测到，而非您自己的计算机。",
    "Saved.": "已保存。",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "这些操作员控制项已规划但尚未实现。以下内容均未生效——如今开启助手意味着在没有费用上限、没有按访客限流、也没有实时活动视图的情况下运行它。",
    "Token / cost budget caps": "令牌/费用预算上限",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "按天和按对话设置支出上限，当上限耗尽时助手会自动禁用。在此功能推出之前，上方的开关是唯一的支出控制手段。",
    "Live status and recent activity": "实时状态与近期活动",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "助手运行状况、近期对话数量以及迄今为止的支出——这个视图能在预算或限流问题发生时及时告知您。",
    "Not implemented": "尚未实现",
  },
  "zh-TW": {
    "Turn the visitor-facing assistant on or off for your public site.":
      "為您的公開網站開啟或關閉面向訪客的助理。",
    "Loading AI assistant settings…": "正在載入 AI 助理設定…",
    "Visitor's AI Assistant": "訪客 AI 助理",
    "The assistant your published site offers to readers.": "您已發布的網站向讀者提供的助理。",
    "Admin AI Assistant": "管理員 AI 助理",
    "The assistant in this admin, for signed-in administrators.": "此管理後台中的助理，供已登入的管理員使用。",
    "Not built yet": "尚未建置",
    "Operator controls that are planned but not implemented.": "已規劃但尚未實作的操作員控制項。",
    "Enable the AI assistant on the public site. *API Key needed*": "在公開網站上啟用 AI 助理。*需要 API 金鑰*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "訪客可以與助理聊天。它會在每個公開頁面上提供服務。",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "關閉。公開網站不包含任何助理程式碼，也不會公開任何助理端點——這是完全停用，而非隱藏的小工具。",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "此金鑰是給您的訪客使用的，不是給您自己用的。它讓閱讀您已發布網站的人能夠提問並取得答案。它儲存在伺服器上，用於每一次訪客對話。",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "它與「設定 → 執行模式 → BYOK」下的金鑰不同。那個金鑰是您自己的，僅儲存在此瀏覽器中，並驅動此管理後台中的助理。已部署的網站永遠無法使用它——這就是為什麼在那裡儲存金鑰不會開啟訪客聊天。",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      '請忽略下方的「僅由此主機儲存」提示。此提示屬於共用的表單元件，在設定畫面上是正確的，但不適用於此處。此金鑰將被加密儲存在伺服器上。',
    "See more about the visitor key": "了解更多關於訪客金鑰的資訊",
    "See more": "顯示更多",
    "See less": "收合",
    Protocols: "通訊協定",
    Gateways: "閘道",
    Configured: "已設定",
    "Not configured": "尚未設定",
    Save: "儲存",
    "Saving…": "儲存中…",
    "Test Key": "測試金鑰",
    "Testing…": "測試中…",
    "Key works — {count} models available.": "金鑰可用 — 有 {count} 個模型可用。",
    "Checks the key against the provider and lists the models it can use.": "向供應商驗證此金鑰，並列出它可以使用的模型。",
    "Asking the provider which models this key allows…": "正在向供應商查詢此金鑰允許使用哪些模型…",
    "Saved to the server, encrypted.": "已加密儲存至伺服器。",
    "Not saved yet — press Save.": "尚未儲存 — 請按下儲存。",
    "Stored on the server, encrypted. Paste a new key to replace it.": "已加密儲存在伺服器上。貼上新金鑰即可取代。",
    "Paste your key, check it with Show, then press Save.": "貼上您的金鑰，使用顯示進行檢查，然後按下儲存。",
    "Show the AI assistant on the admin site": "在管理後台顯示 AI 助理",
    "Open. The assistant panel is showing on the right.": "開啟。助理面板顯示在右側。",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "開啟此管理後台中的助理面板——與右下角浮動按鈕的作用相同。",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "已登入的管理員隨時可以使用助理，因此這裡只是顯示或隱藏面板。如果浮動按鈕超出畫面或難以找到，可使用此選項。",
    "Loading execution settings…": "正在載入執行設定…",
    "Detected on the Tovu server, not on your own computer.": "在 Tovu 伺服器上偵測到，而非您自己的電腦。",
    "Saved.": "已儲存。",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "這些操作員控制項已規劃但尚未實作。以下內容均未生效——現在開啟助理意味著在沒有費用上限、沒有按訪客限流、也沒有即時活動檢視的情況下執行它。",
    "Token / cost budget caps": "權杖／費用預算上限",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "按日與按對話設定支出上限，當上限耗盡時助理會自動停用。在此功能推出之前，上方的開關是唯一的支出控制方式。",
    "Live status and recent activity": "即時狀態與近期活動",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "助理運作狀況、近期對話數量以及迄今為止的支出——這個檢視能在預算或限流問題發生時即時告知您。",
    "Not implemented": "尚未實作",
  },
  "pt-BR": {
    "Turn the visitor-facing assistant on or off for your public site.":
      "Ative ou desative o assistente voltado para visitantes no seu site público.",
    "Loading AI assistant settings…": "Carregando as configurações do assistente de IA…",
    "Visitor's AI Assistant": "Assistente de IA do Visitante",
    "The assistant your published site offers to readers.": "O assistente que seu site publicado oferece aos leitores.",
    "Admin AI Assistant": "Assistente de IA de Administração",
    "The assistant in this admin, for signed-in administrators.":
      "O assistente nesta administração, para administradores com sessão iniciada.",
    "Not built yet": "Ainda não implementado",
    "Operator controls that are planned but not implemented.": "Controles do operador planejados, mas não implementados.",
    "Enable the AI assistant on the public site. *API Key needed*":
      "Ativar o assistente de IA no site público. *Chave de API necessária*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "Os visitantes podem conversar com o assistente. Ele é disponibilizado em todas as páginas públicas.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "Desativado. O site público não inclui código do assistente nem expõe nenhum endpoint do assistente — isso é uma desativação completa, não um widget oculto.",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "Esta chave é para seus visitantes, não para você. É o que permite que as pessoas que leem seu site publicado façam perguntas e obtenham respostas. Ela é armazenada no servidor e usada em cada conversa de visitante.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "É uma chave diferente daquela em Configurações → Modo de execução → BYOK. Aquela é sua, é salva apenas neste navegador e alimenta o assistente nesta administração. Um site implantado nunca pode usá-la — por isso salvar uma chave ali não ativa o chat do visitante.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      'Ignore a nota "Armazenada apenas por este host" abaixo. Ela pertence ao componente de formulário compartilhado e é precisa na tela de Configurações, não aqui. Esta chave será armazenada no servidor, criptografada.',
    "See more about the visitor key": "Ver mais sobre a chave do visitante",
    "See more": "Ver mais",
    "See less": "Ver menos",
    Protocols: "Protocolos",
    Gateways: "Gateways",
    Configured: "Configurado",
    "Not configured": "Não configurado",
    Save: "Salvar",
    "Saving…": "Salvando…",
    "Test Key": "Testar chave",
    "Testing…": "Testando…",
    "Key works — {count} models available.": "A chave funciona — {count} modelos disponíveis.",
    "Checks the key against the provider and lists the models it can use.":
      "Verifica a chave com o provedor e lista os modelos que ela pode usar.",
    "Asking the provider which models this key allows…": "Perguntando ao provedor quais modelos esta chave permite…",
    "Saved to the server, encrypted.": "Salva no servidor, criptografada.",
    "Not saved yet — press Save.": "Ainda não salva — clique em Salvar.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Armazenada no servidor, criptografada. Cole uma nova chave para substituí-la.",
    "Paste your key, check it with Show, then press Save.":
      "Cole sua chave, verifique-a com Mostrar e depois clique em Salvar.",
    "Show the AI assistant on the admin site": "Mostrar o assistente de IA no site de administração",
    "Open. The assistant panel is showing on the right.": "Aberto. O painel do assistente está sendo exibido à direita.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "Abre o painel do assistente nesta administração — o mesmo que o botão flutuante no canto inferior direito faz.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "Sempre disponível para administradores com sessão iniciada, então isso apenas mostra ou oculta o painel. Use-o se o botão flutuante ficar fora da tela ou for difícil de encontrar.",
    "Loading execution settings…": "Carregando as configurações de execução…",
    "Detected on the Tovu server, not on your own computer.": "Detectado no servidor da Tovu, não no seu próprio computador.",
    "Saved.": "Salvo.",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "Esses controles do operador estão planejados, mas não implementados. Nada abaixo está ativo — ativar o assistente hoje significa executá-lo sem limite de custo, sem limitação de taxa por visitante e sem uma visão de atividade ao vivo.",
    "Token / cost budget caps": "Limites de orçamento de tokens/custo",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "Tetos de gasto por dia e por conversa, com o assistente se desativando quando um teto se esgota. Até que isso exista, o interruptor acima é o único controle de gastos.",
    "Live status and recent activity": "Status ao vivo e atividade recente",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "Integridade do assistente, contagens de conversas recentes e gastos até o momento — a visão que indicaria um problema de orçamento ou limite de taxa enquanto ele está acontecendo.",
    "Not implemented": "Não implementado",
  },
  ru: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "Включите или отключите ассистента для посетителей на вашем публичном сайте.",
    "Loading AI assistant settings…": "Загрузка настроек ИИ-ассистента…",
    "Visitor's AI Assistant": "ИИ-ассистент для посетителей",
    "The assistant your published site offers to readers.": "Ассистент, которого ваш опубликованный сайт предлагает читателям.",
    "Admin AI Assistant": "ИИ-ассистент администратора",
    "The assistant in this admin, for signed-in administrators.":
      "Ассистент в этой админ-панели для авторизованных администраторов.",
    "Not built yet": "Ещё не реализовано",
    "Operator controls that are planned but not implemented.": "Элементы управления оператора, которые запланированы, но не реализованы.",
    "Enable the AI assistant on the public site. *API Key needed*":
      "Включить ИИ-ассистента на публичном сайте. *Требуется API-ключ*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "Посетители могут общаться с ассистентом в чате. Он подключён на каждой публичной странице.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "Выключено. Публичный сайт не содержит кода ассистента и не открывает никакой конечной точки ассистента — это полное отключение, а не скрытый виджет.",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "Этот ключ предназначен для ваших посетителей, а не для вас. Именно он позволяет людям, читающим ваш опубликованный сайт, задавать вопросы и получать ответы. Он хранится на сервере и используется в каждой беседе с посетителем.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "Это другой ключ, отличный от того, что находится в разделе Настройки → Режим выполнения → BYOK. Тот ключ — ваш собственный, он сохраняется только в этом браузере и используется ассистентом в этой админ-панели. Развёрнутый сайт никогда не сможет его использовать — поэтому сохранение ключа там не включает чат для посетителей.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      'Игнорируйте примечание «Хранится только на этом хосте» ниже. Оно относится к общему компоненту формы и верно для экрана настроек, но не здесь. Этот ключ будет храниться на сервере в зашифрованном виде.',
    "See more about the visitor key": "Подробнее о ключе для посетителей",
    "See more": "Показать больше",
    "See less": "Показать меньше",
    Protocols: "Протоколы",
    Gateways: "Шлюзы",
    Configured: "Настроено",
    "Not configured": "Не настроено",
    Save: "Сохранить",
    "Saving…": "Сохранение…",
    "Test Key": "Проверить ключ",
    "Testing…": "Проверка…",
    "Key works — {count} models available.": "Ключ работает — доступно моделей: {count}.",
    "Checks the key against the provider and lists the models it can use.":
      "Проверяет ключ у провайдера и выводит список моделей, которые он может использовать.",
    "Asking the provider which models this key allows…": "Запрашиваем у провайдера, какие модели разрешены этим ключом…",
    "Saved to the server, encrypted.": "Сохранено на сервере в зашифрованном виде.",
    "Not saved yet — press Save.": "Ещё не сохранено — нажмите «Сохранить».",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Хранится на сервере в зашифрованном виде. Вставьте новый ключ, чтобы заменить его.",
    "Paste your key, check it with Show, then press Save.":
      "Вставьте свой ключ, проверьте его с помощью «Показать», затем нажмите «Сохранить».",
    "Show the AI assistant on the admin site": "Показывать ИИ-ассистента в админ-панели",
    "Open. The assistant panel is showing on the right.": "Открыто. Панель ассистента отображается справа.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "Открывает панель ассистента в этой админ-панели — то же самое делает плавающая кнопка в правом нижнем углу.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "Всегда доступно авторизованным администраторам, поэтому это только показывает или скрывает панель. Используйте, если плавающая кнопка оказывается за пределами экрана или её трудно найти.",
    "Loading execution settings…": "Загрузка настроек выполнения…",
    "Detected on the Tovu server, not on your own computer.": "Обнаружено на сервере Tovu, а не на вашем компьютере.",
    "Saved.": "Сохранено.",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "Эти элементы управления оператора запланированы, но не реализованы. Ничто из перечисленного ниже сейчас не действует — включение ассистента сегодня означает его работу без потолка расходов, без ограничения частоты запросов по посетителям и без просмотра активности в реальном времени.",
    "Token / cost budget caps": "Лимиты бюджета по токенам/расходам",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "Дневные лимиты расходов и лимиты на беседу, при этом ассистент отключается сам, когда лимит исчерпан. Пока этого нет, переключатель выше — единственный способ контроля расходов.",
    "Live status and recent activity": "Статус в реальном времени и недавняя активность",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "Состояние ассистента, количество недавних бесед и расходы на текущий момент — представление, которое сообщило бы вам о проблеме с бюджетом или ограничением частоты запросов в момент её возникновения.",
    "Not implemented": "Не реализовано",
  },
  fa: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "دستیار روبه‌روی بازدیدکننده را برای سایت عمومی خود روشن یا خاموش کنید.",
    "Loading AI assistant settings…": "در حال بارگذاری تنظیمات دستیار هوش مصنوعی…",
    "Visitor's AI Assistant": "دستیار هوش مصنوعی بازدیدکننده",
    "The assistant your published site offers to readers.": "دستیاری که سایت منتشرشده‌ی شما به خوانندگان ارائه می‌دهد.",
    "Admin AI Assistant": "دستیار هوش مصنوعی مدیر",
    "The assistant in this admin, for signed-in administrators.": "دستیار در این پنل مدیریت، برای مدیرانی که وارد شده‌اند.",
    "Not built yet": "هنوز ساخته نشده",
    "Operator controls that are planned but not implemented.": "کنترل‌های اپراتوری که برنامه‌ریزی شده‌اند اما پیاده‌سازی نشده‌اند.",
    "Enable the AI assistant on the public site. *API Key needed*":
      "دستیار هوش مصنوعی را در سایت عمومی فعال کنید. *کلید API لازم است*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "بازدیدکنندگان می‌توانند با دستیار گفتگو کنند. این دستیار در هر صفحه‌ی عمومی ارائه می‌شود.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "خاموش. سایت عمومی هیچ کد دستیاری ارسال نمی‌کند و هیچ نقطه پایانی دستیاری را در معرض دید قرار نمی‌دهد — این یک غیرفعال‌سازی کامل است، نه یک ابزارک پنهان.",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "این کلید برای بازدیدکنندگان شماست، نه برای خودتان. این همان چیزی است که به افرادی که سایت منتشرشده‌ی شما را می‌خوانند اجازه می‌دهد سؤال بپرسند و پاسخ بگیرند. این کلید روی سرور ذخیره می‌شود و برای هر گفتگوی بازدیدکننده استفاده می‌شود.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "این کلید با کلیدی که در تنظیمات → حالت اجرا → BYOK قرار دارد، متفاوت است. آن کلید مال خودتان است، فقط در همین مرورگر ذخیره می‌شود و دستیار این پنل مدیریت را تغذیه می‌کند. یک سایت مستقر هرگز نمی‌تواند از آن استفاده کند — به همین دلیل ذخیره‌ی کلید در آنجا گفتگوی بازدیدکننده را فعال نمی‌کند.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      'یادداشت «فقط توسط این میزبان ذخیره شده» در پایین را نادیده بگیرید. این یادداشت متعلق به مؤلفه فرم مشترک است و در صفحه تنظیمات درست است، نه اینجا. این کلید به‌صورت رمزنگاری‌شده روی سرور ذخیره خواهد شد.',
    "See more about the visitor key": "بیشتر درباره‌ی کلید بازدیدکننده بخوانید",
    "See more": "بیشتر ببینید",
    "See less": "کمتر ببینید",
    Protocols: "پروتکل‌ها",
    Gateways: "دروازه‌ها",
    Configured: "پیکربندی‌شده",
    "Not configured": "پیکربندی نشده",
    Save: "ذخیره",
    "Saving…": "در حال ذخیره…",
    "Test Key": "آزمایش کلید",
    "Testing…": "در حال آزمایش…",
    "Key works — {count} models available.": "کلید کار می‌کند — {count} مدل در دسترس است.",
    "Checks the key against the provider and lists the models it can use.":
      "کلید را نزد ارائه‌دهنده بررسی می‌کند و مدل‌هایی را که می‌تواند استفاده کند فهرست می‌کند.",
    "Asking the provider which models this key allows…": "در حال پرسیدن از ارائه‌دهنده که این کلید کدام مدل‌ها را مجاز می‌داند…",
    "Saved to the server, encrypted.": "به‌صورت رمزنگاری‌شده روی سرور ذخیره شد.",
    "Not saved yet — press Save.": "هنوز ذخیره نشده — روی ذخیره بزنید.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "به‌صورت رمزنگاری‌شده روی سرور ذخیره شده است. برای جایگزینی، کلید جدید را جای‌گذاری کنید.",
    "Paste your key, check it with Show, then press Save.":
      "کلید خود را جای‌گذاری کنید، با نمایش آن را بررسی کنید، سپس روی ذخیره بزنید.",
    "Show the AI assistant on the admin site": "نمایش دستیار هوش مصنوعی در سایت مدیریت",
    "Open. The assistant panel is showing on the right.": "باز. پنل دستیار در سمت راست نمایش داده می‌شود.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "پنل دستیار را در این پنل مدیریت باز می‌کند — همان کاری که دکمه‌ی شناور در گوشه‌ی پایین‌سمت‌راست انجام می‌دهد.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "همیشه برای مدیرانی که وارد شده‌اند در دسترس است، بنابراین این گزینه فقط پنل را نمایش یا پنهان می‌کند. اگر دکمه‌ی شناور خارج از صفحه باشد یا پیدا کردنش سخت باشد، از آن استفاده کنید.",
    "Loading execution settings…": "در حال بارگذاری تنظیمات اجرا…",
    "Detected on the Tovu server, not on your own computer.": "روی سرور Tovu شناسایی شد، نه روی رایانه‌ی خودتان.",
    "Saved.": "ذخیره شد.",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "این کنترل‌های اپراتوری برنامه‌ریزی شده‌اند اما پیاده‌سازی نشده‌اند. هیچ‌کدام از موارد زیر در حال حاضر فعال نیست — روشن کردن دستیار امروز به این معناست که آن را بدون سقف هزینه، بدون محدودیت نرخ به‌ازای هر بازدیدکننده و بدون نمای فعالیت زنده اجرا کنید.",
    "Token / cost budget caps": "سقف بودجه‌ی توکن / هزینه",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "سقف هزینه‌ی روزانه و به‌ازای هر گفتگو، به‌طوری‌که دستیار وقتی سقف تمام شود خودش را غیرفعال می‌کند. تا زمانی که این ویژگی وجود نداشته باشد، کلید بالا تنها کنترل هزینه است.",
    "Live status and recent activity": "وضعیت زنده و فعالیت اخیر",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "سلامت دستیار، شمار گفتگوهای اخیر و هزینه‌ی تاکنون — نمایی که در همان لحظه‌ای که مشکل بودجه یا محدودیت نرخ رخ می‌دهد، به شما اطلاع می‌دهد.",
    "Not implemented": "پیاده‌سازی نشده",
  },
  ar: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "فعّل أو عطّل المساعد الموجّه للزوار في موقعك العام.",
    "Loading AI assistant settings…": "جارٍ تحميل إعدادات مساعد الذكاء الاصطناعي…",
    "Visitor's AI Assistant": "مساعد الذكاء الاصطناعي للزوار",
    "The assistant your published site offers to readers.": "المساعد الذي يقدّمه موقعك المنشور للقرّاء.",
    "Admin AI Assistant": "مساعد الذكاء الاصطناعي للمسؤول",
    "The assistant in this admin, for signed-in administrators.": "المساعد في لوحة الإدارة هذه، للمسؤولين المسجَّلين الدخول.",
    "Not built yet": "لم يُبنَ بعد",
    "Operator controls that are planned but not implemented.": "عناصر تحكم للمُشغِّل مخطَّط لها لكنها غير منفَّذة.",
    "Enable the AI assistant on the public site. *API Key needed*":
      "تفعيل مساعد الذكاء الاصطناعي في الموقع العام. *يلزم مفتاح API*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "يمكن للزوار الدردشة مع المساعد، إذ يُقدَّم في كل صفحة عامة.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "معطَّل. لا يشحن الموقع العام أي كود للمساعد ولا يكشف عن أي نقطة نهاية للمساعد — هذا تعطيل كامل، وليس أداة مخفية.",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "هذا المفتاح مخصَّص لزوارك، وليس لك؛ فهو ما يتيح للأشخاص الذين يقرؤون موقعك المنشور طرح الأسئلة والحصول على إجابات. يُخزَّن على الخادم ويُستخدَم في كل محادثة مع زائر.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "إنه مفتاح مختلف عن ذلك الموجود ضمن الإعدادات → وضع التنفيذ → BYOK. ذلك المفتاح خاص بك، يُحفَظ فقط في هذا المتصفح، ويُشغِّل المساعد في لوحة الإدارة هذه. لا يمكن لموقع منشور أن يستخدمه أبدًا — ولهذا فإن حفظ مفتاح هناك لا يُفعِّل دردشة الزوار.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      'تجاهل الملاحظة "يُخزَّن فقط بواسطة هذا المضيف" أدناه. فهي تخص مكوّن النموذج المشترك وتنطبق على شاشة الإعدادات، وليس هنا. سيُخزَّن هذا المفتاح على الخادم، مشفَّرًا.',
    "See more about the visitor key": "معرفة المزيد حول مفتاح الزائر",
    "See more": "عرض المزيد",
    "See less": "عرض أقل",
    Protocols: "البروتوكولات",
    Gateways: "البوابات",
    Configured: "مهيَّأ",
    "Not configured": "غير مهيَّأ",
    Save: "حفظ",
    "Saving…": "جارٍ الحفظ…",
    "Test Key": "اختبار المفتاح",
    "Testing…": "جارٍ الاختبار…",
    "Key works — {count} models available.": "المفتاح يعمل — يتوفر {count} من النماذج.",
    "Checks the key against the provider and lists the models it can use.":
      "يتحقّق من المفتاح لدى المزوِّد ويسرد النماذج التي يمكنه استخدامها.",
    "Asking the provider which models this key allows…": "جارٍ سؤال المزوِّد عن النماذج التي يسمح بها هذا المفتاح…",
    "Saved to the server, encrypted.": "حُفظ على الخادم، مشفَّرًا.",
    "Not saved yet — press Save.": "لم يُحفظ بعد — اضغط حفظ.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "مخزَّن على الخادم، مشفَّرًا. الصق مفتاحًا جديدًا لاستبداله.",
    "Paste your key, check it with Show, then press Save.":
      "الصق مفتاحك، تحقّق منه باستخدام إظهار، ثم اضغط حفظ.",
    "Show the AI assistant on the admin site": "إظهار مساعد الذكاء الاصطناعي في موقع الإدارة",
    "Open. The assistant panel is showing on the right.": "مفتوح. لوحة المساعد تظهر على اليمين.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "يفتح لوحة المساعد في لوحة الإدارة هذه — الأمر نفسه الذي يقوم به الزر العائم في الزاوية السفلية اليمنى.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "متاح دائمًا للمسؤولين المسجَّلين الدخول، لذا فإن هذا يقتصر على إظهار اللوحة أو إخفائها. استخدمه إذا كان الزر العائم خارج الشاشة أو يصعب العثور عليه.",
    "Loading execution settings…": "جارٍ تحميل إعدادات التنفيذ…",
    "Detected on the Tovu server, not on your own computer.": "اكتُشف على خادم Tovu، وليس على جهاز الكمبيوتر الخاص بك.",
    "Saved.": "تم الحفظ.",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "عناصر تحكم المُشغِّل هذه مخطَّط لها لكنها غير منفَّذة. لا شيء مما يلي فعّال حاليًا — تفعيل المساعد اليوم يعني تشغيله دون سقف للتكلفة، ودون تحديد لمعدل الطلبات لكل زائر، ودون عرض للنشاط المباشر.",
    "Token / cost budget caps": "حدود ميزانية الرموز / التكلفة",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "حدود إنفاق يومية ولكل محادثة، مع تعطيل المساعد نفسه تلقائيًا عند استنفاد الحد. وإلى أن يتوفّر ذلك، يظل المفتاح أعلاه وسيلة التحكم الوحيدة في الإنفاق.",
    "Live status and recent activity": "الحالة المباشرة والنشاط الأخير",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "سلامة المساعد، وأعداد المحادثات الأخيرة، والإنفاق حتى الآن — العرض الذي كان سيُعلمك بحدوث مشكلة في الميزانية أو في حد المعدل أثناء وقوعها.",
    "Not implemented": "غير منفَّذ",
  },
  ja: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "公開サイトで訪問者向けアシスタントのオン・オフを切り替えます。",
    "Loading AI assistant settings…": "AIアシスタントの設定を読み込み中…",
    "Visitor's AI Assistant": "訪問者向けAIアシスタント",
    "The assistant your published site offers to readers.": "公開中のサイトが読者に提供するアシスタント。",
    "Admin AI Assistant": "管理者向けAIアシスタント",
    "The assistant in this admin, for signed-in administrators.": "この管理画面内のアシスタント。サインイン済みの管理者向けです。",
    "Not built yet": "未実装",
    "Operator controls that are planned but not implemented.": "計画中だが未実装のオペレーター向け設定。",
    "Enable the AI assistant on the public site. *API Key needed*": "公開サイトでAIアシスタントを有効にする。*APIキーが必要です*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "訪問者はアシスタントとチャットできます。すべての公開ページで提供されます。",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "オフ。公開サイトはアシスタントのコードを一切含まず、アシスタントのエンドポイントも公開しません — これは完全な無効化であり、隠しウィジェットではありません。",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "このキーは訪問者のためのものであり、あなた自身のものではありません。公開サイトを読む人が質問して回答を得られるようにするためのものです。サーバーに保存され、訪問者とのすべての会話で使用されます。",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "これは「設定 → 実行モード → BYOK」にあるキーとは別のものです。そちらはあなた自身のキーで、このブラウザにのみ保存され、この管理画面内のアシスタントを動かします。デプロイ済みのサイトがそれを使うことは決してありません — そのため、そちらでキーを保存しても訪問者向けチャットは有効になりません。",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      '下にある「このホストにのみ保存」という注記は無視してください。それは共有フォームコンポーネントに属するもので、設定画面では正確ですが、ここでは当てはまりません。このキーは暗号化されてサーバーに保存されます。',
    "See more about the visitor key": "訪問者用キーの詳細を見る",
    "See more": "もっと見る",
    "See less": "閉じる",
    Protocols: "プロトコル",
    Gateways: "ゲートウェイ",
    Configured: "設定済み",
    "Not configured": "未設定",
    Save: "保存",
    "Saving…": "保存中…",
    "Test Key": "キーをテスト",
    "Testing…": "テスト中…",
    "Key works — {count} models available.": "キーは有効です — 利用可能なモデル {count} 件。",
    "Checks the key against the provider and lists the models it can use.":
      "プロバイダーに対してキーを確認し、使用できるモデルの一覧を表示します。",
    "Asking the provider which models this key allows…": "このキーで許可されているモデルをプロバイダーに問い合わせています…",
    "Saved to the server, encrypted.": "暗号化されてサーバーに保存済みです。",
    "Not saved yet — press Save.": "まだ保存されていません — 保存を押してください。",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "暗号化されてサーバーに保存されています。置き換えるには新しいキーを貼り付けてください。",
    "Paste your key, check it with Show, then press Save.":
      "キーを貼り付け、表示で確認してから保存を押してください。",
    "Show the AI assistant on the admin site": "管理サイトにAIアシスタントを表示する",
    "Open. The assistant panel is showing on the right.": "開いています。アシスタントパネルが右側に表示されています。",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "この管理画面内でアシスタントパネルを開きます — 右下のフローティングボタンと同じ動作です。",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "サインイン済みの管理者は常に利用できるため、これはパネルの表示・非表示を切り替えるだけです。フローティングボタンが画面外にあったり見つけにくい場合に使用してください。",
    "Loading execution settings…": "実行設定を読み込み中…",
    "Detected on the Tovu server, not on your own computer.": "自分のコンピューターではなく、Tovuサーバー上で検出されました。",
    "Saved.": "保存しました。",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "これらのオペレーター向け設定は計画中ですが未実装です。以下の項目は現在何も有効になっていません — 今日アシスタントをオンにすると、コスト上限なし、訪問者ごとのレート制限なし、リアルタイムのアクティビティ表示なしで実行することになります。",
    "Token / cost budget caps": "トークン／コスト予算の上限",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "1日ごとおよび会話ごとの支出上限を設け、上限に達するとアシスタントが自動的に無効化されます。この機能が実装されるまでは、上のスイッチが唯一の支出コントロールです。",
    "Live status and recent activity": "リアルタイムステータスと最近のアクティビティ",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "アシスタントの状態、最近の会話数、これまでの支出 — 予算やレート制限の問題が発生しているときにリアルタイムで知らせてくれるビューです。",
    "Not implemented": "未実装",
  },
  ko: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "공개 사이트에서 방문자용 어시스턴트를 켜거나 끕니다.",
    "Loading AI assistant settings…": "AI 어시스턴트 설정을 불러오는 중…",
    "Visitor's AI Assistant": "방문자용 AI 어시스턴트",
    "The assistant your published site offers to readers.": "게시된 사이트가 독자에게 제공하는 어시스턴트입니다.",
    "Admin AI Assistant": "관리자용 AI 어시스턴트",
    "The assistant in this admin, for signed-in administrators.": "이 관리자 페이지의 어시스턴트로, 로그인한 관리자를 위한 것입니다.",
    "Not built yet": "아직 구현되지 않음",
    "Operator controls that are planned but not implemented.": "계획되었지만 아직 구현되지 않은 운영자 제어 항목입니다.",
    "Enable the AI assistant on the public site. *API Key needed*": "공개 사이트에서 AI 어시스턴트를 활성화합니다. *API 키 필요*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "방문자는 어시스턴트와 채팅할 수 있습니다. 모든 공개 페이지에서 제공됩니다.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "꺼짐. 공개 사이트는 어시스턴트 코드를 전혀 포함하지 않으며 어시스턴트 엔드포인트도 노출하지 않습니다 — 이는 숨겨진 위젯이 아니라 완전한 비활성화입니다.",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "이 키는 사용자님이 아니라 방문자를 위한 것입니다. 게시된 사이트를 읽는 사람들이 질문하고 답변을 받을 수 있게 해 주는 키입니다. 서버에 저장되며 모든 방문자 대화에 사용됩니다.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "설정 → 실행 모드 → BYOK에 있는 키와는 다른 키입니다. 그 키는 사용자님 소유이며 이 브라우저에만 저장되고, 이 관리자 페이지의 어시스턴트를 구동합니다. 배포된 사이트는 그 키를 절대 사용할 수 없습니다 — 그래서 그곳에 키를 저장해도 방문자 채팅이 켜지지 않습니다.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      '아래의 "이 호스트에만 저장됨" 안내는 무시하세요. 이는 공유 폼 컴포넌트에 속한 문구로, 설정 화면에서는 맞지만 여기서는 해당하지 않습니다. 이 키는 암호화되어 서버에 저장됩니다.',
    "See more about the visitor key": "방문자 키에 대해 더 알아보기",
    "See more": "더 보기",
    "See less": "간략히 보기",
    Protocols: "프로토콜",
    Gateways: "게이트웨이",
    Configured: "구성됨",
    "Not configured": "구성되지 않음",
    Save: "저장",
    "Saving…": "저장 중…",
    "Test Key": "키 테스트",
    "Testing…": "테스트 중…",
    "Key works — {count} models available.": "키가 작동합니다 — 사용 가능한 모델 {count}개.",
    "Checks the key against the provider and lists the models it can use.":
      "제공업체에 키를 확인하고 사용할 수 있는 모델 목록을 표시합니다.",
    "Asking the provider which models this key allows…": "이 키로 사용할 수 있는 모델을 제공업체에 문의하는 중…",
    "Saved to the server, encrypted.": "암호화되어 서버에 저장되었습니다.",
    "Not saved yet — press Save.": "아직 저장되지 않았습니다 — 저장을 누르세요.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "암호화되어 서버에 저장되어 있습니다. 교체하려면 새 키를 붙여넣으세요.",
    "Paste your key, check it with Show, then press Save.":
      "키를 붙여넣고 표시로 확인한 다음 저장을 누르세요.",
    "Show the AI assistant on the admin site": "관리자 사이트에 AI 어시스턴트 표시",
    "Open. The assistant panel is showing on the right.": "열림. 어시스턴트 패널이 오른쪽에 표시되고 있습니다.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "이 관리자 페이지에서 어시스턴트 패널을 엽니다 — 오른쪽 하단의 플로팅 버튼과 동일한 기능입니다.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "로그인한 관리자는 언제나 어시스턴트를 사용할 수 있으므로, 이는 패널을 표시하거나 숨기기만 합니다. 플로팅 버튼이 화면 밖에 있거나 찾기 어려울 때 사용하세요.",
    "Loading execution settings…": "실행 설정을 불러오는 중…",
    "Detected on the Tovu server, not on your own computer.": "사용자님의 컴퓨터가 아니라 Tovu 서버에서 감지되었습니다.",
    "Saved.": "저장됨.",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "이 운영자 제어 항목들은 계획되었지만 아직 구현되지 않았습니다. 아래 항목 중 현재 활성화된 것은 없습니다 — 오늘 어시스턴트를 켠다는 것은 비용 상한 없이, 방문자별 속도 제한 없이, 실시간 활동 보기 없이 실행한다는 의미입니다.",
    "Token / cost budget caps": "토큰/비용 예산 상한",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "일별 및 대화별 지출 상한이며, 상한이 소진되면 어시스턴트가 스스로 비활성화됩니다. 이 기능이 도입되기 전까지는 위의 스위치가 유일한 지출 제어 수단입니다.",
    "Live status and recent activity": "실시간 상태 및 최근 활동",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "어시스턴트 상태, 최근 대화 수, 현재까지의 지출 — 예산이나 속도 제한 문제가 발생하는 순간 이를 알려줄 화면입니다.",
    "Not implemented": "구현되지 않음",
  },
  pl: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "Włącz lub wyłącz asystenta widocznego dla odwiedzających na Twojej publicznej witrynie.",
    "Loading AI assistant settings…": "Wczytywanie ustawień asystenta AI…",
    "Visitor's AI Assistant": "Asystent AI dla odwiedzających",
    "The assistant your published site offers to readers.": "Asystent, którego Twoja opublikowana witryna oferuje czytelnikom.",
    "Admin AI Assistant": "Asystent AI administratora",
    "The assistant in this admin, for signed-in administrators.": "Asystent w tym panelu administracyjnym, dla zalogowanych administratorów.",
    "Not built yet": "Jeszcze niezbudowane",
    "Operator controls that are planned but not implemented.": "Elementy sterujące operatora, które są zaplanowane, ale niewdrożone.",
    "Enable the AI assistant on the public site. *API Key needed*": "Włącz asystenta AI w publicznej witrynie. *Wymagany klucz API*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "Odwiedzający mogą rozmawiać z asystentem. Jest on dostępny na każdej publicznej stronie.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "Wyłączone. Publiczna witryna nie zawiera żadnego kodu asystenta i nie udostępnia żadnego punktu końcowego asystenta — to pełne wyłączenie, a nie ukryty widżet.",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "Ten klucz jest przeznaczony dla Twoich odwiedzających, nie dla Ciebie. To on umożliwia osobom czytającym Twoją opublikowaną witrynę zadawanie pytań i otrzymywanie odpowiedzi. Jest przechowywany na serwerze i używany w każdej rozmowie z odwiedzającym.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "To inny klucz niż ten w Ustawienia → Tryb wykonania → BYOK. Tamten jest Twój własny, zapisywany tylko w tej przeglądarce i zasila asystenta w tym panelu administracyjnym. Wdrożona witryna nigdy nie może go użyć — dlatego zapisanie tam klucza nie włącza czatu dla odwiedzających.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      'Zignoruj poniższą notatkę „Przechowywane wyłącznie przez tego hosta”. Należy ona do współdzielonego komponentu formularza i jest trafna na ekranie Ustawień, ale nie tutaj. Ten klucz zostanie zapisany na serwerze, zaszyfrowany.',
    "See more about the visitor key": "Dowiedz się więcej o kluczu dla odwiedzających",
    "See more": "Pokaż więcej",
    "See less": "Pokaż mniej",
    Protocols: "Protokoły",
    Gateways: "Bramki",
    Configured: "Skonfigurowano",
    "Not configured": "Nieskonfigurowano",
    Save: "Zapisz",
    "Saving…": "Zapisywanie…",
    "Test Key": "Testuj klucz",
    "Testing…": "Testowanie…",
    "Key works — {count} models available.": "Klucz działa — dostępnych modeli: {count}.",
    "Checks the key against the provider and lists the models it can use.":
      "Sprawdza klucz u dostawcy i wyświetla listę modeli, których może użyć.",
    "Asking the provider which models this key allows…": "Sprawdzanie u dostawcy, jakie modele dopuszcza ten klucz…",
    "Saved to the server, encrypted.": "Zapisano na serwerze, zaszyfrowany.",
    "Not saved yet — press Save.": "Jeszcze niezapisany — kliknij Zapisz.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Przechowywany na serwerze, zaszyfrowany. Wklej nowy klucz, aby go zastąpić.",
    "Paste your key, check it with Show, then press Save.":
      "Wklej swój klucz, sprawdź go za pomocą Pokaż, a następnie kliknij Zapisz.",
    "Show the AI assistant on the admin site": "Pokaż asystenta AI w panelu administracyjnym",
    "Open. The assistant panel is showing on the right.": "Otwarty. Panel asystenta jest wyświetlany po prawej stronie.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "Otwiera panel asystenta w tym panelu administracyjnym — dokładnie to samo robi pływający przycisk w prawym dolnym rogu.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "Zawsze dostępny dla zalogowanych administratorów, więc to tylko pokazuje lub ukrywa panel. Użyj tego, jeśli pływający przycisk znajdzie się poza ekranem lub trudno go znaleźć.",
    "Loading execution settings…": "Wczytywanie ustawień wykonania…",
    "Detected on the Tovu server, not on your own computer.": "Wykryto na serwerze Tovu, a nie na Twoim komputerze.",
    "Saved.": "Zapisano.",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "Te elementy sterujące operatora są zaplanowane, ale niewdrożone. Nic poniżej nie jest obecnie aktywne — włączenie asystenta dzisiaj oznacza uruchomienie go bez limitu kosztów, bez ograniczania liczby żądań na odwiedzającego i bez podglądu aktywności na żywo.",
    "Token / cost budget caps": "Limity budżetu tokenów / kosztów",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "Dzienne limity wydatków oraz limity na rozmowę, przy czym asystent wyłącza się sam po wyczerpaniu limitu. Do czasu wdrożenia tej funkcji przełącznik powyżej jest jedyną kontrolą wydatków.",
    "Live status and recent activity": "Status na żywo i ostatnia aktywność",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "Kondycja asystenta, liczba ostatnich rozmów i dotychczasowe wydatki — widok, który poinformowałby o problemie z budżetem lub limitem żądań w momencie jego wystąpienia.",
    "Not implemented": "Niewdrożone",
  },
  hu: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "Kapcsolja be vagy ki a látogatók felé megjelenő asszisztenst a nyilvános webhelyén.",
    "Loading AI assistant settings…": "AI asszisztens beállításainak betöltése…",
    "Visitor's AI Assistant": "Látogatói AI asszisztens",
    "The assistant your published site offers to readers.": "Az asszisztens, amelyet közzétett webhelye kínál az olvasóknak.",
    "Admin AI Assistant": "Adminisztrátori AI asszisztens",
    "The assistant in this admin, for signed-in administrators.": "Az asszisztens ebben az adminisztrációban, bejelentkezett adminisztrátorok számára.",
    "Not built yet": "Még nincs megépítve",
    "Operator controls that are planned but not implemented.": "Tervezett, de nem megvalósított kezelői vezérlők.",
    "Enable the AI assistant on the public site. *API Key needed*": "Az AI asszisztens engedélyezése a nyilvános webhelyen. *API-kulcs szükséges*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "A látogatók cseveghetnek az asszisztenssel. Minden nyilvános oldalon elérhető.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "Kikapcsolva. A nyilvános webhely nem tartalmaz asszisztens-kódot, és nem tesz elérhetővé asszisztens-végpontot — ez teljes letiltás, nem rejtett modul.",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "Ez a kulcs a látogatói számára van, nem az Ön számára. Ez teszi lehetővé, hogy a közzétett webhelyét olvasó emberek kérdéseket tegyenek fel és választ kapjanak. A szerveren tárolódik, és minden látogatói beszélgetéshez felhasználásra kerül.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "Ez eltér a Beállítások → Végrehajtási mód → BYOK alatt található kulcstól. Az a sajátja, csak ebben a böngészőben mentődik, és az ebben az adminisztrációban lévő asszisztenst hajtja. Egy éles webhely soha nem használhatja azt — ezért nem kapcsolja be a látogatói csevegést, ha ott mentett el egy kulcsot.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      'Hagyja figyelmen kívül a lenti „Csak ez a hoszt tárolja” megjegyzést. Ez a megosztott űrlapkomponenshez tartozik, és a Beállítások képernyőn pontos, itt nem. Ez a kulcs titkosítva kerül tárolásra a szerveren.',
    "See more about the visitor key": "Tudjon meg többet a látogatói kulcsról",
    "See more": "Több megjelenítése",
    "See less": "Kevesebb megjelenítése",
    Protocols: "Protokollok",
    Gateways: "Átjárók",
    Configured: "Konfigurálva",
    "Not configured": "Nincs konfigurálva",
    Save: "Mentés",
    "Saving…": "Mentés…",
    "Test Key": "Kulcs tesztelése",
    "Testing…": "Tesztelés…",
    "Key works — {count} models available.": "A kulcs működik — {count} modell érhető el.",
    "Checks the key against the provider and lists the models it can use.":
      "Ellenőrzi a kulcsot a szolgáltatónál, és felsorolja a használható modelleket.",
    "Asking the provider which models this key allows…": "Lekérdezés a szolgáltatótól, mely modelleket engedélyezi ez a kulcs…",
    "Saved to the server, encrypted.": "Titkosítva mentve a szerverre.",
    "Not saved yet — press Save.": "Még nincs mentve — nyomja meg a Mentés gombot.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Titkosítva tárolva a szerveren. A cseréhez illesszen be egy új kulcsot.",
    "Paste your key, check it with Show, then press Save.":
      "Illessze be a kulcsát, ellenőrizze a Megjelenítéssel, majd nyomja meg a Mentés gombot.",
    "Show the AI assistant on the admin site": "Az AI asszisztens megjelenítése az adminisztrációs webhelyen",
    "Open. The assistant panel is showing on the right.": "Nyitva. Az asszisztens panel a jobb oldalon jelenik meg.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "Megnyitja az asszisztens panelt ebben az adminisztrációban — ugyanazt teszi, mint a jobb alsó sarokban lévő lebegő gomb.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "Bejelentkezett adminisztrátorok számára mindig elérhető, így ez csak megjeleníti vagy elrejti a panelt. Használja, ha a lebegő gomb kívül esik a képernyőn, vagy nehezen található.",
    "Loading execution settings…": "Végrehajtási beállítások betöltése…",
    "Detected on the Tovu server, not on your own computer.": "A Tovu szerveren észlelve, nem a saját számítógépén.",
    "Saved.": "Mentve.",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "Ezek a kezelői vezérlők tervezettek, de nincsenek megvalósítva. Az alábbiak közül jelenleg semmi sem aktív — az asszisztens mai bekapcsolása azt jelenti, hogy költségplafon, látogatónkénti sebességkorlátozás és élő tevékenységnézet nélkül fut.",
    "Token / cost budget caps": "Token-/költségkeret-plafonok",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "Napi és beszélgetésenkénti kiadási plafonok, amelyeknél az asszisztens automatikusan letiltja magát, ha a plafon kimerül. Amíg ez nem létezik, a fenti kapcsoló az egyetlen kiadásvezérlés.",
    "Live status and recent activity": "Élő állapot és legutóbbi tevékenység",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "Az asszisztens állapota, a legutóbbi beszélgetések száma és az eddigi kiadások — az a nézet, amely a történés pillanatában jelezné a költségvetési vagy sebességkorlát-problémát.",
    "Not implemented": "Nincs megvalósítva",
  },
  fr: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "Activez ou désactivez l'assistant destiné aux visiteurs sur votre site public.",
    "Loading AI assistant settings…": "Chargement des paramètres de l'assistant IA…",
    "Visitor's AI Assistant": "Assistant IA du visiteur",
    "The assistant your published site offers to readers.": "L'assistant que votre site publié propose aux lecteurs.",
    "Admin AI Assistant": "Assistant IA d'administration",
    "The assistant in this admin, for signed-in administrators.": "L'assistant dans cette administration, pour les administrateurs connectés.",
    "Not built yet": "Pas encore développé",
    "Operator controls that are planned but not implemented.": "Contrôles opérateur prévus mais non implémentés.",
    "Enable the AI assistant on the public site. *API Key needed*": "Activer l'assistant IA sur le site public. *Clé API requise*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "Les visiteurs peuvent discuter avec l'assistant. Il est servi sur chaque page publique.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "Désactivé. Le site public n'embarque aucun code d'assistant et n'expose aucun point de terminaison d'assistant — il s'agit d'une désactivation complète, pas d'un widget caché.",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "Cette clé est destinée à vos visiteurs, pas à vous. Elle permet aux personnes qui lisent votre site publié de poser des questions et d'obtenir des réponses. Elle est stockée sur le serveur et utilisée pour chaque conversation avec un visiteur.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "C'est une clé différente de celle sous Paramètres → Mode d'exécution → BYOK. Celle-là vous appartient, elle n'est enregistrée que dans ce navigateur, et elle alimente l'assistant dans cette administration. Un site déployé ne peut jamais l'utiliser — c'est pourquoi enregistrer une clé là-bas n'active pas le chat des visiteurs.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      "Ignorez la note « Stocké uniquement par cet hôte » ci-dessous. Elle appartient au composant de formulaire partagé et s'applique à l'écran Paramètres, pas ici. Cette clé sera stockée sur le serveur, chiffrée.",
    "See more about the visitor key": "En savoir plus sur la clé visiteur",
    "See more": "Voir plus",
    "See less": "Voir moins",
    Protocols: "Protocoles",
    Gateways: "Passerelles",
    Configured: "Configuré",
    "Not configured": "Non configuré",
    Save: "Enregistrer",
    "Saving…": "Enregistrement…",
    "Test Key": "Tester la clé",
    "Testing…": "Test en cours…",
    "Key works — {count} models available.": "La clé fonctionne — {count} modèles disponibles.",
    "Checks the key against the provider and lists the models it can use.":
      "Vérifie la clé auprès du fournisseur et liste les modèles qu'elle peut utiliser.",
    "Asking the provider which models this key allows…": "Interrogation du fournisseur sur les modèles autorisés par cette clé…",
    "Saved to the server, encrypted.": "Enregistrée sur le serveur, chiffrée.",
    "Not saved yet — press Save.": "Pas encore enregistrée — cliquez sur Enregistrer.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Stockée sur le serveur, chiffrée. Collez une nouvelle clé pour la remplacer.",
    "Paste your key, check it with Show, then press Save.":
      "Collez votre clé, vérifiez-la avec Afficher, puis cliquez sur Enregistrer.",
    "Show the AI assistant on the admin site": "Afficher l'assistant IA sur le site d'administration",
    "Open. The assistant panel is showing on the right.": "Ouvert. Le panneau de l'assistant s'affiche à droite.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "Ouvre le panneau de l'assistant dans cette administration — la même chose que fait le bouton flottant en bas à droite.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "Toujours disponible pour les administrateurs connectés, cette option ne fait donc qu'afficher ou masquer le panneau. Utilisez-la si le bouton flottant sort de l'écran ou devient difficile à trouver.",
    "Loading execution settings…": "Chargement des paramètres d'exécution…",
    "Detected on the Tovu server, not on your own computer.": "Détecté sur le serveur Tovu, pas sur votre propre ordinateur.",
    "Saved.": "Enregistré.",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "Ces contrôles opérateur sont prévus mais non implémentés. Rien ci-dessous n'est actif actuellement — activer l'assistant aujourd'hui signifie l'exécuter sans plafond de coût, sans limitation de débit par visiteur et sans vue d'activité en direct.",
    "Token / cost budget caps": "Plafonds de budget jetons/coût",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "Plafonds de dépenses par jour et par conversation, l'assistant se désactivant lui-même lorsqu'un plafond est atteint. En attendant que cela existe, l'interrupteur ci-dessus est le seul contrôle des dépenses.",
    "Live status and recent activity": "Statut en direct et activité récente",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "État de l'assistant, nombre de conversations récentes et dépenses à ce jour — la vue qui vous signalerait un problème de budget ou de limitation de débit au moment où il se produit.",
    "Not implemented": "Non implémenté",
  },
  uk: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "Увімкніть або вимкніть асистента для відвідувачів на вашому публічному сайті.",
    "Loading AI assistant settings…": "Завантаження налаштувань ШІ-асистента…",
    "Visitor's AI Assistant": "ШІ-асистент для відвідувачів",
    "The assistant your published site offers to readers.": "Асистент, якого ваш опублікований сайт пропонує читачам.",
    "Admin AI Assistant": "ШІ-асистент адміністратора",
    "The assistant in this admin, for signed-in administrators.": "Асистент у цій адмін-панелі для авторизованих адміністраторів.",
    "Not built yet": "Ще не створено",
    "Operator controls that are planned but not implemented.": "Елементи керування оператора, які заплановані, але не реалізовані.",
    "Enable the AI assistant on the public site. *API Key needed*": "Увімкнути ШІ-асистента на публічному сайті. *Потрібен API-ключ*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "Відвідувачі можуть спілкуватися з асистентом у чаті. Він доступний на кожній публічній сторінці.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "Вимкнено. Публічний сайт не містить жодного коду асистента і не відкриває жодної кінцевої точки асистента — це повне вимкнення, а не прихований віджет.",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "Цей ключ призначений для ваших відвідувачів, а не для вас. Саме він дозволяє людям, які читають ваш опублікований сайт, ставити запитання й отримувати відповіді. Він зберігається на сервері та використовується для кожної розмови з відвідувачем.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "Це інший ключ, ніж той, що в розділі Налаштування → Режим виконання → BYOK. Той ключ — ваш власний, зберігається лише в цьому браузері й живить асистента в цій адмін-панелі. Розгорнутий сайт ніколи не зможе його використати — тому збереження ключа там не вмикає чат для відвідувачів.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      'Ігноруйте примітку «Зберігається лише цим хостом» нижче. Вона стосується спільного компонента форми і є коректною на екрані Налаштувань, але не тут. Цей ключ буде збережено на сервері в зашифрованому вигляді.',
    "See more about the visitor key": "Дізнатися більше про ключ для відвідувачів",
    "See more": "Показати більше",
    "See less": "Показати менше",
    Protocols: "Протоколи",
    Gateways: "Шлюзи",
    Configured: "Налаштовано",
    "Not configured": "Не налаштовано",
    Save: "Зберегти",
    "Saving…": "Збереження…",
    "Test Key": "Перевірити ключ",
    "Testing…": "Перевірка…",
    "Key works — {count} models available.": "Ключ працює — доступно моделей: {count}.",
    "Checks the key against the provider and lists the models it can use.":
      "Перевіряє ключ у провайдера і виводить список моделей, які він може використовувати.",
    "Asking the provider which models this key allows…": "Запитуємо провайдера, які моделі дозволяє цей ключ…",
    "Saved to the server, encrypted.": "Збережено на сервері в зашифрованому вигляді.",
    "Not saved yet — press Save.": "Ще не збережено — натисніть «Зберегти».",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Зберігається на сервері в зашифрованому вигляді. Вставте новий ключ, щоб замінити його.",
    "Paste your key, check it with Show, then press Save.":
      "Вставте свій ключ, перевірте його за допомогою «Показати», потім натисніть «Зберегти».",
    "Show the AI assistant on the admin site": "Показувати ШІ-асистента на сайті адміністрування",
    "Open. The assistant panel is showing on the right.": "Відкрито. Панель асистента відображається праворуч.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "Відкриває панель асистента в цій адмін-панелі — те саме робить плаваюча кнопка в правому нижньому куті.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "Завжди доступно авторизованим адміністраторам, тому це лише показує або приховує панель. Використовуйте, якщо плаваюча кнопка опиняється за межами екрана або її важко знайти.",
    "Loading execution settings…": "Завантаження налаштувань виконання…",
    "Detected on the Tovu server, not on your own computer.": "Виявлено на сервері Tovu, а не на вашому комп'ютері.",
    "Saved.": "Збережено.",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "Ці елементи керування оператора заплановані, але не реалізовані. Ніщо з переліченого нижче наразі не діє — увімкнення асистента сьогодні означає його роботу без стелі витрат, без обмеження частоти запитів на відвідувача і без перегляду активності в реальному часі.",
    "Token / cost budget caps": "Ліміти бюджету токенів/витрат",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "Денні ліміти витрат і ліміти на розмову, при цьому асистент вимикається сам, коли ліміт вичерпано. Поки цього немає, перемикач вище — єдиний спосіб контролю витрат.",
    "Live status and recent activity": "Статус у реальному часі та нещодавня активність",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "Стан асистента, кількість нещодавніх розмов і витрати на сьогодні — перегляд, який повідомив би про проблему з бюджетом чи обмеженням частоти запитів у момент її виникнення.",
    "Not implemented": "Не реалізовано",
  },
  tr: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "Herkese açık sitenizde ziyaretçiye yönelik asistanı açın veya kapatın.",
    "Loading AI assistant settings…": "Yapay zeka asistanı ayarları yükleniyor…",
    "Visitor's AI Assistant": "Ziyaretçi Yapay Zeka Asistanı",
    "The assistant your published site offers to readers.": "Yayınlanan sitenizin okuyuculara sunduğu asistan.",
    "Admin AI Assistant": "Yönetici Yapay Zeka Asistanı",
    "The assistant in this admin, for signed-in administrators.": "Bu yönetim panelindeki asistan, oturum açmış yöneticiler içindir.",
    "Not built yet": "Henüz oluşturulmadı",
    "Operator controls that are planned but not implemented.": "Planlanan ancak uygulanmayan operatör kontrolleri.",
    "Enable the AI assistant on the public site. *API Key needed*": "Herkese açık sitede yapay zeka asistanını etkinleştirin. *API Anahtarı gerekli*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "Ziyaretçiler asistanla sohbet edebilir. Her herkese açık sayfada sunulur.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "Kapalı. Herkese açık site hiçbir asistan kodu içermez ve hiçbir asistan uç noktası açığa çıkarmaz — bu gizli bir widget değil, tam bir devre dışı bırakmadır.",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "Bu anahtar sizin için değil, ziyaretçileriniz içindir. Yayınlanan sitenizi okuyan kişilerin soru sorup yanıt almasını sağlayan şey budur. Sunucuda saklanır ve her ziyaretçi konuşmasında kullanılır.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "Bu, Ayarlar → Yürütme modu → BYOK altındaki anahtardan farklı bir anahtardır. O anahtar size aittir, yalnızca bu tarayıcıda kaydedilir ve bu yönetim panelindeki asistanı çalıştırır. Dağıtılmış bir site onu asla kullanamaz — bu nedenle anahtarı orada kaydetmek ziyaretçi sohbetini açmaz.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      'Aşağıdaki "Yalnızca bu ana bilgisayar tarafından saklanır" notunu göz ardı edin. Bu not, paylaşılan form bileşenine aittir ve Ayarlar ekranında doğrudur, burada değil. Bu anahtar şifrelenerek sunucuda saklanacaktır.',
    "See more about the visitor key": "Ziyaretçi anahtarı hakkında daha fazla bilgi edinin",
    "See more": "Daha fazla göster",
    "See less": "Daha az göster",
    Protocols: "Protokoller",
    Gateways: "Ağ geçitleri",
    Configured: "Yapılandırıldı",
    "Not configured": "Yapılandırılmadı",
    Save: "Kaydet",
    "Saving…": "Kaydediliyor…",
    "Test Key": "Anahtarı test et",
    "Testing…": "Test ediliyor…",
    "Key works — {count} models available.": "Anahtar çalışıyor — {count} model kullanılabilir.",
    "Checks the key against the provider and lists the models it can use.":
      "Anahtarı sağlayıcıya karşı kontrol eder ve kullanabileceği modelleri listeler.",
    "Asking the provider which models this key allows…": "Bu anahtarın hangi modellere izin verdiği sağlayıcıya soruluyor…",
    "Saved to the server, encrypted.": "Sunucuya şifrelenerek kaydedildi.",
    "Not saved yet — press Save.": "Henüz kaydedilmedi — Kaydet'e basın.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Sunucuda şifrelenerek saklanıyor. Değiştirmek için yeni bir anahtar yapıştırın.",
    "Paste your key, check it with Show, then press Save.":
      "Anahtarınızı yapıştırın, Göster ile kontrol edin, ardından Kaydet'e basın.",
    "Show the AI assistant on the admin site": "Yapay zeka asistanını yönetim sitesinde göster",
    "Open. The assistant panel is showing on the right.": "Açık. Asistan paneli sağda gösteriliyor.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "Bu yönetim panelinde asistan panelini açar — sağ alt köşedeki kayan düğmenin yaptığı ile aynı şeydir.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "Oturum açmış yöneticiler için her zaman kullanılabilir olduğundan, bu yalnızca paneli gösterir veya gizler. Kayan düğme ekran dışında kalırsa veya bulması zorsa kullanın.",
    "Loading execution settings…": "Yürütme ayarları yükleniyor…",
    "Detected on the Tovu server, not on your own computer.": "Kendi bilgisayarınızda değil, Tovu sunucusunda algılandı.",
    "Saved.": "Kaydedildi.",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "Bu operatör kontrolleri planlanmış ancak uygulanmamıştır. Aşağıdakilerin hiçbiri şu anda etkin değil — asistanı bugün açmak, onu maliyet tavanı olmadan, ziyaretçi başına hız sınırlaması olmadan ve canlı etkinlik görünümü olmadan çalıştırmak anlamına gelir.",
    "Token / cost budget caps": "Jeton / maliyet bütçesi tavanları",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "Gün başına ve konuşma başına harcama tavanları, tavan tükendiğinde asistanın kendini devre dışı bırakmasıyla birlikte. Bu özellik oluşana kadar, yukarıdaki anahtar tek harcama kontrolüdür.",
    "Live status and recent activity": "Canlı durum ve son etkinlik",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "Asistan sağlığı, son konuşma sayıları ve bugüne kadarki harcama — bir bütçe veya hız sınırı sorununun gerçekleştiği anda size haber verecek görünüm.",
    "Not implemented": "Uygulanmadı",
  },
  th: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "เปิดหรือปิดผู้ช่วยสำหรับผู้เยี่ยมชมบนเว็บไซต์สาธารณะของคุณ",
    "Loading AI assistant settings…": "กำลังโหลดการตั้งค่าผู้ช่วย AI…",
    "Visitor's AI Assistant": "ผู้ช่วย AI สำหรับผู้เยี่ยมชม",
    "The assistant your published site offers to readers.": "ผู้ช่วยที่เว็บไซต์ที่เผยแพร่ของคุณมอบให้ผู้อ่าน",
    "Admin AI Assistant": "ผู้ช่วย AI สำหรับผู้ดูแลระบบ",
    "The assistant in this admin, for signed-in administrators.": "ผู้ช่วยในระบบผู้ดูแลนี้ สำหรับผู้ดูแลระบบที่เข้าสู่ระบบแล้ว",
    "Not built yet": "ยังไม่ได้สร้าง",
    "Operator controls that are planned but not implemented.": "การควบคุมของผู้ดำเนินการที่วางแผนไว้แต่ยังไม่ได้ใช้งาน",
    "Enable the AI assistant on the public site. *API Key needed*": "เปิดใช้งานผู้ช่วย AI บนเว็บไซต์สาธารณะ *ต้องมีคีย์ API*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "ผู้เยี่ยมชมสามารถแชทกับผู้ช่วยได้ โดยให้บริการในทุกหน้าสาธารณะ",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "ปิด เว็บไซต์สาธารณะจะไม่มีโค้ดผู้ช่วยใด ๆ และไม่เปิดเผยเอนด์พอยต์ของผู้ช่วยเลย — นี่คือการปิดใช้งานอย่างสมบูรณ์ ไม่ใช่วิดเจ็ตที่ซ่อนอยู่",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "คีย์นี้มีไว้สำหรับผู้เยี่ยมชมของคุณ ไม่ใช่สำหรับคุณ เป็นสิ่งที่ทำให้ผู้ที่อ่านเว็บไซต์ที่เผยแพร่ของคุณสามารถถามคำถามและได้รับคำตอบ คีย์นี้จัดเก็บไว้บนเซิร์ฟเวอร์และใช้สำหรับการสนทนาของผู้เยี่ยมชมทุกครั้ง",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "นี่คือคีย์ที่ต่างจากคีย์ในการตั้งค่า → โหมดการทำงาน → BYOK คีย์นั้นเป็นของคุณเอง จัดเก็บเฉพาะในเบราว์เซอร์นี้เท่านั้น และขับเคลื่อนผู้ช่วยในระบบผู้ดูแลนี้ เว็บไซต์ที่ทำงานจริงจะไม่สามารถใช้คีย์นั้นได้เลย — นี่คือเหตุผลที่การบันทึกคีย์ไว้ที่นั่นไม่เปิดใช้งานแชทของผู้เยี่ยมชม",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      'ไม่ต้องสนใจข้อความ "จัดเก็บโดยโฮสต์นี้เท่านั้น" ด้านล่าง ข้อความนี้เป็นของคอมโพเนนต์ฟอร์มที่ใช้ร่วมกันและถูกต้องบนหน้าจอการตั้งค่า แต่ไม่ใช่ที่นี่ คีย์นี้จะถูกจัดเก็บบนเซิร์ฟเวอร์แบบเข้ารหัส',
    "See more about the visitor key": "ดูข้อมูลเพิ่มเติมเกี่ยวกับคีย์ของผู้เยี่ยมชม",
    "See more": "ดูเพิ่มเติม",
    "See less": "ดูน้อยลง",
    Protocols: "โปรโตคอล",
    Gateways: "เกตเวย์",
    Configured: "กำหนดค่าแล้ว",
    "Not configured": "ยังไม่ได้กำหนดค่า",
    Save: "บันทึก",
    "Saving…": "กำลังบันทึก…",
    "Test Key": "ทดสอบคีย์",
    "Testing…": "กำลังทดสอบ…",
    "Key works — {count} models available.": "คีย์ใช้งานได้ — มีโมเดลที่ใช้ได้ {count} รายการ",
    "Checks the key against the provider and lists the models it can use.":
      "ตรวจสอบคีย์กับผู้ให้บริการและแสดงรายการโมเดลที่ใช้ได้",
    "Asking the provider which models this key allows…": "กำลังสอบถามผู้ให้บริการว่าคีย์นี้อนุญาตให้ใช้โมเดลใดบ้าง…",
    "Saved to the server, encrypted.": "บันทึกลงเซิร์ฟเวอร์แบบเข้ารหัสแล้ว",
    "Not saved yet — press Save.": "ยังไม่ได้บันทึก — กดบันทึก",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "จัดเก็บบนเซิร์ฟเวอร์แบบเข้ารหัส วางคีย์ใหม่เพื่อแทนที่",
    "Paste your key, check it with Show, then press Save.":
      "วางคีย์ของคุณ ตรวจสอบด้วยแสดง แล้วกดบันทึก",
    "Show the AI assistant on the admin site": "แสดงผู้ช่วย AI บนเว็บไซต์ผู้ดูแลระบบ",
    "Open. The assistant panel is showing on the right.": "เปิดอยู่ แผงผู้ช่วยแสดงอยู่ทางด้านขวา",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "เปิดแผงผู้ช่วยในระบบผู้ดูแลนี้ — เช่นเดียวกับปุ่มลอยที่มุมล่างขวา",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "พร้อมใช้งานเสมอสำหรับผู้ดูแลระบบที่เข้าสู่ระบบแล้ว ดังนั้นตัวเลือกนี้จะแสดงหรือซ่อนแผงเท่านั้น ใช้ตัวเลือกนี้หากปุ่มลอยอยู่นอกหน้าจอหรือหายาก",
    "Loading execution settings…": "กำลังโหลดการตั้งค่าการทำงาน…",
    "Detected on the Tovu server, not on your own computer.": "ตรวจพบบนเซิร์ฟเวอร์ Tovu ไม่ใช่บนคอมพิวเตอร์ของคุณเอง",
    "Saved.": "บันทึกแล้ว",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "การควบคุมของผู้ดำเนินการเหล่านี้วางแผนไว้แต่ยังไม่ได้ใช้งาน ยังไม่มีรายการใดด้านล่างนี้ทำงานอยู่ — การเปิดใช้งานผู้ช่วยวันนี้หมายถึงการรันโดยไม่มีเพดานค่าใช้จ่าย ไม่มีการจำกัดอัตราต่อผู้เยี่ยมชม และไม่มีมุมมองกิจกรรมแบบสด",
    "Token / cost budget caps": "เพดานงบประมาณโทเคน/ค่าใช้จ่าย",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "เพดานค่าใช้จ่ายต่อวันและต่อการสนทนา โดยผู้ช่วยจะปิดใช้งานตัวเองเมื่อถึงเพดาน จนกว่าฟีเจอร์นี้จะมี สวิตช์ด้านบนคือการควบคุมค่าใช้จ่ายเพียงอย่างเดียว",
    "Live status and recent activity": "สถานะสดและกิจกรรมล่าสุด",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "สถานะของผู้ช่วย จำนวนการสนทนาล่าสุด และค่าใช้จ่ายจนถึงปัจจุบัน — มุมมองที่จะบอกคุณว่ามีปัญหาด้านงบประมาณหรือการจำกัดอัตรากำลังเกิดขึ้นในขณะที่มันกำลังเกิดขึ้น",
    "Not implemented": "ยังไม่ได้ใช้งาน",
  },
  it: {
    "Turn the visitor-facing assistant on or off for your public site.":
      "Attiva o disattiva l'assistente rivolto ai visitatori per il tuo sito pubblico.",
    "Loading AI assistant settings…": "Caricamento delle impostazioni dell'assistente IA…",
    "Visitor's AI Assistant": "Assistente IA del visitatore",
    "The assistant your published site offers to readers.": "L'assistente che il tuo sito pubblicato offre ai lettori.",
    "Admin AI Assistant": "Assistente IA di amministrazione",
    "The assistant in this admin, for signed-in administrators.": "L'assistente in questa amministrazione, per gli amministratori con accesso effettuato.",
    "Not built yet": "Non ancora realizzato",
    "Operator controls that are planned but not implemented.": "Controlli dell'operatore pianificati ma non implementati.",
    "Enable the AI assistant on the public site. *API Key needed*": "Attiva l'assistente IA sul sito pubblico. *Chiave API necessaria*",
    "Visitors can chat with the assistant. It is served on every public page.":
      "I visitatori possono chattare con l'assistente. Viene fornito su ogni pagina pubblica.",
    "Off. The public site ships no assistant code and exposes no assistant endpoint — this is a full disable, not a hidden widget.":
      "Disattivato. Il sito pubblico non include alcun codice dell'assistente e non espone alcun endpoint dell'assistente — si tratta di una disattivazione completa, non di un widget nascosto.",
    "This key is for your visitors, not for you. It is what lets people reading your published site ask questions and get answers. It is stored on the server and used for every visitor conversation.":
      "Questa chiave è per i tuoi visitatori, non per te. È ciò che consente alle persone che leggono il tuo sito pubblicato di fare domande e ottenere risposte. Viene archiviata sul server e utilizzata per ogni conversazione dei visitatori.",
    "It is a different key from the one under Settings → Execution mode → BYOK. That one is your own, it is saved only in this browser, and it powers the assistant in this admin. A deployed site can never use it — which is why saving a key there does not switch on the visitor chat.":
      "È una chiave diversa da quella in Impostazioni → Modalità di esecuzione → BYOK. Quella è tua, viene salvata solo in questo browser e alimenta l'assistente in questa amministrazione. Un sito distribuito non può mai usarla — per questo salvare una chiave lì non attiva la chat dei visitatori.",
    'Ignore the "Stored only by this host" note below. It belongs to the shared form component and is accurate on the Settings screen, not here. This key will be stored on the server, encrypted.':
      'Ignora la nota "Archiviata solo da questo host" qui sotto. Appartiene al componente del modulo condiviso ed è accurata nella schermata Impostazioni, non qui. Questa chiave verrà archiviata sul server, crittografata.',
    "See more about the visitor key": "Scopri di più sulla chiave del visitatore",
    "See more": "Mostra di più",
    "See less": "Mostra meno",
    Protocols: "Protocolli",
    Gateways: "Gateway",
    Configured: "Configurato",
    "Not configured": "Non configurato",
    Save: "Salva",
    "Saving…": "Salvataggio…",
    "Test Key": "Testa chiave",
    "Testing…": "Test in corso…",
    "Key works — {count} models available.": "La chiave funziona — {count} modelli disponibili.",
    "Checks the key against the provider and lists the models it can use.":
      "Verifica la chiave con il provider ed elenca i modelli che può utilizzare.",
    "Asking the provider which models this key allows…": "Richiesta al provider dei modelli consentiti da questa chiave…",
    "Saved to the server, encrypted.": "Salvata sul server, crittografata.",
    "Not saved yet — press Save.": "Non ancora salvata — premi Salva.",
    "Stored on the server, encrypted. Paste a new key to replace it.":
      "Archiviata sul server, crittografata. Incolla una nuova chiave per sostituirla.",
    "Paste your key, check it with Show, then press Save.":
      "Incolla la tua chiave, verificala con Mostra, quindi premi Salva.",
    "Show the AI assistant on the admin site": "Mostra l'assistente IA sul sito di amministrazione",
    "Open. The assistant panel is showing on the right.": "Aperto. Il pannello dell'assistente viene mostrato a destra.",
    "Opens the assistant panel in this admin — the same thing the floating button in the bottom-right corner does.":
      "Apre il pannello dell'assistente in questa amministrazione — la stessa cosa che fa il pulsante flottante nell'angolo in basso a destra.",
    "Always available to signed-in administrators, so this only shows or hides the panel. Use it if the floating button is ever off-screen or hard to find.":
      "Sempre disponibile per gli amministratori con accesso effettuato, quindi questo mostra o nasconde solo il pannello. Usalo se il pulsante flottante è fuori schermo o difficile da trovare.",
    "Loading execution settings…": "Caricamento delle impostazioni di esecuzione…",
    "Detected on the Tovu server, not on your own computer.": "Rilevato sul server Tovu, non sul tuo computer.",
    "Saved.": "Salvato.",
    "These operator controls are planned but not implemented. Nothing below is active — turning the assistant on today means running it without a cost ceiling, without per-visitor rate limiting, and without a live activity view.":
      "Questi controlli dell'operatore sono pianificati ma non implementati. Nessuno degli elementi seguenti è attivo — attivare oggi l'assistente significa eseguirlo senza un tetto di costo, senza limitazione della frequenza per visitatore e senza una vista dell'attività in tempo reale.",
    "Token / cost budget caps": "Limiti di budget token/costo",
    "Per-day and per-conversation spend ceilings, with the assistant disabling itself when a ceiling is exhausted. Until this exists, the switch above is the only spending control.":
      "Tetti di spesa giornalieri e per conversazione, con l'assistente che si disattiva automaticamente quando un tetto è esaurito. Finché questo non esiste, l'interruttore sopra è l'unico controllo della spesa.",
    "Live status and recent activity": "Stato in tempo reale e attività recente",
    "Assistant health, recent conversation counts, and spend to date — the view that would tell you a budget or rate-limit problem is happening while it is happening.":
      "Stato dell'assistente, numero di conversazioni recenti e spesa fino ad oggi — la vista che ti segnalerebbe un problema di budget o di limitazione della frequenza mentre si sta verificando.",
    "Not implemented": "Non implementato",
  },
};
