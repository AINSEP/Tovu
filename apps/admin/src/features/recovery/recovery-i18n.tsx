import type { ReactNode } from "react";
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

/**
 * @file Spanish translation for the Recovery screen (`/admin/recovery`) — the restore-points
 * list, the discarded-write-window disclosure, and the plan/confirm/execute restore ceremony.
 *
 * Also covers `rules.ts`'s `categoryLabel` (the discarded-write-window category names) — the
 * earlier pass's `.tsx`-only scope left these untranslated (flagged in its handoff report as a
 * follow-up gap, same as `integrations-i18n.tsx`'s row-menu-label note); `rules.ts` imports `t`
 * from here directly. The untaught-category fallback template ("<category> writes") is built
 * directly in `rules.ts` per locale rather than through this dictionary, since Spanish's
 * "escrituras de <category>" reorders the words rather than substituting one.
 */

const RECOVERY_DICT: Record<string, Record<string, string>> = {
  es: {
  "Restore points": "Puntos de restauración",
  "Create restore point": "Crear punto de restauración",
  "Failed to create restore point": "No se pudo crear el punto de restauración",
  "Go to Database": "Ir a Base de datos",
  // rules.ts's categoryLabel — the two currently-known discarded-write-window categories. Reuses
  // this file's own "escrituras de posts/páginas y de tablas de plugins" wording from the
  // disclosure paragraph below rather than inventing new phrasing.
  "posts/pages writes": "escrituras de posts/páginas",
  "plugin-table rows": "filas de tablas de plugins",
  "Unblock (not yet available)": "Desbloquear (aún no disponible)",
  "No unblock route exists yet — see this screen's file header.":
    "Aún no existe una ruta de desbloqueo — consulta el encabezado del archivo de esta pantalla.",
  "No restore points yet.": "Aún no hay puntos de restauración.",
  Trigger: "Origen",
  "Cost class": "Clase de costo",
  "No restore-point mechanism available — see the runbook.": "No hay mecanismo de puntos de restauración disponible — consulta el runbook.",
  "Restore…": "Restaurar…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "Esto cubre únicamente las rutas de escritura marcadas con watermark (hoy, escrituras de posts/páginas y de tablas de plugins) y NO es un recuento completo de todo lo escrito desde este punto de restauración — los change-sets, las escrituras de taxonomía, las entradas de Colecciones y las sesiones aún no se cuentan aquí.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "Entiendo que este recuento es parcial, no exhaustivo, y acepto la ventana de pérdida descrita anteriormente.",
  "Acknowledge the disclosure above to continue.": "Confirma la divulgación anterior para continuar.",
  "Continue to confirm": "Continuar para confirmar",
  "Planning…": "Planificando…",
  "Confirming…": "Confirmando…",
  "Confirm restore": "Confirmar restauración",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "Confirmado. Ejecutar realiza la restauración — esta acción no se puede deshacer.",
  "Restoring…": "Restaurando…",
  "Execute restore": "Ejecutar restauración",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "Se reemplazó el archivo de la base de datos — este proceso del servidor todavía sirve los datos previos a la restauración desde su conexión abierta. Reinicia el servidor ahora para aplicar los datos restaurados.",
  "← Restore points": "← Puntos de restauración",
  "Restore to": "Restaurar a",
  "Restore capability:": "Capacidad de restauración:",
  "Fast restore": "Restauración rápida",
  "Costly restore": "Restauración costosa",
  "Restore unavailable": "Restauración no disponible",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "Los puntos de restauración son instantáneas de archivos ligeras — rápidas y de bajo impacto para capturar o restaurar.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "Los puntos de restauración son volcados completos de la base de datos — capturarlos o restaurarlos toma más tiempo y usa más recursos.",
  Operations: "Operaciones",
  Recovery: "Recuperación",
  "Restore this site to a previous point in time using a captured restore point.":
    "Restaura este sitio a un punto anterior en el tiempo usando un punto de restauración capturado.",
  "Loading restore points…": "Cargando puntos de restauración…",
  "Computing the discarded-write-window disclosure…": "Calculando la divulgación de la ventana de escritura descartada…",
  // Hook-level notice/error strings (use-recovery.hooks.ts, use-restore-flow.hooks.ts) — these
  // never got translated during the JSX-only pass since they live in `.hooks.ts` files.
  "failed to load Recovery": "no se pudo cargar Recuperación",
  "Failed to compute the discarded-write-window disclosure":
    "No se pudo calcular la divulgación de la ventana de escritura descartada",
  "Failed to plan the restore": "No se pudo planificar la restauración",
  "Failed to confirm the restore": "No se pudo confirmar la restauración",
  "Failed to execute the restore": "No se pudo ejecutar la restauración",
  },
  id: {
  "Restore points": "Titik pemulihan",
  "Create restore point": "Buat titik pemulihan",
  "Failed to create restore point": "Gagal membuat titik pemulihan",
  "Go to Database": "Buka Basis Data",
  "posts/pages writes": "penulisan pos/halaman",
  "plugin-table rows": "baris tabel plugin",
  "Unblock (not yet available)": "Buka blokir (belum tersedia)",
  "No unblock route exists yet — see this screen's file header.":
    "Belum ada rute buka blokir — lihat header file layar ini.",
  "No restore points yet.": "Belum ada titik pemulihan.",
  Trigger: "Pemicu",
  "Cost class": "Kelas biaya",
  "No restore-point mechanism available — see the runbook.": "Tidak ada mekanisme titik pemulihan yang tersedia — lihat runbook.",
  "Restore…": "Memulihkan…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "Ini hanya mencakup jalur penulisan yang diberi watermark (saat ini penulisan pos/halaman dan tabel plugin) dan BUKAN jumlah lengkap dari semua yang ditulis sejak titik pemulihan ini — change-set, penulisan taksonomi, entri Koleksi, dan sesi belum dihitung di sini.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "Saya memahami bahwa jumlah ini bersifat parsial, tidak lengkap, dan menerima jendela kehilangan yang dijelaskan di atas.",
  "Acknowledge the disclosure above to continue.": "Setujui pengungkapan di atas untuk melanjutkan.",
  "Continue to confirm": "Lanjutkan untuk mengonfirmasi",
  "Planning…": "Merencanakan…",
  "Confirming…": "Mengonfirmasi…",
  "Confirm restore": "Konfirmasi pemulihan",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "Dikonfirmasi. Menjalankan akan melakukan pemulihan — ini tidak dapat dibatalkan.",
  "Restoring…": "Memulihkan…",
  "Execute restore": "Jalankan pemulihan",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "File basis data telah diganti — proses server ini masih menyajikan data sebelum pemulihan dari koneksi terbukanya. Mulai ulang server sekarang untuk menerapkan data yang dipulihkan.",
  "← Restore points": "← Titik pemulihan",
  "Restore to": "Pulihkan ke",
  "Restore capability:": "Kemampuan pemulihan:",
  "Fast restore": "Pemulihan cepat",
  "Costly restore": "Pemulihan mahal",
  "Restore unavailable": "Pemulihan tidak tersedia",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "Titik pemulihan berupa snapshot file yang ringan — cepat dan berdampak rendah untuk diambil atau dipulihkan.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "Titik pemulihan berupa dump basis data lengkap — pengambilan atau pemulihannya memakan waktu lebih lama dan menggunakan lebih banyak sumber daya.",
  Operations: "Operasi",
  Recovery: "Pemulihan",
  "Restore this site to a previous point in time using a captured restore point.":
    "Pulihkan situs ini ke titik waktu sebelumnya menggunakan titik pemulihan yang telah diambil.",
  "Loading restore points…": "Memuat titik pemulihan…",
  "Computing the discarded-write-window disclosure…": "Menghitung pengungkapan jendela penulisan yang dibuang…",
  "failed to load Recovery": "gagal memuat Pemulihan",
  "Failed to compute the discarded-write-window disclosure":
    "Gagal menghitung pengungkapan jendela penulisan yang dibuang",
  "Failed to plan the restore": "Gagal merencanakan pemulihan",
  "Failed to confirm the restore": "Gagal mengonfirmasi pemulihan",
  "Failed to execute the restore": "Gagal menjalankan pemulihan",
  },
  de: {
  "Restore points": "Wiederherstellungspunkte",
  "Create restore point": "Wiederherstellungspunkt erstellen",
  "Failed to create restore point": "Der Wiederherstellungspunkt konnte nicht erstellt werden",
  "Go to Database": "Zur Datenbank",
  "posts/pages writes": "Schreibvorgänge für Beiträge/Seiten",
  "plugin-table rows": "Zeilen der Plugin-Tabellen",
  "Unblock (not yet available)": "Blockierung aufheben (noch nicht verfügbar)",
  "No unblock route exists yet — see this screen's file header.":
    "Es gibt noch keine Route zum Aufheben der Blockierung — siehe den Datei-Header dieses Bildschirms.",
  "No restore points yet.": "Noch keine Wiederherstellungspunkte.",
  Trigger: "Auslöser",
  "Cost class": "Kostenklasse",
  "No restore-point mechanism available — see the runbook.": "Kein Wiederherstellungspunkt-Mechanismus verfügbar — siehe das Runbook.",
  "Restore…": "Wiederherstellen…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "Dies deckt nur mit Wasserzeichen versehene Schreibpfade ab (heute Beiträge/Seiten und Plugin-Tabellen) und ist KEINE vollständige Zählung von allem, was seit diesem Wiederherstellungspunkt geschrieben wurde — Change-Sets, Taxonomie-Schreibvorgänge, Sammlungseinträge und Sitzungen werden hier noch nicht gezählt.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "Ich verstehe, dass diese Zahl unvollständig, nicht erschöpfend ist, und akzeptiere das oben beschriebene Verlustfenster.",
  "Acknowledge the disclosure above to continue.": "Bestätigen Sie die obige Offenlegung, um fortzufahren.",
  "Continue to confirm": "Weiter zur Bestätigung",
  "Planning…": "Wird geplant…",
  "Confirming…": "Wird bestätigt…",
  "Confirm restore": "Wiederherstellung bestätigen",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "Bestätigt. Die Ausführung führt die Wiederherstellung durch — dies kann nicht rückgängig gemacht werden.",
  "Restoring…": "Wird wiederhergestellt…",
  "Execute restore": "Wiederherstellung ausführen",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "Die Datenbankdatei wurde ersetzt — dieser Serverprozess liefert über seine offene Verbindung weiterhin die Daten von vor der Wiederherstellung. Starten Sie den Server jetzt neu, um die wiederhergestellten Daten zu übernehmen.",
  "← Restore points": "← Wiederherstellungspunkte",
  "Restore to": "Wiederherstellen zu",
  "Restore capability:": "Wiederherstellungsfähigkeit:",
  "Fast restore": "Schnelle Wiederherstellung",
  "Costly restore": "Aufwendige Wiederherstellung",
  "Restore unavailable": "Wiederherstellung nicht verfügbar",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "Wiederherstellungspunkte sind leichte Dateischnappschüsse — schnell und ressourcenschonend zu erfassen oder wiederherzustellen.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "Wiederherstellungspunkte sind vollständige Datenbank-Dumps — das Erfassen oder Wiederherstellen dauert länger und benötigt mehr Ressourcen.",
  Operations: "Betrieb",
  Recovery: "Wiederherstellung",
  "Restore this site to a previous point in time using a captured restore point.":
    "Stellen Sie diese Website mithilfe eines erfassten Wiederherstellungspunkts auf einen früheren Zeitpunkt zurück.",
  "Loading restore points…": "Wiederherstellungspunkte werden geladen…",
  "Computing the discarded-write-window disclosure…": "Die Offenlegung des verworfenen Schreibfensters wird berechnet…",
  "failed to load Recovery": "Wiederherstellung konnte nicht geladen werden",
  "Failed to compute the discarded-write-window disclosure":
    "Die Offenlegung des verworfenen Schreibfensters konnte nicht berechnet werden",
  "Failed to plan the restore": "Die Wiederherstellung konnte nicht geplant werden",
  "Failed to confirm the restore": "Die Wiederherstellung konnte nicht bestätigt werden",
  "Failed to execute the restore": "Die Wiederherstellung konnte nicht ausgeführt werden",
  },
  "zh-CN": {
  "Restore points": "还原点",
  "Create restore point": "创建还原点",
  "Failed to create restore point": "无法创建还原点",
  "Go to Database": "转到数据库",
  "posts/pages writes": "文章/页面写入",
  "plugin-table rows": "插件表行",
  "Unblock (not yet available)": "解除阻止(尚不可用)",
  "No unblock route exists yet — see this screen's file header.":
    "尚无解除阻止的路径 — 请参阅此界面的文件头部说明。",
  "No restore points yet.": "尚无还原点。",
  Trigger: "触发方式",
  "Cost class": "成本级别",
  "No restore-point mechanism available — see the runbook.": "没有可用的还原点机制 — 请参阅运行手册。",
  "Restore…": "还原…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "这仅涵盖带水印标记的写入路径(目前为文章/页面和插件表写入),并不是自该还原点以来所有写入内容的完整统计 — change-set、分类法写入、集合条目和会话目前尚未计入其中。",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "我理解此计数是部分的、并非详尽无遗,并接受上述所描述的丢失窗口。",
  "Acknowledge the disclosure above to continue.": "请确认上述披露内容以继续。",
  "Continue to confirm": "继续以确认",
  "Planning…": "规划中…",
  "Confirming…": "确认中…",
  "Confirm restore": "确认还原",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "已确认。执行将进行还原操作 — 此操作无法撤销。",
  "Restoring…": "还原中…",
  "Execute restore": "执行还原",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "数据库文件已被替换 — 此服务器进程仍通过其打开的连接提供还原前的数据。请立即重启服务器以使用已还原的数据。",
  "← Restore points": "← 还原点",
  "Restore to": "还原到",
  "Restore capability:": "还原能力:",
  "Fast restore": "快速还原",
  "Costly restore": "高成本还原",
  "Restore unavailable": "还原不可用",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "还原点是轻量级的文件快照 — 捕获或还原都很快,资源占用低。",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "还原点是完整的数据库转储 — 捕获或还原所需时间更长,占用更多资源。",
  Operations: "运维",
  Recovery: "恢复",
  "Restore this site to a previous point in time using a captured restore point.":
    "使用已捕获的还原点将此站点还原到先前的时间点。",
  "Loading restore points…": "正在加载还原点…",
  "Computing the discarded-write-window disclosure…": "正在计算已丢弃写入窗口的披露信息…",
  "failed to load Recovery": "无法加载恢复",
  "Failed to compute the discarded-write-window disclosure":
    "无法计算已丢弃写入窗口的披露信息",
  "Failed to plan the restore": "无法规划还原",
  "Failed to confirm the restore": "无法确认还原",
  "Failed to execute the restore": "无法执行还原",
  },
  "zh-TW": {
  "Restore points": "還原點",
  "Create restore point": "建立還原點",
  "Failed to create restore point": "無法建立還原點",
  "Go to Database": "前往資料庫",
  "posts/pages writes": "文章/頁面寫入",
  "plugin-table rows": "外掛資料表資料列",
  "Unblock (not yet available)": "解除封鎖(尚不可用)",
  "No unblock route exists yet — see this screen's file header.":
    "目前尚無解除封鎖的路徑 — 請參閱此畫面的檔案標頭說明。",
  "No restore points yet.": "尚無還原點。",
  Trigger: "觸發方式",
  "Cost class": "成本等級",
  "No restore-point mechanism available — see the runbook.": "沒有可用的還原點機制 — 請參閱操作手冊。",
  "Restore…": "還原…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "這僅涵蓋加上浮水印標記的寫入路徑(目前為文章/頁面及外掛資料表寫入),並非自此還原點以來所有寫入內容的完整計數 — change-set、分類法寫入、Collections 項目及工作階段目前尚未計入。",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "我了解此計數為部分數據、並非詳盡無遺,並接受上述所描述的遺失範圍。",
  "Acknowledge the disclosure above to continue.": "請確認上方揭露內容以繼續。",
  "Continue to confirm": "繼續以確認",
  "Planning…": "規劃中…",
  "Confirming…": "確認中…",
  "Confirm restore": "確認還原",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "已確認。執行將進行還原作業 — 此操作無法復原。",
  "Restoring…": "還原中…",
  "Execute restore": "執行還原",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "資料庫檔案已被取代 — 此伺服器處理程序仍透過其開啟的連線提供還原前的資料。請立即重新啟動伺服器以套用還原後的資料。",
  "← Restore points": "← 還原點",
  "Restore to": "還原至",
  "Restore capability:": "還原能力:",
  "Fast restore": "快速還原",
  "Costly restore": "高成本還原",
  "Restore unavailable": "還原不可用",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "還原點是輕量級的檔案快照 — 擷取或還原都很快,資源佔用低。",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "還原點是完整的資料庫傾印 — 擷取或還原所需時間較長,佔用較多資源。",
  Operations: "維運",
  Recovery: "復原",
  "Restore this site to a previous point in time using a captured restore point.":
    "使用擷取的還原點將此網站還原至先前的時間點。",
  "Loading restore points…": "正在載入還原點…",
  "Computing the discarded-write-window disclosure…": "正在計算已捨棄寫入視窗的揭露資訊…",
  "failed to load Recovery": "無法載入復原",
  "Failed to compute the discarded-write-window disclosure":
    "無法計算已捨棄寫入視窗的揭露資訊",
  "Failed to plan the restore": "無法規劃還原",
  "Failed to confirm the restore": "無法確認還原",
  "Failed to execute the restore": "無法執行還原",
  },
  "pt-BR": {
  "Restore points": "Pontos de restauração",
  "Create restore point": "Criar ponto de restauração",
  "Failed to create restore point": "Falha ao criar o ponto de restauração",
  "Go to Database": "Ir para Banco de dados",
  "posts/pages writes": "gravações de posts/páginas",
  "plugin-table rows": "linhas de tabelas de plugins",
  "Unblock (not yet available)": "Desbloquear (ainda não disponível)",
  "No unblock route exists yet — see this screen's file header.":
    "Ainda não existe uma rota de desbloqueio — consulte o cabeçalho do arquivo desta tela.",
  "No restore points yet.": "Ainda não há pontos de restauração.",
  Trigger: "Origem",
  "Cost class": "Classe de custo",
  "No restore-point mechanism available — see the runbook.": "Nenhum mecanismo de ponto de restauração disponível — consulte o runbook.",
  "Restore…": "Restaurar…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "Isso cobre apenas os caminhos de gravação marcados com watermark (hoje, gravações de posts/páginas e de tabelas de plugins) e NÃO é uma contagem completa de tudo o que foi gravado desde este ponto de restauração — change-sets, gravações de taxonomia, entradas de Coleções e sessões ainda não são contabilizados aqui.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "Entendo que essa contagem é parcial, não exaustiva, e aceito a janela de perda descrita acima.",
  "Acknowledge the disclosure above to continue.": "Confirme a divulgação acima para continuar.",
  "Continue to confirm": "Continuar para confirmar",
  "Planning…": "Planejando…",
  "Confirming…": "Confirmando…",
  "Confirm restore": "Confirmar restauração",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "Confirmado. Executar realiza a restauração — esta ação não pode ser desfeita.",
  "Restoring…": "Restaurando…",
  "Execute restore": "Executar restauração",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "O arquivo do banco de dados foi substituído — este processo do servidor ainda está servindo os dados anteriores à restauração a partir de sua conexão aberta. Reinicie o servidor agora para aplicar os dados restaurados.",
  "← Restore points": "← Pontos de restauração",
  "Restore to": "Restaurar para",
  "Restore capability:": "Capacidade de restauração:",
  "Fast restore": "Restauração rápida",
  "Costly restore": "Restauração custosa",
  "Restore unavailable": "Restauração indisponível",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "Os pontos de restauração são snapshots de arquivo leves — rápidos e de baixo impacto para capturar ou restaurar.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "Os pontos de restauração são despejos completos do banco de dados — capturá-los ou restaurá-los demora mais e usa mais recursos.",
  Operations: "Operações",
  Recovery: "Recuperação",
  "Restore this site to a previous point in time using a captured restore point.":
    "Restaure este site para um ponto anterior no tempo usando um ponto de restauração capturado.",
  "Loading restore points…": "Carregando pontos de restauração…",
  "Computing the discarded-write-window disclosure…": "Calculando a divulgação da janela de gravação descartada…",
  "failed to load Recovery": "falha ao carregar Recuperação",
  "Failed to compute the discarded-write-window disclosure":
    "Falha ao calcular a divulgação da janela de gravação descartada",
  "Failed to plan the restore": "Falha ao planejar a restauração",
  "Failed to confirm the restore": "Falha ao confirmar a restauração",
  "Failed to execute the restore": "Falha ao executar a restauração",
  },
  ru: {
  "Restore points": "Точки восстановления",
  "Create restore point": "Создать точку восстановления",
  "Failed to create restore point": "Не удалось создать точку восстановления",
  "Go to Database": "Перейти в раздел «База данных»",
  "posts/pages writes": "записи постов/страниц",
  "plugin-table rows": "строки таблиц плагинов",
  "Unblock (not yet available)": "Разблокировать (пока недоступно)",
  "No unblock route exists yet — see this screen's file header.":
    "Маршрут разблокировки пока не существует — см. заголовок файла этого экрана.",
  "No restore points yet.": "Пока нет точек восстановления.",
  Trigger: "Источник",
  "Cost class": "Класс стоимости",
  "No restore-point mechanism available — see the runbook.": "Механизм точек восстановления недоступен — см. руководство.",
  "Restore…": "Восстановить…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "Это охватывает только пути записи, помеченные водяным знаком (сегодня — записи постов/страниц и таблиц плагинов), и НЕ является полным подсчётом всего, что было записано с момента этой точки восстановления — наборы изменений, записи таксономии, записи Коллекций и сессии здесь пока не учитываются.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "Я понимаю, что этот подсчёт является частичным, не исчерпывающим, и принимаю описанное выше окно потерь.",
  "Acknowledge the disclosure above to continue.": "Подтвердите приведённое выше раскрытие информации, чтобы продолжить.",
  "Continue to confirm": "Продолжить к подтверждению",
  "Planning…": "Планирование…",
  "Confirming…": "Подтверждение…",
  "Confirm restore": "Подтвердить восстановление",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "Подтверждено. Выполнение произведёт восстановление — это действие нельзя отменить.",
  "Restoring…": "Восстановление…",
  "Execute restore": "Выполнить восстановление",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "Файл базы данных был заменён — этот серверный процесс всё ещё обслуживает данные до восстановления через своё открытое соединение. Перезапустите сервер сейчас, чтобы применить восстановленные данные.",
  "← Restore points": "← Точки восстановления",
  "Restore to": "Восстановить до",
  "Restore capability:": "Возможность восстановления:",
  "Fast restore": "Быстрое восстановление",
  "Costly restore": "Затратное восстановление",
  "Restore unavailable": "Восстановление недоступно",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "Точки восстановления — это лёгкие файловые снимки: их создание и восстановление происходит быстро и с минимальной нагрузкой.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "Точки восстановления — это полные дампы базы данных: их создание и восстановление занимает больше времени и требует больше ресурсов.",
  Operations: "Эксплуатация",
  Recovery: "Восстановление",
  "Restore this site to a previous point in time using a captured restore point.":
    "Восстановите этот сайт до предыдущего момента времени с помощью сохранённой точки восстановления.",
  "Loading restore points…": "Загрузка точек восстановления…",
  "Computing the discarded-write-window disclosure…": "Вычисление раскрытия информации об окне отброшенных записей…",
  "failed to load Recovery": "не удалось загрузить раздел «Восстановление»",
  "Failed to compute the discarded-write-window disclosure":
    "Не удалось вычислить раскрытие информации об окне отброшенных записей",
  "Failed to plan the restore": "Не удалось запланировать восстановление",
  "Failed to confirm the restore": "Не удалось подтвердить восстановление",
  "Failed to execute the restore": "Не удалось выполнить восстановление",
  },
  fa: {
  "Restore points": "نقاط بازیابی",
  "Create restore point": "ایجاد نقطه بازیابی",
  "Failed to create restore point": "ایجاد نقطه بازیابی ناموفق بود",
  "Go to Database": "رفتن به پایگاه داده",
  "posts/pages writes": "نوشتن‌های پست‌ها/صفحات",
  "plugin-table rows": "ردیف‌های جدول افزونه‌ها",
  "Unblock (not yet available)": "رفع مسدودیت (هنوز در دسترس نیست)",
  "No unblock route exists yet — see this screen's file header.":
    "هنوز مسیری برای رفع مسدودیت وجود ندارد — به سربرگ فایل این صفحه مراجعه کنید.",
  "No restore points yet.": "هنوز نقطه بازیابی‌ای وجود ندارد.",
  Trigger: "محرک",
  "Cost class": "رده هزینه",
  "No restore-point mechanism available — see the runbook.": "هیچ مکانیزم نقطه بازیابی در دسترس نیست — به کتابچه راهنما مراجعه کنید.",
  "Restore…": "بازیابی…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "این فقط مسیرهای نوشتن دارای واترمارک (امروزه نوشتن پست‌ها/صفحات و جداول افزونه) را پوشش می‌دهد و شمارش کاملی از هر آنچه از این نقطه بازیابی نوشته شده نیست — change-setها، نوشتن‌های taxonomy، ورودی‌های Collections و نشست‌ها هنوز اینجا شمارش نمی‌شوند.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "می‌دانم که این شمارش جزئی است، نه کامل، و پنجره از دست‌رفتن توضیح‌داده‌شده در بالا را می‌پذیرم.",
  "Acknowledge the disclosure above to continue.": "برای ادامه، افشای بالا را تأیید کنید.",
  "Continue to confirm": "ادامه برای تأیید",
  "Planning…": "در حال برنامه‌ریزی…",
  "Confirming…": "در حال تأیید…",
  "Confirm restore": "تأیید بازیابی",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "تأیید شد. اجرا، بازیابی را انجام می‌دهد — این کار قابل بازگشت نیست.",
  "Restoring…": "در حال بازیابی…",
  "Execute restore": "اجرای بازیابی",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "فایل پایگاه داده جایگزین شد — این فرآیند سرور همچنان داده‌های پیش از بازیابی را از اتصال بازِ خود ارائه می‌دهد. اکنون سرور را دوباره راه‌اندازی کنید تا داده‌های بازیابی‌شده اعمال شود.",
  "← Restore points": "← نقاط بازیابی",
  "Restore to": "بازیابی به",
  "Restore capability:": "قابلیت بازیابی:",
  "Fast restore": "بازیابی سریع",
  "Costly restore": "بازیابی پرهزینه",
  "Restore unavailable": "بازیابی در دسترس نیست",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "نقاط بازیابی، تصاویر لحظه‌ای سبک از فایل هستند — گرفتن یا بازیابی آن‌ها سریع و کم‌هزینه است.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "نقاط بازیابی، خروجی کامل پایگاه داده هستند — گرفتن یا بازیابی آن‌ها زمان بیشتری می‌برد و منابع بیشتری مصرف می‌کند.",
  Operations: "عملیات",
  Recovery: "بازیابی",
  "Restore this site to a previous point in time using a captured restore point.":
    "این سایت را با استفاده از یک نقطه بازیابی ثبت‌شده به نقطه‌ای پیشین در زمان بازگردانید.",
  "Loading restore points…": "در حال بارگذاری نقاط بازیابی…",
  "Computing the discarded-write-window disclosure…": "در حال محاسبه افشای پنجره نوشتن دورریخته‌شده…",
  "failed to load Recovery": "بارگذاری بازیابی ناموفق بود",
  "Failed to compute the discarded-write-window disclosure":
    "محاسبه افشای پنجره نوشتن دورریخته‌شده ناموفق بود",
  "Failed to plan the restore": "برنامه‌ریزی بازیابی ناموفق بود",
  "Failed to confirm the restore": "تأیید بازیابی ناموفق بود",
  "Failed to execute the restore": "اجرای بازیابی ناموفق بود",
  },
  ar: {
  "Restore points": "نقاط الاستعادة",
  "Create restore point": "إنشاء نقطة استعادة",
  "Failed to create restore point": "تعذّر إنشاء نقطة الاستعادة",
  "Go to Database": "الانتقال إلى قاعدة البيانات",
  "posts/pages writes": "عمليات كتابة المقالات/الصفحات",
  "plugin-table rows": "صفوف جداول الإضافات",
  "Unblock (not yet available)": "إلغاء الحظر (غير متاح بعد)",
  "No unblock route exists yet — see this screen's file header.":
    "لا يوجد مسار لإلغاء الحظر بعد — راجع رأس ملف هذه الشاشة.",
  "No restore points yet.": "لا توجد نقاط استعادة بعد.",
  Trigger: "المُحفِّز",
  "Cost class": "فئة التكلفة",
  "No restore-point mechanism available — see the runbook.": "لا تتوفر آلية نقاط استعادة — راجع دليل التشغيل.",
  "Restore…": "استعادة…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "يغطي هذا مسارات الكتابة الموسومة بعلامة مائية فقط (اليوم: كتابة المقالات/الصفحات وجداول الإضافات) وليس عدًّا كاملاً لكل ما تمت كتابته منذ نقطة الاستعادة هذه — لم يتم بعد احتساب change-sets، وكتابات التصنيف، وإدخالات المجموعات، والجلسات هنا.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "أدرك أن هذا العدد جزئي وليس شاملاً، وأقبل نافذة الفقدان الموضحة أعلاه.",
  "Acknowledge the disclosure above to continue.": "أقرّ بالإفصاح أعلاه للمتابعة.",
  "Continue to confirm": "المتابعة للتأكيد",
  "Planning…": "جارٍ التخطيط…",
  "Confirming…": "جارٍ التأكيد…",
  "Confirm restore": "تأكيد الاستعادة",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "تم التأكيد. سيؤدي التنفيذ إلى تنفيذ الاستعادة — لا يمكن التراجع عن هذا الإجراء.",
  "Restoring…": "جارٍ الاستعادة…",
  "Execute restore": "تنفيذ الاستعادة",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "تم استبدال ملف قاعدة البيانات — لا تزال عملية الخادم هذه تخدم البيانات السابقة للاستعادة من اتصالها المفتوح. أعد تشغيل الخادم الآن لاعتماد البيانات المستعادة.",
  "← Restore points": "← نقاط الاستعادة",
  "Restore to": "الاستعادة إلى",
  "Restore capability:": "إمكانية الاستعادة:",
  "Fast restore": "استعادة سريعة",
  "Costly restore": "استعادة مكلفة",
  "Restore unavailable": "الاستعادة غير متاحة",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "نقاط الاستعادة هي لقطات ملفات خفيفة — التقاطها أو الاستعادة منها سريع ومنخفض التأثير.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "نقاط الاستعادة هي نسخ كاملة لقاعدة البيانات — يستغرق التقاطها أو الاستعادة منها وقتًا أطول ويستهلك موارد أكثر.",
  Operations: "العمليات",
  Recovery: "الاسترداد",
  "Restore this site to a previous point in time using a captured restore point.":
    "استعد هذا الموقع إلى نقطة زمنية سابقة باستخدام نقطة استعادة تم التقاطها.",
  "Loading restore points…": "جارٍ تحميل نقاط الاستعادة…",
  "Computing the discarded-write-window disclosure…": "جارٍ حساب إفصاح نافذة الكتابة المُهمَلة…",
  "failed to load Recovery": "تعذّر تحميل الاسترداد",
  "Failed to compute the discarded-write-window disclosure":
    "تعذّر حساب إفصاح نافذة الكتابة المُهمَلة",
  "Failed to plan the restore": "تعذّر تخطيط الاستعادة",
  "Failed to confirm the restore": "تعذّر تأكيد الاستعادة",
  "Failed to execute the restore": "تعذّر تنفيذ الاستعادة",
  },
  ja: {
  "Restore points": "復元ポイント",
  "Create restore point": "復元ポイントを作成",
  "Failed to create restore point": "復元ポイントの作成に失敗しました",
  "Go to Database": "データベースへ移動",
  "posts/pages writes": "投稿/固定ページの書き込み",
  "plugin-table rows": "プラグインテーブルの行",
  "Unblock (not yet available)": "ブロック解除(まだ利用できません)",
  "No unblock route exists yet — see this screen's file header.":
    "ブロック解除のルートはまだ存在しません — この画面のファイルヘッダーを参照してください。",
  "No restore points yet.": "復元ポイントはまだありません。",
  Trigger: "トリガー",
  "Cost class": "コストクラス",
  "No restore-point mechanism available — see the runbook.": "利用可能な復元ポイントの仕組みがありません — ランブックを参照してください。",
  "Restore…": "復元…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "これは透かしが付いた書き込みパス(現在は投稿/固定ページとプラグインテーブルの書き込み)のみを対象としており、この復元ポイント以降に書き込まれたすべての完全な件数ではありません — change-set、タクソノミーの書き込み、コレクションのエントリ、セッションはまだここに含まれていません。",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "この件数が部分的なものであり、網羅的ではないことを理解し、上記で説明された損失範囲を了承します。",
  "Acknowledge the disclosure above to continue.": "続行するには上記の開示内容を確認してください。",
  "Continue to confirm": "確認へ進む",
  "Planning…": "計画中…",
  "Confirming…": "確認中…",
  "Confirm restore": "復元を確認",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "確認済みです。実行すると復元が行われます — これは元に戻せません。",
  "Restoring…": "復元中…",
  "Execute restore": "復元を実行",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "データベースファイルが置き換えられました — このサーバープロセスは、開いている接続から復元前のデータを引き続き提供しています。復元されたデータを反映するには、今すぐサーバーを再起動してください。",
  "← Restore points": "← 復元ポイント",
  "Restore to": "復元先",
  "Restore capability:": "復元機能:",
  "Fast restore": "高速復元",
  "Costly restore": "コストの高い復元",
  "Restore unavailable": "復元不可",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "復元ポイントは軽量なファイルスナップショットです — 取得や復元は高速で負荷も低くなります。",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "復元ポイントはデータベースの完全なダンプです — 取得や復元により時間がかかり、より多くのリソースを使用します。",
  Operations: "運用",
  Recovery: "復旧",
  "Restore this site to a previous point in time using a captured restore point.":
    "取得済みの復元ポイントを使用して、このサイトを以前の時点に復元します。",
  "Loading restore points…": "復元ポイントを読み込み中…",
  "Computing the discarded-write-window disclosure…": "破棄された書き込みウィンドウの開示情報を計算中…",
  "failed to load Recovery": "復旧の読み込みに失敗しました",
  "Failed to compute the discarded-write-window disclosure":
    "破棄された書き込みウィンドウの開示情報の計算に失敗しました",
  "Failed to plan the restore": "復元の計画に失敗しました",
  "Failed to confirm the restore": "復元の確認に失敗しました",
  "Failed to execute the restore": "復元の実行に失敗しました",
  },
  ko: {
  "Restore points": "복원 지점",
  "Create restore point": "복원 지점 만들기",
  "Failed to create restore point": "복원 지점을 만들지 못했습니다",
  "Go to Database": "데이터베이스로 이동",
  "posts/pages writes": "게시물/페이지 쓰기",
  "plugin-table rows": "플러그인 테이블 행",
  "Unblock (not yet available)": "차단 해제(아직 사용 불가)",
  "No unblock route exists yet — see this screen's file header.":
    "아직 차단 해제 경로가 없습니다 — 이 화면의 파일 헤더를 참조하세요.",
  "No restore points yet.": "아직 복원 지점이 없습니다.",
  Trigger: "트리거",
  "Cost class": "비용 등급",
  "No restore-point mechanism available — see the runbook.": "사용 가능한 복원 지점 메커니즘이 없습니다 — 런북을 참조하세요.",
  "Restore…": "복원…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "이는 워터마크가 표시된 쓰기 경로(현재는 게시물/페이지 및 플러그인 테이블 쓰기)만 다루며, 이 복원 지점 이후에 기록된 모든 것의 완전한 집계가 아닙니다 — change-set, 분류체계 쓰기, 컬렉션 항목, 세션은 아직 여기에 집계되지 않습니다.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "이 수치가 부분적이며 완전하지 않다는 것을 이해하고, 위에서 설명한 손실 구간을 수용합니다.",
  "Acknowledge the disclosure above to continue.": "계속하려면 위 공개 내용을 확인하세요.",
  "Continue to confirm": "계속하여 확인",
  "Planning…": "계획 중…",
  "Confirming…": "확인 중…",
  "Confirm restore": "복원 확인",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "확인되었습니다. 실행하면 복원이 수행됩니다 — 이 작업은 되돌릴 수 없습니다.",
  "Restoring…": "복원 중…",
  "Execute restore": "복원 실행",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "데이터베이스 파일이 교체되었습니다 — 이 서버 프로세스는 열려 있는 연결을 통해 복원 이전 데이터를 계속 제공하고 있습니다. 복원된 데이터를 적용하려면 지금 서버를 다시 시작하세요.",
  "← Restore points": "← 복원 지점",
  "Restore to": "복원 대상",
  "Restore capability:": "복원 기능:",
  "Fast restore": "빠른 복원",
  "Costly restore": "비용이 큰 복원",
  "Restore unavailable": "복원 불가",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "복원 지점은 가벼운 파일 스냅샷입니다 — 캡처하거나 복원하는 데 빠르고 부담이 적습니다.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "복원 지점은 전체 데이터베이스 덤프입니다 — 캡처하거나 복원하는 데 시간이 더 걸리고 더 많은 리소스를 사용합니다.",
  Operations: "운영",
  Recovery: "복구",
  "Restore this site to a previous point in time using a captured restore point.":
    "캡처된 복원 지점을 사용하여 이 사이트를 이전 시점으로 복원합니다.",
  "Loading restore points…": "복원 지점 로드 중…",
  "Computing the discarded-write-window disclosure…": "폐기된 쓰기 구간 공개 정보를 계산하는 중…",
  "failed to load Recovery": "복구를 로드하지 못했습니다",
  "Failed to compute the discarded-write-window disclosure":
    "폐기된 쓰기 구간 공개 정보를 계산하지 못했습니다",
  "Failed to plan the restore": "복원을 계획하지 못했습니다",
  "Failed to confirm the restore": "복원을 확인하지 못했습니다",
  "Failed to execute the restore": "복원을 실행하지 못했습니다",
  },
  pl: {
  "Restore points": "Punkty przywracania",
  "Create restore point": "Utwórz punkt przywracania",
  "Failed to create restore point": "Nie udało się utworzyć punktu przywracania",
  "Go to Database": "Przejdź do Bazy danych",
  "posts/pages writes": "zapisy postów/stron",
  "plugin-table rows": "wiersze tabel wtyczek",
  "Unblock (not yet available)": "Odblokuj (jeszcze niedostępne)",
  "No unblock route exists yet — see this screen's file header.":
    "Nie istnieje jeszcze ścieżka odblokowania — zobacz nagłówek pliku tego ekranu.",
  "No restore points yet.": "Brak punktów przywracania.",
  Trigger: "Wyzwalacz",
  "Cost class": "Klasa kosztów",
  "No restore-point mechanism available — see the runbook.": "Brak dostępnego mechanizmu punktów przywracania — zobacz podręcznik operacyjny.",
  "Restore…": "Przywróć…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "Obejmuje to wyłącznie ścieżki zapisu oznaczone znakiem wodnym (obecnie zapisy postów/stron oraz tabel wtyczek) i NIE jest pełnym zliczeniem wszystkiego, co zapisano od tego punktu przywracania — zestawy zmian, zapisy taksonomii, wpisy Kolekcji i sesje nie są tu jeszcze liczone.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "Rozumiem, że ta liczba jest częściowa, niewyczerpująca, i akceptuję opisane powyżej okno utraty danych.",
  "Acknowledge the disclosure above to continue.": "Potwierdź powyższe ujawnienie, aby kontynuować.",
  "Continue to confirm": "Przejdź do potwierdzenia",
  "Planning…": "Planowanie…",
  "Confirming…": "Potwierdzanie…",
  "Confirm restore": "Potwierdź przywracanie",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "Potwierdzono. Wykonanie przeprowadzi przywracanie — tej operacji nie można cofnąć.",
  "Restoring…": "Przywracanie…",
  "Execute restore": "Wykonaj przywracanie",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "Plik bazy danych został zastąpiony — ten proces serwera nadal udostępnia dane sprzed przywrócenia z otwartego połączenia. Uruchom ponownie serwer teraz, aby zastosować przywrócone dane.",
  "← Restore points": "← Punkty przywracania",
  "Restore to": "Przywróć do",
  "Restore capability:": "Możliwość przywracania:",
  "Fast restore": "Szybkie przywracanie",
  "Costly restore": "Kosztowne przywracanie",
  "Restore unavailable": "Przywracanie niedostępne",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "Punkty przywracania to lekkie migawki plików — ich przechwytywanie i przywracanie jest szybkie i mało obciążające.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "Punkty przywracania to pełne zrzuty bazy danych — ich przechwytywanie i przywracanie trwa dłużej i zużywa więcej zasobów.",
  Operations: "Operacje",
  Recovery: "Odzyskiwanie",
  "Restore this site to a previous point in time using a captured restore point.":
    "Przywróć tę witrynę do wcześniejszego punktu w czasie za pomocą zarejestrowanego punktu przywracania.",
  "Loading restore points…": "Wczytywanie punktów przywracania…",
  "Computing the discarded-write-window disclosure…": "Obliczanie ujawnienia okna odrzuconych zapisów…",
  "failed to load Recovery": "nie udało się wczytać Odzyskiwania",
  "Failed to compute the discarded-write-window disclosure":
    "Nie udało się obliczyć ujawnienia okna odrzuconych zapisów",
  "Failed to plan the restore": "Nie udało się zaplanować przywracania",
  "Failed to confirm the restore": "Nie udało się potwierdzić przywracania",
  "Failed to execute the restore": "Nie udało się wykonać przywracania",
  },
  hu: {
  "Restore points": "Visszaállítási pontok",
  "Create restore point": "Visszaállítási pont létrehozása",
  "Failed to create restore point": "Nem sikerült létrehozni a visszaállítási pontot",
  "Go to Database": "Ugrás az Adatbázishoz",
  "posts/pages writes": "bejegyzés-/oldalírások",
  "plugin-table rows": "bővítménytábla-sorok",
  "Unblock (not yet available)": "Feloldás (még nem érhető el)",
  "No unblock route exists yet — see this screen's file header.":
    "Még nincs feloldási útvonal — lásd ennek a képernyőnek a fájlfejlécét.",
  "No restore points yet.": "Még nincsenek visszaállítási pontok.",
  Trigger: "Kiváltó",
  "Cost class": "Költségosztály",
  "No restore-point mechanism available — see the runbook.": "Nem érhető el visszaállításipont-mechanizmus — lásd a futtatási kézikönyvet.",
  "Restore…": "Visszaállítás…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "Ez csak a vízjellel ellátott írási útvonalakra terjed ki (jelenleg a bejegyzés-/oldalírásokra és a bővítménytábla-írásokra), és NEM a visszaállítási pont óta írt minden adat teljes száma — a change-setek, a taxonómiaírások, a Gyűjtemények bejegyzései és a munkamenetek itt még nincsenek beleszámítva.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "Megértem, hogy ez a szám részleges, nem teljes körű, és elfogadom a fent leírt veszteségi ablakot.",
  "Acknowledge the disclosure above to continue.": "A folytatáshoz erősítse meg a fenti közzétételt.",
  "Continue to confirm": "Tovább a megerősítéshez",
  "Planning…": "Tervezés…",
  "Confirming…": "Megerősítés…",
  "Confirm restore": "Visszaállítás megerősítése",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "Megerősítve. A végrehajtás elvégzi a visszaállítást — ez nem vonható vissza.",
  "Restoring…": "Visszaállítás folyamatban…",
  "Execute restore": "Visszaállítás végrehajtása",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "Az adatbázisfájl lecserélődött — ez a szerverfolyamat még mindig a visszaállítás előtti adatokat szolgálja ki a nyitott kapcsolatából. Indítsa újra a szervert most, hogy a visszaállított adatok érvénybe lépjenek.",
  "← Restore points": "← Visszaállítási pontok",
  "Restore to": "Visszaállítás ide",
  "Restore capability:": "Visszaállítási képesség:",
  "Fast restore": "Gyors visszaállítás",
  "Costly restore": "Költséges visszaállítás",
  "Restore unavailable": "A visszaállítás nem érhető el",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "A visszaállítási pontok könnyű fájl-pillanatképek — rögzítésük vagy visszaállításuk gyors és kis terhelésű.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "A visszaállítási pontok teljes adatbázis-mentések — rögzítésük vagy visszaállításuk tovább tart, és több erőforrást igényel.",
  Operations: "Üzemeltetés",
  Recovery: "Helyreállítás",
  "Restore this site to a previous point in time using a captured restore point.":
    "Állítsa vissza ezt a webhelyet egy korábbi időpontra egy rögzített visszaállítási pont segítségével.",
  "Loading restore points…": "Visszaállítási pontok betöltése…",
  "Computing the discarded-write-window disclosure…": "Az eldobott írási ablak közzétételének kiszámítása…",
  "failed to load Recovery": "nem sikerült betölteni a Helyreállítást",
  "Failed to compute the discarded-write-window disclosure":
    "Nem sikerült kiszámítani az eldobott írási ablak közzétételét",
  "Failed to plan the restore": "Nem sikerült megtervezni a visszaállítást",
  "Failed to confirm the restore": "Nem sikerült megerősíteni a visszaállítást",
  "Failed to execute the restore": "Nem sikerült végrehajtani a visszaállítást",
  },
  fr: {
  "Restore points": "Points de restauration",
  "Create restore point": "Créer un point de restauration",
  "Failed to create restore point": "Échec de la création du point de restauration",
  "Go to Database": "Aller à Base de données",
  "posts/pages writes": "écritures d'articles/pages",
  "plugin-table rows": "lignes des tables d'extensions",
  "Unblock (not yet available)": "Débloquer (pas encore disponible)",
  "No unblock route exists yet — see this screen's file header.":
    "Aucune route de déblocage n'existe encore — voir l'en-tête du fichier de cet écran.",
  "No restore points yet.": "Aucun point de restauration pour le moment.",
  Trigger: "Origine",
  "Cost class": "Classe de coût",
  "No restore-point mechanism available — see the runbook.": "Aucun mécanisme de point de restauration disponible — voir le runbook.",
  "Restore…": "Restaurer…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "Cela ne couvre que les chemins d'écriture marqués d'un filigrane (aujourd'hui, les écritures d'articles/pages et de tables d'extensions) et n'est PAS un décompte complet de tout ce qui a été écrit depuis ce point de restauration — les ensembles de modifications, les écritures de taxonomie, les entrées de Collections et les sessions ne sont pas encore comptabilisées ici.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "Je comprends que ce décompte est partiel, non exhaustif, et j'accepte la fenêtre de perte décrite ci-dessus.",
  "Acknowledge the disclosure above to continue.": "Confirmez la divulgation ci-dessus pour continuer.",
  "Continue to confirm": "Continuer vers la confirmation",
  "Planning…": "Planification…",
  "Confirming…": "Confirmation…",
  "Confirm restore": "Confirmer la restauration",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "Confirmé. L'exécution effectue la restauration — cette action est irréversible.",
  "Restoring…": "Restauration en cours…",
  "Execute restore": "Exécuter la restauration",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "Le fichier de base de données a été remplacé — ce processus serveur sert encore les données antérieures à la restauration depuis sa connexion ouverte. Redémarrez le serveur maintenant pour appliquer les données restaurées.",
  "← Restore points": "← Points de restauration",
  "Restore to": "Restaurer vers",
  "Restore capability:": "Capacité de restauration :",
  "Fast restore": "Restauration rapide",
  "Costly restore": "Restauration coûteuse",
  "Restore unavailable": "Restauration indisponible",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "Les points de restauration sont des instantanés de fichiers légers — rapides et peu coûteux à capturer ou à restaurer.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "Les points de restauration sont des sauvegardes complètes de la base de données — leur capture ou leur restauration prend plus de temps et consomme plus de ressources.",
  Operations: "Opérations",
  Recovery: "Récupération",
  "Restore this site to a previous point in time using a captured restore point.":
    "Restaurez ce site à un point antérieur dans le temps à l'aide d'un point de restauration capturé.",
  "Loading restore points…": "Chargement des points de restauration…",
  "Computing the discarded-write-window disclosure…": "Calcul de la divulgation de la fenêtre d'écriture ignorée…",
  "failed to load Recovery": "échec du chargement de Récupération",
  "Failed to compute the discarded-write-window disclosure":
    "Échec du calcul de la divulgation de la fenêtre d'écriture ignorée",
  "Failed to plan the restore": "Échec de la planification de la restauration",
  "Failed to confirm the restore": "Échec de la confirmation de la restauration",
  "Failed to execute the restore": "Échec de l'exécution de la restauration",
  },
  uk: {
  "Restore points": "Точки відновлення",
  "Create restore point": "Створити точку відновлення",
  "Failed to create restore point": "Не вдалося створити точку відновлення",
  "Go to Database": "Перейти до Бази даних",
  "posts/pages writes": "записи постів/сторінок",
  "plugin-table rows": "рядки таблиць плагінів",
  "Unblock (not yet available)": "Розблокувати (поки що недоступно)",
  "No unblock route exists yet — see this screen's file header.":
    "Маршруту розблокування ще не існує — див. заголовок файлу цього екрана.",
  "No restore points yet.": "Поки що немає точок відновлення.",
  Trigger: "Джерело",
  "Cost class": "Клас вартості",
  "No restore-point mechanism available — see the runbook.": "Механізм точок відновлення недоступний — див. посібник з експлуатації.",
  "Restore…": "Відновити…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "Це охоплює лише шляхи запису з водяним знаком (сьогодні — записи постів/сторінок і таблиць плагінів) і НЕ є повним підрахунком усього, що було записано з моменту цієї точки відновлення — набори змін, записи таксономії, записи Колекцій і сеанси тут поки що не враховуються.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "Я розумію, що цей підрахунок є частковим, не вичерпним, і приймаю описане вище вікно втрат.",
  "Acknowledge the disclosure above to continue.": "Підтвердьте наведене вище розкриття інформації, щоб продовжити.",
  "Continue to confirm": "Продовжити до підтвердження",
  "Planning…": "Планування…",
  "Confirming…": "Підтвердження…",
  "Confirm restore": "Підтвердити відновлення",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "Підтверджено. Виконання здійснить відновлення — цю дію не можна скасувати.",
  "Restoring…": "Відновлення…",
  "Execute restore": "Виконати відновлення",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "Файл бази даних було замінено — цей серверний процес усе ще обслуговує дані до відновлення зі свого відкритого з'єднання. Перезапустіть сервер зараз, щоб застосувати відновлені дані.",
  "← Restore points": "← Точки відновлення",
  "Restore to": "Відновити до",
  "Restore capability:": "Можливість відновлення:",
  "Fast restore": "Швидке відновлення",
  "Costly restore": "Затратне відновлення",
  "Restore unavailable": "Відновлення недоступне",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "Точки відновлення — це легкі файлові знімки: їх створення й відновлення відбувається швидко та з мінімальним навантаженням.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "Точки відновлення — це повні дампи бази даних: їх створення й відновлення займає більше часу та потребує більше ресурсів.",
  Operations: "Експлуатація",
  Recovery: "Відновлення",
  "Restore this site to a previous point in time using a captured restore point.":
    "Відновіть цей сайт до попереднього моменту часу за допомогою збереженої точки відновлення.",
  "Loading restore points…": "Завантаження точок відновлення…",
  "Computing the discarded-write-window disclosure…": "Обчислення розкриття вікна відкинутих записів…",
  "failed to load Recovery": "не вдалося завантажити Відновлення",
  "Failed to compute the discarded-write-window disclosure":
    "Не вдалося обчислити розкриття вікна відкинутих записів",
  "Failed to plan the restore": "Не вдалося запланувати відновлення",
  "Failed to confirm the restore": "Не вдалося підтвердити відновлення",
  "Failed to execute the restore": "Не вдалося виконати відновлення",
  },
  tr: {
  "Restore points": "Geri yükleme noktaları",
  "Create restore point": "Geri yükleme noktası oluştur",
  "Failed to create restore point": "Geri yükleme noktası oluşturulamadı",
  "Go to Database": "Veritabanına git",
  "posts/pages writes": "yazı/sayfa yazmaları",
  "plugin-table rows": "eklenti tablosu satırları",
  "Unblock (not yet available)": "Engeli kaldır (henüz kullanılamıyor)",
  "No unblock route exists yet — see this screen's file header.":
    "Henüz bir engel kaldırma rotası yok — bu ekranın dosya üstbilgisine bakın.",
  "No restore points yet.": "Henüz geri yükleme noktası yok.",
  Trigger: "Tetikleyici",
  "Cost class": "Maliyet sınıfı",
  "No restore-point mechanism available — see the runbook.": "Kullanılabilir bir geri yükleme noktası mekanizması yok — çalışma kılavuzuna bakın.",
  "Restore…": "Geri yükle…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "Bu, yalnızca filigranla işaretlenmiş yazma yollarını (bugün itibarıyla yazı/sayfa ve eklenti tablosu yazmaları) kapsar ve bu geri yükleme noktasından bu yana yazılan her şeyin eksiksiz bir sayımı DEĞİLDİR — değişiklik kümeleri, taksonomi yazmaları, Koleksiyon girişleri ve oturumlar henüz burada sayılmamaktadır.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "Bu sayının kısmi olduğunu, kapsamlı olmadığını anlıyorum ve yukarıda açıklanan kayıp penceresini kabul ediyorum.",
  "Acknowledge the disclosure above to continue.": "Devam etmek için yukarıdaki açıklamayı onaylayın.",
  "Continue to confirm": "Onaylamak için devam et",
  "Planning…": "Planlanıyor…",
  "Confirming…": "Onaylanıyor…",
  "Confirm restore": "Geri yüklemeyi onayla",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "Onaylandı. Çalıştırmak geri yüklemeyi gerçekleştirir — bu işlem geri alınamaz.",
  "Restoring…": "Geri yükleniyor…",
  "Execute restore": "Geri yüklemeyi çalıştır",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "Veritabanı dosyası değiştirildi — bu sunucu süreci, açık bağlantısından geri yükleme öncesi verileri sunmaya devam ediyor. Geri yüklenen verilerin etkin olması için sunucuyu şimdi yeniden başlatın.",
  "← Restore points": "← Geri yükleme noktaları",
  "Restore to": "Şuna geri yükle",
  "Restore capability:": "Geri yükleme kapasitesi:",
  "Fast restore": "Hızlı geri yükleme",
  "Costly restore": "Maliyetli geri yükleme",
  "Restore unavailable": "Geri yükleme kullanılamıyor",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "Geri yükleme noktaları hafif dosya anlık görüntüleridir — yakalamak veya geri yüklemek hızlı ve düşük etkilidir.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "Geri yükleme noktaları tam veritabanı dökümleridir — yakalamak veya geri yüklemek daha uzun sürer ve daha fazla kaynak kullanır.",
  Operations: "Operasyonlar",
  Recovery: "Kurtarma",
  "Restore this site to a previous point in time using a captured restore point.":
    "Bu siteyi yakalanmış bir geri yükleme noktasını kullanarak önceki bir zamana geri yükleyin.",
  "Loading restore points…": "Geri yükleme noktaları yükleniyor…",
  "Computing the discarded-write-window disclosure…": "Atılan yazma penceresi açıklaması hesaplanıyor…",
  "failed to load Recovery": "Kurtarma yüklenemedi",
  "Failed to compute the discarded-write-window disclosure":
    "Atılan yazma penceresi açıklaması hesaplanamadı",
  "Failed to plan the restore": "Geri yükleme planlanamadı",
  "Failed to confirm the restore": "Geri yükleme onaylanamadı",
  "Failed to execute the restore": "Geri yükleme çalıştırılamadı",
  },
  th: {
  "Restore points": "จุดกู้คืน",
  "Create restore point": "สร้างจุดกู้คืน",
  "Failed to create restore point": "สร้างจุดกู้คืนไม่สำเร็จ",
  "Go to Database": "ไปที่ฐานข้อมูล",
  "posts/pages writes": "การเขียนโพสต์/หน้า",
  "plugin-table rows": "แถวตารางปลั๊กอิน",
  "Unblock (not yet available)": "ปลดบล็อก (ยังไม่พร้อมใช้งาน)",
  "No unblock route exists yet — see this screen's file header.":
    "ยังไม่มีเส้นทางการปลดบล็อก — ดูส่วนหัวไฟล์ของหน้าจอนี้",
  "No restore points yet.": "ยังไม่มีจุดกู้คืน",
  Trigger: "ตัวกระตุ้น",
  "Cost class": "ระดับต้นทุน",
  "No restore-point mechanism available — see the runbook.": "ไม่มีกลไกจุดกู้คืนที่ใช้งานได้ — โปรดดู runbook",
  "Restore…": "กู้คืน…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "สิ่งนี้ครอบคลุมเฉพาะเส้นทางการเขียนที่มีการประทับลายน้ำ (ปัจจุบันคือการเขียนโพสต์/หน้าและตารางปลั๊กอิน) และไม่ใช่การนับที่สมบูรณ์ของทุกสิ่งที่เขียนตั้งแต่จุดกู้คืนนี้ — change-set การเขียน taxonomy รายการ Collections และ session ยังไม่ถูกนับรวมที่นี่",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "ฉันเข้าใจว่าจำนวนนี้เป็นเพียงบางส่วน ไม่ครบถ้วน และยอมรับช่วงการสูญเสียที่อธิบายไว้ข้างต้น",
  "Acknowledge the disclosure above to continue.": "ยอมรับการเปิดเผยข้างต้นเพื่อดำเนินการต่อ",
  "Continue to confirm": "ดำเนินการต่อเพื่อยืนยัน",
  "Planning…": "กำลังวางแผน…",
  "Confirming…": "กำลังยืนยัน…",
  "Confirm restore": "ยืนยันการกู้คืน",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "ยืนยันแล้ว การเรียกใช้งานจะดำเนินการกู้คืน — ไม่สามารถยกเลิกการดำเนินการนี้ได้",
  "Restoring…": "กำลังกู้คืน…",
  "Execute restore": "เรียกใช้การกู้คืน",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "ไฟล์ฐานข้อมูลถูกแทนที่แล้ว — กระบวนการเซิร์ฟเวอร์นี้ยังคงให้บริการข้อมูลก่อนการกู้คืนจากการเชื่อมต่อที่เปิดอยู่ โปรดรีสตาร์ทเซิร์ฟเวอร์ตอนนี้เพื่อใช้ข้อมูลที่กู้คืนแล้ว",
  "← Restore points": "← จุดกู้คืน",
  "Restore to": "กู้คืนไปยัง",
  "Restore capability:": "ความสามารถในการกู้คืน:",
  "Fast restore": "กู้คืนได้รวดเร็ว",
  "Costly restore": "กู้คืนที่มีค่าใช้จ่ายสูง",
  "Restore unavailable": "ไม่สามารถกู้คืนได้",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "จุดกู้คืนเป็นสแนปช็อตไฟล์ขนาดเบา — จับภาพหรือกู้คืนได้รวดเร็วและใช้ทรัพยากรน้อย",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "จุดกู้คืนเป็นการดัมพ์ฐานข้อมูลแบบเต็มรูปแบบ — การจับภาพหรือกู้คืนใช้เวลานานขึ้นและใช้ทรัพยากรมากขึ้น",
  Operations: "ปฏิบัติการ",
  Recovery: "การกู้คืน",
  "Restore this site to a previous point in time using a captured restore point.":
    "กู้คืนเว็บไซต์นี้ไปยังจุดเวลาก่อนหน้าโดยใช้จุดกู้คืนที่บันทึกไว้",
  "Loading restore points…": "กำลังโหลดจุดกู้คืน…",
  "Computing the discarded-write-window disclosure…": "กำลังคำนวณการเปิดเผยช่วงเวลาการเขียนที่ถูกละทิ้ง…",
  "failed to load Recovery": "โหลดการกู้คืนไม่สำเร็จ",
  "Failed to compute the discarded-write-window disclosure":
    "คำนวณการเปิดเผยช่วงเวลาการเขียนที่ถูกละทิ้งไม่สำเร็จ",
  "Failed to plan the restore": "วางแผนการกู้คืนไม่สำเร็จ",
  "Failed to confirm the restore": "ยืนยันการกู้คืนไม่สำเร็จ",
  "Failed to execute the restore": "เรียกใช้การกู้คืนไม่สำเร็จ",
  },
  it: {
  "Restore points": "Punti di ripristino",
  "Create restore point": "Crea punto di ripristino",
  "Failed to create restore point": "Impossibile creare il punto di ripristino",
  "Go to Database": "Vai a Database",
  "posts/pages writes": "scritture di articoli/pagine",
  "plugin-table rows": "righe delle tabelle dei plugin",
  "Unblock (not yet available)": "Sblocca (non ancora disponibile)",
  "No unblock route exists yet — see this screen's file header.":
    "Non esiste ancora un percorso di sblocco — vedi l'intestazione del file di questa schermata.",
  "No restore points yet.": "Ancora nessun punto di ripristino.",
  Trigger: "Origine",
  "Cost class": "Classe di costo",
  "No restore-point mechanism available — see the runbook.": "Nessun meccanismo di punti di ripristino disponibile — vedi il runbook.",
  "Restore…": "Ripristina…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "Questo copre solo i percorsi di scrittura contrassegnati con watermark (oggi, scritture di articoli/pagine e di tabelle dei plugin) e NON è un conteggio completo di tutto ciò che è stato scritto da questo punto di ripristino — change-set, scritture di tassonomia, voci di Collezioni e sessioni non sono ancora conteggiate qui.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "Comprendo che questo conteggio è parziale, non esaustivo, e accetto la finestra di perdita descritta sopra.",
  "Acknowledge the disclosure above to continue.": "Conferma la divulgazione sopra per continuare.",
  "Continue to confirm": "Continua per confermare",
  "Planning…": "Pianificazione…",
  "Confirming…": "Conferma…",
  "Confirm restore": "Conferma ripristino",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "Confermato. L'esecuzione effettua il ripristino — questa azione non può essere annullata.",
  "Restoring…": "Ripristino in corso…",
  "Execute restore": "Esegui ripristino",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "Il file del database è stato sostituito — questo processo del server sta ancora servendo i dati precedenti al ripristino dalla sua connessione aperta. Riavvia ora il server per applicare i dati ripristinati.",
  "← Restore points": "← Punti di ripristino",
  "Restore to": "Ripristina a",
  "Restore capability:": "Capacità di ripristino:",
  "Fast restore": "Ripristino rapido",
  "Costly restore": "Ripristino costoso",
  "Restore unavailable": "Ripristino non disponibile",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "I punti di ripristino sono snapshot di file leggeri — veloci e a basso impatto da acquisire o ripristinare.",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "I punti di ripristino sono dump completi del database — acquisirli o ripristinarli richiede più tempo e utilizza più risorse.",
  Operations: "Operazioni",
  Recovery: "Ripristino",
  "Restore this site to a previous point in time using a captured restore point.":
    "Ripristina questo sito a un punto precedente nel tempo utilizzando un punto di ripristino acquisito.",
  "Loading restore points…": "Caricamento punti di ripristino…",
  "Computing the discarded-write-window disclosure…": "Calcolo della divulgazione della finestra di scrittura scartata…",
  "failed to load Recovery": "impossibile caricare Ripristino",
  "Failed to compute the discarded-write-window disclosure":
    "Impossibile calcolare la divulgazione della finestra di scrittura scartata",
  "Failed to plan the restore": "Impossibile pianificare il ripristino",
  "Failed to confirm the restore": "Impossibile confermare il ripristino",
  "Failed to execute the restore": "Impossibile eseguire il ripristino",
  },
  hi: {
  "Restore points": "रीस्टोर पॉइंट",
  "Create restore point": "रीस्टोर पॉइंट बनाएं",
  "Failed to create restore point": "रीस्टोर पॉइंट बनाना विफल रहा",
  "Go to Database": "डेटाबेस पर जाएं",
  "posts/pages writes": "पोस्ट/पेज लेखन",
  "plugin-table rows": "प्लगइन तालिकाओं की पंक्तियाँ",
  "Unblock (not yet available)": "अनब्लॉक करें (अभी उपलब्ध नहीं)",
  "No unblock route exists yet — see this screen's file header.":
    "अभी तक कोई अनब्लॉक रूट मौजूद नहीं है — इस स्क्रीन के फ़ाइल हेडर को देखें।",
  "No restore points yet.": "अभी तक कोई पुनर्स्थापना बिंदु नहीं है।",
  Trigger: "ट्रिगर",
  "Cost class": "लागत वर्ग",
  "No restore-point mechanism available — see the runbook.": "कोई पुनर्स्थापना-बिंदु तंत्र उपलब्ध नहीं है — रनबुक देखें।",
  "Restore…": "पुनर्स्थापित करें…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "यह केवल वॉटरमार्क-चिह्नित लेखन पथों को कवर करता है (आज के लिए, पोस्ट/पेज लेखन और प्लगइन-तालिका लेखन) और इस पुनर्स्थापना बिंदु के बाद से लिखी गई हर चीज़ की पूरी गिनती नहीं है — चेंज-सेट, टैक्सोनॉमी लेखन, संग्रह की प्रविष्टियां और सत्र अभी यहां नहीं गिने जाते।",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "मुझे समझ है कि यह गिनती आंशिक है, पूरी नहीं, और मुझे ऊपर बताई गई हानि-अवधि स्वीकार्य है।",
  "Acknowledge the disclosure above to continue.": "जारी रखने के लिए ऊपर दिए गए प्रकटीकरण को स्वीकार करें।",
  "Continue to confirm": "पुष्टि के लिए जारी रखें",
  "Planning…": "योजना बनाई जा रही है…",
  "Confirming…": "पुष्टि की जा रही है…",
  "Confirm restore": "पुनर्स्थापना की पुष्टि करें",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "पुष्टि हो गई। निष्पादित करने पर पुनर्स्थापना की जाएगी — इसे पूर्ववत नहीं किया जा सकता।",
  "Restoring…": "पुनर्स्थापित हो रहा है…",
  "Execute restore": "पुनर्स्थापना निष्पादित करें",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "डेटाबेस फ़ाइल बदल दी गई है — यह सर्वर प्रक्रिया अभी भी अपने खुले कनेक्शन से पुनर्स्थापना-पूर्व डेटा दे रही है। पुनर्स्थापित डेटा लागू करने के लिए अभी सर्वर को पुनः आरंभ करें।",
  "← Restore points": "← पुनर्स्थापना बिंदु",
  "Restore to": "पुनर्स्थापना गंतव्य",
  "Restore capability:": "पुनर्स्थापना क्षमता:",
  "Fast restore": "तेज़ पुनर्स्थापना",
  "Costly restore": "महंगी पुनर्स्थापना",
  "Restore unavailable": "पुनर्स्थापना उपलब्ध नहीं",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "पुनर्स्थापना बिंदु हल्के फ़ाइल स्नैपशॉट होते हैं — इन्हें कैप्चर या पुनर्स्थापित करना तेज़ और कम प्रभाव वाला होता है।",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "पुनर्स्थापना बिंदु पूर्ण डेटाबेस डंप होते हैं — इन्हें कैप्चर या पुनर्स्थापित करने में अधिक समय लगता है और अधिक संसाधन उपयोग होते हैं।",
  Operations: "संचालन",
  Recovery: "रिकवरी",
  "Restore this site to a previous point in time using a captured restore point.":
    "कैप्चर किए गए पुनर्स्थापना बिंदु का उपयोग करके इस साइट को पिछले समय बिंदु पर पुनर्स्थापित करें।",
  "Loading restore points…": "पुनर्स्थापना बिंदु लोड हो रहे हैं…",
  "Computing the discarded-write-window disclosure…": "छोड़े गए लेखन-विंडो प्रकटीकरण की गणना की जा रही है…",
  "failed to load Recovery": "रिकवरी लोड करना विफल रहा",
  "Failed to compute the discarded-write-window disclosure":
    "छोड़े गए लेखन-विंडो प्रकटीकरण की गणना करना विफल रहा",
  "Failed to plan the restore": "पुनर्स्थापना की योजना बनाना विफल रहा",
  "Failed to confirm the restore": "पुनर्स्थापना की पुष्टि करना विफल रहा",
  "Failed to execute the restore": "पुनर्स्थापना निष्पादित करना विफल रहा",
  },
  ur: {
  "Restore points": "ری اسٹور پوائنٹس",
  "Create restore point": "ری اسٹور پوائنٹ بنائیں",
  "Failed to create restore point": "ری اسٹور پوائنٹ بنانا ناکام ہوا",
  "Go to Database": "ڈیٹا بیس پر جائیں",
  "posts/pages writes": "پوسٹس/صفحات کی تحریریں",
  "plugin-table rows": "پلگ ان ٹیبلز کی قطاریں",
  "Unblock (not yet available)": "ان بلاک کریں (ابھی دستیاب نہیں)",
  "No unblock route exists yet — see this screen's file header.":
    "ابھی تک کوئی ان بلاک روٹ موجود نہیں ہے — اس اسکرین کے فائل ہیڈر کو دیکھیں۔",
  "No restore points yet.": "ابھی تک کوئی بحالی پوائنٹ نہیں ہے۔",
  Trigger: "ٹریگر",
  "Cost class": "لاگت کا درجہ",
  "No restore-point mechanism available — see the runbook.": "کوئی بحالی پوائنٹ میکانزم دستیاب نہیں ہے — رن بک دیکھیں۔",
  "Restore…": "بحال کریں…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "یہ صرف واٹر مارک شدہ تحریری راستوں کا احاطہ کرتا ہے (فی الحال پوسٹس/صفحات اور پلگ ان ٹیبل کی تحریریں) اور یہ اس بحالی پوائنٹ کے بعد سے لکھی گئی ہر چیز کی مکمل گنتی نہیں ہے — چینج سیٹس، ٹیکسونومی تحریریں، مجموعوں کے اندراجات اور سیشنز ابھی یہاں شمار نہیں کیے جاتے۔",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "مجھے سمجھ ہے کہ یہ گنتی جزوی ہے، مکمل نہیں، اور مجھے مذکورہ بالا نقصان کی مدت قابلِ قبول ہے۔",
  "Acknowledge the disclosure above to continue.": "جاری رکھنے کے لیے مذکورہ بالا انکشاف کی توثیق کریں۔",
  "Continue to confirm": "تصدیق کے لیے جاری رکھیں",
  "Planning…": "منصوبہ بندی ہو رہی ہے…",
  "Confirming…": "تصدیق ہو رہی ہے…",
  "Confirm restore": "بحالی کی تصدیق کریں",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "تصدیق ہو گئی۔ عمل درآمد کرنے پر بحالی انجام دی جائے گی — اسے واپس نہیں لایا جا سکتا۔",
  "Restoring…": "بحال ہو رہا ہے…",
  "Execute restore": "بحالی عمل میں لائیں",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "ڈیٹا بیس فائل تبدیل کر دی گئی ہے — یہ سرور پراسیس ابھی بھی اپنے کھلے کنکشن سے بحالی سے پہلے کا ڈیٹا فراہم کر رہا ہے۔ بحال شدہ ڈیٹا لاگو کرنے کے لیے ابھی سرور دوبارہ شروع کریں۔",
  "← Restore points": "← بحالی پوائنٹس",
  "Restore to": "بحالی کی منزل",
  "Restore capability:": "بحالی کی صلاحیت:",
  "Fast restore": "تیز بحالی",
  "Costly restore": "مہنگی بحالی",
  "Restore unavailable": "بحالی دستیاب نہیں",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "بحالی پوائنٹس ہلکے فائل سنیپ شاٹس ہوتے ہیں — انہیں حاصل کرنا یا بحال کرنا تیز اور کم اثر والا ہوتا ہے۔",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "بحالی پوائنٹس مکمل ڈیٹا بیس ڈمپ ہوتے ہیں — انہیں حاصل کرنا یا بحال کرنا زیادہ وقت لیتا ہے اور زیادہ وسائل استعمال کرتا ہے۔",
  Operations: "کارروائیاں",
  Recovery: "بازیابی",
  "Restore this site to a previous point in time using a captured restore point.":
    "کیپچر کیے گئے بحالی پوائنٹ کا استعمال کرتے ہوئے اس سائٹ کو ایک سابقہ وقت کے نقطے پر بحال کریں۔",
  "Loading restore points…": "بحالی پوائنٹس لوڈ ہو رہے ہیں…",
  "Computing the discarded-write-window disclosure…": "ضائع شدہ تحریری ونڈو کے انکشاف کا حساب لگایا جا رہا ہے…",
  "failed to load Recovery": "بازیابی لوڈ کرنا ناکام ہوا",
  "Failed to compute the discarded-write-window disclosure":
    "ضائع شدہ تحریری ونڈو کے انکشاف کا حساب لگانا ناکام ہوا",
  "Failed to plan the restore": "بحالی کی منصوبہ بندی کرنا ناکام ہوا",
  "Failed to confirm the restore": "بحالی کی تصدیق کرنا ناکام ہوا",
  "Failed to execute the restore": "بحالی عمل میں لانا ناکام ہوا",
  },
  bn: {
  "Restore points": "রিস্টোর পয়েন্ট",
  "Create restore point": "রিস্টোর পয়েন্ট তৈরি করুন",
  "Failed to create restore point": "রিস্টোর পয়েন্ট তৈরি করা ব্যর্থ হয়েছে",
  "Go to Database": "ডেটাবেসে যান",
  "posts/pages writes": "পোস্ট/পেজ লেখা",
  "plugin-table rows": "প্লাগইন টেবিলের সারি",
  "Unblock (not yet available)": "আনব্লক করুন (এখনও উপলব্ধ নয়)",
  "No unblock route exists yet — see this screen's file header.":
    "এখনও কোনো আনব্লক রুট নেই — এই স্ক্রিনের ফাইল হেডার দেখুন।",
  "No restore points yet.": "এখনও কোনো পুনরুদ্ধার বিন্দু নেই।",
  Trigger: "ট্রিগার",
  "Cost class": "খরচের শ্রেণি",
  "No restore-point mechanism available — see the runbook.": "কোনো পুনরুদ্ধার-বিন্দু প্রক্রিয়া উপলব্ধ নেই — রানবুক দেখুন।",
  "Restore…": "পুনরুদ্ধার করুন…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "এটি কেবল ওয়াটারমার্কযুক্ত লেখার পথগুলিকে কভার করে (বর্তমানে পোস্ট/পেজ ও প্লাগইন-টেবিল লেখা) এবং এই পুনরুদ্ধার বিন্দুর পর থেকে লেখা সবকিছুর সম্পূর্ণ গণনা নয় — চেঞ্জ-সেট, ট্যাক্সোনমি লেখা, সংগ্রহের এন্ট্রি এবং সেশন এখনও এখানে গণনা করা হয় না।",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "আমি বুঝি যে এই গণনা আংশিক, সম্পূর্ণ নয়, এবং উপরে বর্ণিত ক্ষতির সময়সীমা মেনে নিচ্ছি।",
  "Acknowledge the disclosure above to continue.": "চালিয়ে যেতে উপরের প্রকাশনাটি স্বীকার করুন।",
  "Continue to confirm": "নিশ্চিত করতে এগিয়ে যান",
  "Planning…": "পরিকল্পনা করা হচ্ছে…",
  "Confirming…": "নিশ্চিত করা হচ্ছে…",
  "Confirm restore": "পুনরুদ্ধার নিশ্চিত করুন",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "নিশ্চিত করা হয়েছে। কার্যকর করলে পুনরুদ্ধার সম্পন্ন হবে — এটি পূর্বাবস্থায় ফেরানো যাবে না।",
  "Restoring…": "পুনরুদ্ধার হচ্ছে…",
  "Execute restore": "পুনরুদ্ধার কার্যকর করুন",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "ডেটাবেস ফাইলটি প্রতিস্থাপিত হয়েছে — এই সার্ভার প্রক্রিয়া এখনও তার খোলা সংযোগ থেকে পুনরুদ্ধার-পূর্ববর্তী ডেটা সরবরাহ করছে। পুনরুদ্ধারকৃত ডেটা প্রয়োগ করতে এখনই সার্ভার পুনরায় চালু করুন।",
  "← Restore points": "← পুনরুদ্ধার বিন্দু",
  "Restore to": "পুনরুদ্ধারের গন্তব্য",
  "Restore capability:": "পুনরুদ্ধারের সক্ষমতা:",
  "Fast restore": "দ্রুত পুনরুদ্ধার",
  "Costly restore": "ব্যয়বহুল পুনরুদ্ধার",
  "Restore unavailable": "পুনরুদ্ধার উপলব্ধ নয়",
  "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.": "পুনরুদ্ধার পয়েন্টগুলি হালকা ফাইল স্ন্যাপশট — এগুলি ধারণ বা পুনরুদ্ধার করা দ্রুত এবং কম প্রভাবযুক্ত।",
  "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.": "পুনরুদ্ধার পয়েন্টগুলি সম্পূর্ণ ডেটাবেস ডাম্প — এগুলি ধারণ বা পুনরুদ্ধার করতে বেশি সময় লাগে এবং বেশি সম্পদ ব্যবহার হয়।",
  Operations: "অপারেশনস",
  Recovery: "পুনরুদ্ধার",
  "Restore this site to a previous point in time using a captured restore point.":
    "ক্যাপচার করা একটি পুনরুদ্ধার বিন্দু ব্যবহার করে এই সাইটটিকে পূর্ববর্তী একটি সময়বিন্দুতে পুনরুদ্ধার করুন।",
  "Loading restore points…": "পুনরুদ্ধার বিন্দু লোড হচ্ছে…",
  "Computing the discarded-write-window disclosure…": "বাতিল করা লেখা-উইন্ডো প্রকাশনার হিসাব করা হচ্ছে…",
  "failed to load Recovery": "পুনরুদ্ধার লোড করা ব্যর্থ হয়েছে",
  "Failed to compute the discarded-write-window disclosure":
    "বাতিল করা লেখা-উইন্ডো প্রকাশনার হিসাব করা ব্যর্থ হয়েছে",
  "Failed to plan the restore": "পুনরুদ্ধারের পরিকল্পনা করা ব্যর্থ হয়েছে",
  "Failed to confirm the restore": "পুনরুদ্ধার নিশ্চিত করা ব্যর্থ হয়েছে",
  "Failed to execute the restore": "পুনরুদ্ধার কার্যকর করা ব্যর্থ হয়েছে",
  },
};

/** Same two-step fallback every other `t()` in this app uses: translated value, else the English
 *  source string itself — never a raw dictionary-miss placeholder. */
export const t = createDictionaryTranslator(RECOVERY_DICT);

/** "Since <strong>{createdAt}</strong>, restoring here would discard at least:" — the timestamp
 *  is emphasized mid-sentence, so this can't be a flat `ES` entry. */
const SINCE_DISCARD_FRAGMENTS: Record<string, { before: string; after: string }> = {
  en: { before: "Since ", after: ", restoring here would discard at least:" },
  es: { before: "Desde ", after: ", restaurar aquí descartaría al menos:" },
  id: { before: "Sejak ", after: ", memulihkan di sini akan membuang setidaknya:" },
  de: { before: "Seit ", after: ", würde eine Wiederherstellung hier mindestens Folgendes verwerfen:" },
  "zh-CN": { before: "自 ", after: " 起,在此还原将至少丢弃:" },
  "zh-TW": { before: "自 ", after: " 起,在此還原將至少捨棄:" },
  "pt-BR": { before: "Desde ", after: ", restaurar aqui descartaria pelo menos:" },
  ru: { before: "С ", after: " восстановление здесь приведёт к потере как минимум:" },
  fa: { before: "از ", after: "، بازیابی در اینجا حداقل موارد زیر را دور می‌ریزد:" },
  ar: { before: "منذ ", after: "، ستؤدي الاستعادة هنا إلى فقدان ما لا يقل عن:" },
  ja: { before: "", after: " 以降にここで復元すると、少なくとも次を破棄します:" },
  ko: { before: "", after: " 이후 여기서 복원하면 최소한 다음이 삭제됩니다:" },
  pl: { before: "Od ", after: ", przywrócenie tutaj spowoduje utratę co najmniej:" },
  hu: { before: "", after: " óta itt végzett visszaállítás legalább a következőket dobja el:" },
  fr: { before: "Depuis ", after: ", la restauration ici entraînerait la perte d'au moins :" },
  uk: { before: "Від ", after: " відновлення тут призведе до втрати щонайменше:" },
  tr: { before: "", after: " tarihinden bu yana burada geri yükleme yapmak en az şunları silecektir:" },
  th: { before: "ตั้งแต่ ", after: " การกู้คืนที่นี่จะละทิ้งอย่างน้อย:" },
  it: { before: "Dal ", after: ", il ripristino qui scarterebbe almeno:" },
  hi: { before: "", after: " से, यहां पुनर्स्थापित करने पर कम से कम निम्नलिखित छूट जाएगा:" },
  ur: { before: "", after: " سے، یہاں بحال کرنے پر کم از کم درج ذیل ضائع ہو جائے گا:" },
  bn: { before: "", after: " থেকে, এখানে পুনরুদ্ধার করলে অন্তত নিম্নলিখিতগুলি বাদ যাবে:" },
};

export function sinceDiscardMessage(locale: string, createdAt: string): ReactNode {
  const f = SINCE_DISCARD_FRAGMENTS[locale] ?? SINCE_DISCARD_FRAGMENTS.en;
  return (
    <>
      {f.before}
      <strong>{createdAt}</strong>
      {f.after}
    </>
  );
}

/** One discarded-write-window count line — either an exact count or the "unknown" case
 *  (INV-05: never conflate the two). `categoryLabelText` is `rules.ts`'s `categoryLabel()` output,
 *  deliberately still English (see this file's header). */
const UNKNOWN_DISCARD_COUNT_PREFIX: Record<string, string> = {
  en: "at least an unknown number of ",
  es: "al menos una cantidad desconocida de ",
  id: "setidaknya sejumlah yang tidak diketahui dari ",
  de: "mindestens eine unbekannte Anzahl von ",
  "zh-CN": "至少未知数量的 ",
  "zh-TW": "至少未知數量的 ",
  "pt-BR": "pelo menos uma quantidade desconhecida de ",
  ru: "как минимум неизвестное количество ",
  fa: "دست‌کم تعداد نامشخصی از ",
  ar: "ما لا يقل عن عدد غير معروف من ",
  ja: "少なくとも不明な数の ",
  ko: "최소한 알 수 없는 수의 ",
  pl: "co najmniej nieznaną liczbę ",
  hu: "legalább ismeretlen számú ",
  fr: "au moins un nombre inconnu de ",
  uk: "щонайменше невідому кількість ",
  tr: "en az bilinmeyen sayıda ",
  th: "อย่างน้อยจำนวนที่ไม่ทราบของ ",
  it: "almeno un numero sconosciuto di ",
  hi: "कम से कम अज्ञात संख्या के ",
  ur: "کم از کم ایک نامعلوم تعداد کی ",
  bn: "কমপক্ষে অজানা সংখ্যক ",
};

export function discardCountLine(locale: string, count: number | "unknown", categoryLabelText: string): ReactNode {
  if (count === "unknown") {
    const prefix = UNKNOWN_DISCARD_COUNT_PREFIX[locale] ?? UNKNOWN_DISCARD_COUNT_PREFIX.en;
    return (
      <span>
        {prefix}
        {categoryLabelText}
      </span>
    );
  }
  return (
    <span>
      {count} {categoryLabelText}
    </span>
  );
}

/** The baseline-unavailable warning names the literal word "unknown" used in the count lines
 *  above, so it's translated as one static block rather than a flat key — keeping both mentions of
 *  "desconocido"/"unknown" in agreement. */
const BASELINE_UNAVAILABLE_TEXT: Record<string, string> = {
  en: 'The discarded-write-window baseline could not be computed for this site right now — every count above is shown as "unknown", not a verified zero.',
  es: 'No se pudo calcular la línea base de la ventana de escritura descartada para este sitio en este momento — cada recuento anterior se muestra como "desconocido", no como un cero verificado.',
  id: 'Baseline jendela penulisan yang dibuang tidak dapat dihitung untuk situs ini saat ini — setiap hitungan di atas ditampilkan sebagai "tidak diketahui", bukan nol yang terverifikasi.',
  de: 'Die Baseline für das verworfene Schreibfenster konnte für diese Website derzeit nicht berechnet werden — jede Zählung oben wird als „unbekannt" angezeigt, nicht als verifizierte Null.',
  "zh-CN": '目前无法为此站点计算已丢弃写入窗口的基线 — 上面的每个计数均显示为"未知",而非经验证的零。',
  "zh-TW": '目前無法為此網站計算已捨棄寫入視窗的基準線 — 上方每個計數皆顯示為「未知」,而非經驗證的零。',
  "pt-BR": 'Não foi possível calcular a linha de base da janela de gravação descartada para este site no momento — cada contagem acima é exibida como "desconhecida", não como um zero verificado.',
  ru: "Базовое значение окна отброшенных записей не удалось вычислить для этого сайта прямо сейчас — каждый счётчик выше отображается как «неизвестно», а не как подтверждённый ноль.",
  fa: "خط پایه پنجره نوشتن دورریخته‌شده اکنون برای این سایت قابل محاسبه نبود — هر شمارش بالا به‌صورت «نامشخص» نمایش داده می‌شود، نه صفرِ تأییدشده.",
  ar: 'تعذّر حساب خط الأساس لنافذة الكتابة المُهمَلة لهذا الموقع الآن — يُعرض كل عدد أعلاه على أنه "غير معروف"، وليس صفرًا موثَّقًا.',
  ja: "このサイトの破棄された書き込みウィンドウのベースラインは現在計算できませんでした — 上記の各件数は検証済みのゼロではなく「不明」として表示されています。",
  ko: '현재 이 사이트에 대한 폐기된 쓰기 구간의 기준값을 계산할 수 없습니다 — 위의 모든 수치는 검증된 0이 아니라 "알 수 없음"으로 표시됩니다.',
  pl: "Nie udało się obecnie obliczyć wartości bazowej okna odrzuconych zapisów dla tej witryny — każda liczba powyżej jest wyświetlana jako „nieznana”, a nie zweryfikowane zero.",
  hu: "Az eldobott írási ablak alapértékét jelenleg nem sikerült kiszámítani ehhez a webhelyhez — a fenti minden szám „ismeretlenként” jelenik meg, nem ellenőrzött nullaként.",
  fr: "Impossible de calculer actuellement la référence de la fenêtre d'écriture ignorée pour ce site — chaque décompte ci-dessus est affiché comme « inconnu », et non comme un zéro vérifié.",
  uk: "Наразі не вдалося обчислити базове значення вікна відкинутих записів для цього сайту — кожен підрахунок вище показано як «невідомо», а не як підтверджений нуль.",
  tr: 'Bu site için atılan yazma penceresi temel değeri şu anda hesaplanamadı — yukarıdaki her sayım, doğrulanmış bir sıfır olarak değil, "bilinmiyor" olarak gösterilir.',
  th: 'ไม่สามารถคำนวณค่าพื้นฐานของช่วงเวลาการเขียนที่ถูกละทิ้งสำหรับเว็บไซต์นี้ได้ในขณะนี้ — จำนวนทั้งหมดข้างต้นแสดงเป็น "ไม่ทราบ" ไม่ใช่ศูนย์ที่ยืนยันแล้ว',
  it: 'Non è stato possibile calcolare la baseline della finestra di scrittura scartata per questo sito in questo momento — ogni conteggio sopra è mostrato come "sconosciuto", non come uno zero verificato.',
  hi: 'इस साइट के लिए छोड़े गए लेखन-विंडो की आधाररेखा अभी गणना नहीं की जा सकी — ऊपर दिखाई गई हर गिनती "अज्ञात" के रूप में दिखाई जाती है, सत्यापित शून्य के रूप में नहीं।',
  ur: 'اس سائٹ کے لیے ضائع شدہ تحریری ونڈو کی بیس لائن ابھی حساب نہیں کی جا سکی — اوپر دکھائی گئی ہر گنتی "نامعلوم" کے طور پر ظاہر ہوتی ہے، تصدیق شدہ صفر کے طور پر نہیں۔',
  bn: 'এই সাইটের জন্য বাতিল করা লেখা-উইন্ডোর বেসলাইন এখনই গণনা করা যায়নি — উপরের প্রতিটি গণনা "অজানা" হিসেবে দেখানো হয়েছে, যাচাইকৃত শূন্য হিসেবে নয়।',
};

export function baselineUnavailableMessage(locale: string): ReactNode {
  return <>{BASELINE_UNAVAILABLE_TEXT[locale] ?? BASELINE_UNAVAILABLE_TEXT.en}</>;
}

/** "Restore plan ready (plan <code>{planId}</code>). Confirming issues a one-time execution token
 *  — nothing is restored yet." */
const RESTORE_PLAN_READY_FRAGMENTS: Record<string, { before: string; after: string }> = {
  en: {
    before: "Restore plan ready (plan ",
    after: "). Confirming issues a one-time execution token — nothing is restored yet.",
  },
  es: {
    before: "Plan de restauración listo (plan ",
    after: "). Confirmarlo emite un token de ejecución de un solo uso: nada se ha restaurado todavía.",
  },
  id: {
    before: "Rencana pemulihan siap (rencana ",
    after: "). Konfirmasi akan menerbitkan token eksekusi sekali pakai — belum ada yang dipulihkan.",
  },
  de: {
    before: "Wiederherstellungsplan bereit (Plan ",
    after: "). Die Bestätigung stellt ein einmaliges Ausführungstoken aus — es wurde noch nichts wiederhergestellt.",
  },
  "zh-CN": {
    before: "恢复计划已就绪(计划 ",
    after: ")。确认将签发一次性执行令牌 — 目前尚未恢复任何内容。",
  },
  "zh-TW": {
    before: "還原計畫已就緒(計畫 ",
    after: ")。確認會核發一次性執行權杖 — 目前尚未還原任何內容。",
  },
  "pt-BR": {
    before: "Plano de restauração pronto (plano ",
    after: "). Confirmar emite um token de execução único — nada foi restaurado ainda.",
  },
  ru: {
    before: "План восстановления готов (план ",
    after: "). Подтверждение выдаёт одноразовый токен выполнения — пока ничего не восстановлено.",
  },
  fa: {
    before: "طرح بازیابی آماده است (طرح ",
    after: "). تأیید یک نشانه اجرای یک‌بارمصرف صادر می‌کند — هنوز چیزی بازیابی نشده است.",
  },
  ar: {
    before: "خطة الاستعادة جاهزة (الخطة ",
    after: "). يؤدي التأكيد إلى إصدار رمز تنفيذ لمرة واحدة — لم تتم استعادة أي شيء بعد.",
  },
  ja: {
    before: "復元プランの準備ができました(プラン ",
    after: ")。確認すると1回限りの実行トークンが発行されます — まだ何も復元されていません。",
  },
  ko: {
    before: "복원 계획이 준비되었습니다(계획 ",
    after: "). 확인하면 일회용 실행 토큰이 발급됩니다 — 아직 아무것도 복원되지 않았습니다.",
  },
  pl: {
    before: "Plan przywracania gotowy (plan ",
    after: "). Potwierdzenie wydaje jednorazowy token wykonania — nic nie zostało jeszcze przywrócone.",
  },
  hu: {
    before: "A visszaállítási terv kész (terv ",
    after: "). A megerősítés egyszeri végrehajtási tokent állít ki — még semmi sem lett visszaállítva.",
  },
  fr: {
    before: "Plan de restauration prêt (plan ",
    after: "). La confirmation émet un jeton d'exécution à usage unique — rien n'est encore restauré.",
  },
  uk: {
    before: "План відновлення готовий (план ",
    after: "). Підтвердження видає одноразовий токен виконання — поки що нічого не відновлено.",
  },
  tr: {
    before: "Geri yükleme planı hazır (plan ",
    after: "). Onaylamak tek kullanımlık bir yürütme jetonu verir — henüz hiçbir şey geri yüklenmedi.",
  },
  th: {
    before: "แผนการกู้คืนพร้อมแล้ว (แผน ",
    after: ") การยืนยันจะออกโทเคนการดำเนินการแบบใช้ครั้งเดียว — ยังไม่มีการกู้คืนใดๆ",
  },
  it: {
    before: "Piano di ripristino pronto (piano ",
    after: "). La conferma emette un token di esecuzione monouso — non è stato ancora ripristinato nulla.",
  },
  hi: {
    before: "पुनर्स्थापना योजना तैयार है (योजना ",
    after: ")। पुष्टि करने पर एक बार उपयोग होने वाला निष्पादन टोकन जारी होता है — अभी तक कुछ भी पुनर्स्थापित नहीं हुआ है।",
  },
  ur: {
    before: "بحالی کا منصوبہ تیار ہے (منصوبہ ",
    after: ")۔ تصدیق کرنے پر ایک بار استعمال ہونے والا ایگزیکیوشن ٹوکن جاری ہوتا ہے — ابھی تک کچھ بھی بحال نہیں ہوا۔",
  },
  bn: {
    before: "পুনরুদ্ধার পরিকল্পনা প্রস্তুত (পরিকল্পনা ",
    after: ")। নিশ্চিত করলে একবার ব্যবহারযোগ্য এক্সিকিউশন টোকেন ইস্যু হয় — এখনও কিছুই পুনরুদ্ধার করা হয়নি।",
  },
};

export function restorePlanReadyMessage(locale: string, planId: string): ReactNode {
  const f = RESTORE_PLAN_READY_FRAGMENTS[locale] ?? RESTORE_PLAN_READY_FRAGMENTS.en;
  return (
    <>
      {f.before}
      <code>{planId}</code>
      {f.after}
    </>
  );
}

/** "Restore run <code>{restoreRunId}</code> finished in state {stateNode}." — `stateNode` is the
 *  caller's own `<span className={status...}>{state}</span>`, passed through rather than rebuilt
 *  here since the status value and its class name are not translatable content. */
const RESTORE_DONE_FRAGMENTS: Record<string, { before: string; middle: string; after: string }> = {
  en: { before: "Restore run ", middle: " finished in state ", after: "." },
  es: { before: "La ejecución de restauración ", middle: " finalizó en estado ", after: "." },
  id: { before: "Proses pemulihan ", middle: " selesai dengan status ", after: "." },
  de: { before: "Wiederherstellungslauf ", middle: " wurde mit Status ", after: " abgeschlossen." },
  "zh-CN": { before: "恢复运行 ", middle: " 以状态 ", after: " 结束。" },
  "zh-TW": { before: "還原執行 ", middle: " 以狀態 ", after: " 結束。" },
  "pt-BR": { before: "A execução de restauração ", middle: " terminou no estado ", after: "." },
  ru: { before: "Запуск восстановления ", middle: " завершился в состоянии ", after: "." },
  fa: { before: "اجرای بازیابی ", middle: " با وضعیت ", after: " به پایان رسید." },
  ar: { before: "انتهى تشغيل الاستعادة ", middle: " بالحالة ", after: "." },
  ja: { before: "復元の実行 ", middle: " は状態 ", after: " で終了しました。" },
  ko: { before: "복원 실행 ", middle: "의 상태가 ", after: "(으)로 종료되었습니다." },
  pl: { before: "Uruchomienie przywracania ", middle: " zakończyło się w stanie ", after: "." },
  hu: { before: "A visszaállítási futtatás ", middle: " a következő állapotban fejeződött be: ", after: "." },
  fr: { before: "L'exécution de restauration ", middle: " s'est terminée à l'état ", after: "." },
  uk: { before: "Виконання відновлення ", middle: " завершилося у стані ", after: "." },
  tr: { before: "Geri yükleme çalıştırması ", middle: " şu durumda tamamlandı: ", after: "." },
  th: { before: "การรันการกู้คืน ", middle: " เสร็จสิ้นในสถานะ ", after: "" },
  it: { before: "L'esecuzione del ripristino ", middle: " è terminata nello stato ", after: "." },
  hi: { before: "पुनर्स्थापना रन ", middle: " की स्थिति ", after: " में समाप्त हुई।" },
  ur: { before: "بحالی رن ", middle: " کی حالت ", after: " میں مکمل ہوئی۔" },
  bn: { before: "পুনরুদ্ধার রান ", middle: "-এর অবস্থা ", after: "-এ শেষ হয়েছে।" },
};

export function restoreDoneMessage(locale: string, restoreRunId: string, stateNode: ReactNode): ReactNode {
  const f = RESTORE_DONE_FRAGMENTS[locale] ?? RESTORE_DONE_FRAGMENTS.en;
  return (
    <>
      {f.before}
      <code>{restoreRunId}</code>
      {f.middle}
      {stateNode}
      {f.after}
    </>
  );
}
