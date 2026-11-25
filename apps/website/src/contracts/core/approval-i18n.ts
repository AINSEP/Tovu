/** Confirmation cards use the same operator locale codes as the admin language selector. */
export const APPROVAL_COPY = {
  en: ['Confirm action?', 'Confirm', 'Cancel', 'Tool', 'Input'],
  es: ['¿Confirmar acción?', 'Confirmar', 'Cancelar', 'Herramienta', 'Entrada'],
  id: ['Konfirmasi tindakan?', 'Konfirmasi', 'Batal', 'Alat', 'Masukan'],
  de: ['Aktion bestätigen?', 'Bestätigen', 'Abbrechen', 'Werkzeug', 'Eingabe'],
  'zh-CN': ['确认操作？', '确认', '取消', '工具', '输入'],
  'zh-TW': ['確認操作？', '確認', '取消', '工具', '輸入'],
  'pt-BR': ['Confirmar ação?', 'Confirmar', 'Cancelar', 'Ferramenta', 'Entrada'],
  ru: ['Подтвердить действие?', 'Подтвердить', 'Отмена', 'Инструмент', 'Ввод'],
  fa: ['عملیات را تأیید می‌کنید؟', 'تأیید', 'لغو', 'ابزار', 'ورودی'],
  ar: ['تأكيد الإجراء؟', 'تأكيد', 'إلغاء', 'الأداة', 'المدخلات'],
  ja: ['操作を確認しますか？', '確認', 'キャンセル', 'ツール', '入力'],
  ko: ['작업을 확인하시겠습니까?', '확인', '취소', '도구', '입력'],
  pl: ['Potwierdzić działanie?', 'Potwierdź', 'Anuluj', 'Narzędzie', 'Dane wejściowe'],
  hu: ['Megerősíti a műveletet?', 'Megerősítés', 'Mégse', 'Eszköz', 'Bemenet'],
  fr: ['Confirmer l’action ?', 'Confirmer', 'Annuler', 'Outil', 'Entrée'],
  uk: ['Підтвердити дію?', 'Підтвердити', 'Скасувати', 'Інструмент', 'Вхідні дані'],
  tr: ['İşlem onaylansın mı?', 'Onayla', 'İptal', 'Araç', 'Girdi'],
  th: ['ยืนยันการดำเนินการหรือไม่?', 'ยืนยัน', 'ยกเลิก', 'เครื่องมือ', 'ข้อมูลเข้า'],
  it: ['Confermare l’azione?', 'Conferma', 'Annulla', 'Strumento', 'Dati in ingresso'],
  hi: ['कार्रवाई की पुष्टि करें?', 'पुष्टि करें', 'रद्द करें', 'टूल', 'इनपुट'],
  ur: ['کارروائی کی تصدیق کریں؟', 'تصدیق کریں', 'منسوخ کریں', 'ٹول', 'ان پٹ'],
  bn: ['কাজটি নিশ্চিত করবেন?', 'নিশ্চিত করুন', 'বাতিল করুন', 'টুল', 'ইনপুট'],
} as const;
const KEYS: readonly string[] = ['Confirm action?', 'Confirm', 'Cancel', 'Tool', 'Input'];
const TARGET_FOLDER_COPY = {
  en: 'Target folder', es: 'Carpeta de destino', id: 'Folder tujuan', de: 'Zielordner',
  'zh-CN': '目标文件夹', 'zh-TW': '目標資料夾', 'pt-BR': 'Pasta de destino', ru: 'Целевая папка',
  fa: 'پوشه مقصد', ar: 'المجلد الهدف', ja: '保存先フォルダー', ko: '대상 폴더', pl: 'Folder docelowy',
  hu: 'Célmappa', fr: 'Dossier de destination', uk: 'Цільова папка', tr: 'Hedef klasör',
  th: 'โฟลเดอร์ปลายทาง', it: 'Cartella di destinazione', hi: 'लक्ष्य फ़ोल्डर', ur: 'منزل کا فولڈر', bn: 'গন্তব্য ফোল্ডার',
} as const satisfies Record<keyof typeof APPROVAL_COPY, string>;
const HOST_COPY = {
  en: 'Host', es: 'Servidor', id: 'Penyedia hos', de: 'Server',
  'zh-CN': '托管平台', 'zh-TW': '託管平台', 'pt-BR': 'Servidor', ru: 'Хостинг',
  fa: 'میزبان', ar: 'المضيف', ja: 'ホスト', ko: '호스트',
  pl: 'Serwer', hu: 'Kiszolgáló', fr: 'Hébergeur', uk: 'Хостинг',
  tr: 'Sunucu', th: 'โฮสต์', it: 'Server', hi: 'होस्ट',
  ur: 'میزبان', bn: 'হোস্ট',
} as const satisfies Record<keyof typeof APPROVAL_COPY, string>;
const REPOSITORY_COPY = {
  en: 'Repository', es: 'Repositorio', id: 'Repositori', de: 'Codearchiv',
  'zh-CN': '代码仓库', 'zh-TW': '程式碼儲存庫', 'pt-BR': 'Repositório', ru: 'Репозиторий',
  fa: 'مخزن', ar: 'المستودع', ja: 'リポジトリ', ko: '저장소',
  pl: 'Repozytorium', hu: 'Tároló', fr: 'Dépôt', uk: 'Репозиторій',
  tr: 'Depo', th: 'ที่เก็บโค้ด', it: 'Archivio', hi: 'रिपॉज़िटरी',
  ur: 'ریپوزٹری', bn: 'রিপোজিটরি',
} as const satisfies Record<keyof typeof APPROVAL_COPY, string>;
const PROJECT_NAME_COPY = {
  en: 'Project name', es: 'Nombre del proyecto', id: 'Nama proyek', de: 'Projektname',
  'zh-CN': '项目名称', 'zh-TW': '專案名稱', 'pt-BR': 'Nome do projeto', ru: 'Название проекта',
  fa: 'نام پروژه', ar: 'اسم المشروع', ja: 'プロジェクト名', ko: '프로젝트 이름',
  pl: 'Nazwa projektu', hu: 'Projekt neve', fr: 'Nom du projet', uk: 'Назва проєкту',
  tr: 'Proje adı', th: 'ชื่อโครงการ', it: 'Nome del progetto', hi: 'परियोजना का नाम',
  ur: 'منصوبے کا نام', bn: 'প্রকল্পের নাম',
} as const satisfies Record<keyof typeof APPROVAL_COPY, string>;
const SAVED_CONNECTION_COPY = {
  en: 'Saved connection', es: 'Conexión guardada', id: 'Koneksi tersimpan', de: 'Gespeicherte Verbindung',
  'zh-CN': '已保存的连接', 'zh-TW': '已儲存的連線', 'pt-BR': 'Conexão salva', ru: 'Сохранённое подключение',
  fa: 'اتصال ذخیره\u200cشده', ar: 'الاتصال المحفوظ', ja: '保存済みの接続', ko: '저장된 연결',
  pl: 'Zapisane połączenie', hu: 'Mentett kapcsolat', fr: 'Connexion enregistrée', uk: 'Збережене підключення',
  tr: 'Kayıtlı bağlantı', th: 'การเชื่อมต่อที่บันทึกไว้', it: 'Connessione salvata', hi: 'सहेजा गया कनेक्शन',
  ur: 'محفوظ کردہ کنکشن', bn: 'সংরক্ষিত সংযোগ',
} as const satisfies Record<keyof typeof APPROVAL_COPY, string>;
const HOSTING_PROVIDER_COPY = {
  en: 'Hosting provider', es: 'Proveedor de alojamiento', id: 'Penyedia hosting', de: 'Hosting-Anbieter',
  'zh-CN': '托管服务商', 'zh-TW': '託管服務供應商', 'pt-BR': 'Provedor de hospedagem', ru: 'Хостинг-провайдер',
  fa: 'ارائه\u200cدهنده میزبانی', ar: 'مزود الاستضافة', ja: 'ホスティングプロバイダー', ko: '호스팅 제공업체',
  pl: 'Dostawca hostingu', hu: 'Tárhelyszolgáltató', fr: 'Fournisseur d’hébergement', uk: 'Хостинг-провайдер',
  tr: 'Barındırma sağlayıcısı', th: 'ผู้ให้บริการโฮสติ้ง', it: 'Fornitore di hosting', hi: 'होस्टिंग प्रदाता',
  ur: 'ہوسٹنگ فراہم کنندہ', bn: 'হোস্টিং প্রদানকারী',
} as const satisfies Record<keyof typeof APPROVAL_COPY, string>;
const SCHEMA_TITLE_COPY: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'Target folder': TARGET_FOLDER_COPY,
  Host: HOST_COPY,
  Repository: REPOSITORY_COPY,
  'Project name': PROJECT_NAME_COPY,
  'Saved connection': SAVED_CONNECTION_COPY,
  'Hosting provider': HOSTING_PROVIDER_COPY,
};
const ACTION_KEYS: readonly string[] = ['Technical name', '{action}?', 'Publish static site', 'Publish'];
/** Catalog copy uses exact-key lookup; unknown tool names and schema labels remain verbatim. */
const ACTION_COPY = {
  en: ['Technical name', '{action}?', 'Publish static site', 'Publish'],
  es: ['Nombre técnico', '¿{action}?', 'Publicar sitio estático', 'Publicar'],
  id: ['Nama teknis', '{action}?', 'Publikasikan situs statis', 'Publikasikan'],
  de: ['Technischer Name', '{action}?', 'Statische Website veröffentlichen', 'Veröffentlichen'],
  'zh-CN': ['技术名称', '{action}？', '发布静态网站', '发布'],
  'zh-TW': ['技術名稱', '{action}？', '發布靜態網站', '發布'],
  'pt-BR': ['Nome técnico', '{action}?', 'Publicar site estático', 'Publicar'],
  ru: ['Техническое имя', '{action}?', 'Опубликовать статический сайт', 'Опубликовать'],
  fa: ['نام فنی', '{action}؟', 'انتشار سایت ایستا', 'انتشار'],
  ar: ['الاسم التقني', '{action}؟', 'نشر موقع ثابت', 'نشر'],
  ja: ['技術名', '{action}しますか？', '静的サイトを公開', '公開'],
  ko: ['기술 이름', '{action}하시겠습니까?', '정적 사이트 게시', '게시'],
  pl: ['Nazwa techniczna', '{action}?', 'Opublikować witrynę statyczną', 'Opublikuj'],
  hu: ['Technikai név', '{action}?', 'Statikus webhely közzététele', 'Közzététel'],
  fr: ['Nom technique', '{action} ?', 'Publier le site statique', 'Publier'],
  uk: ['Технічна назва', '{action}?', 'Опублікувати статичний сайт', 'Опублікувати'],
  tr: ['Teknik ad', '{action}?', 'Statik siteyi yayınla', 'Yayınla'],
  th: ['ชื่อทางเทคนิค', '{action}หรือไม่?', 'เผยแพร่เว็บไซต์แบบคงที่', 'เผยแพร่'],
  it: ['Nome tecnico', '{action}?', 'Pubblicare il sito statico', 'Pubblica'],
  hi: ['तकनीकी नाम', '{action} की पुष्टि करें?', 'स्थिर साइट प्रकाशित करें', 'प्रकाशित करें'],
  ur: ['تکنیکی نام', '{action} کی تصدیق کریں؟', 'جامد سائٹ شائع کریں', 'شائع کریں'],
  bn: ['প্রযুক্তিগত নাম', '{action} নিশ্চিত করবেন?', 'স্থির সাইট প্রকাশ করুন', 'প্রকাশ করুন'],
} as const satisfies Record<keyof typeof APPROVAL_COPY, readonly string[]>;

const ROUTINE_KEYS: readonly string[] = ['Create routine', 'Pause routine', 'Resume routine', 'Delete routine', 'Schedule', 'Prompt', 'Agent', 'Model',
  'This routine runs only while Tovu is open and your computer is awake'];
/** Routine confirmation cards (P3-T4.T): action titles, field labels and the desktop-availability note, in every approval locale. */
const ROUTINE_COPY = {
  en: ['Create routine', 'Pause routine', 'Resume routine', 'Delete routine', 'Schedule', 'Prompt', 'Agent', 'Model', 'This routine runs only while Tovu is open and your computer is awake'],
  es: ['Crear rutina', 'Pausar rutina', 'Reanudar rutina', 'Eliminar rutina', 'Programación', 'Instrucción', 'Agente', 'Modelo', 'Esta rutina solo se ejecuta mientras Tovu está abierto y tu ordenador está activo'],
  id: ['Buat rutinitas', 'Jeda rutinitas', 'Lanjutkan rutinitas', 'Hapus rutinitas', 'Jadwal', 'Perintah', 'Agen', 'Model', 'Rutinitas ini hanya berjalan saat Tovu terbuka dan komputer Anda aktif'],
  de: ['Routine erstellen', 'Routine pausieren', 'Routine fortsetzen', 'Routine löschen', 'Zeitplan', 'Anweisung', 'Agent', 'Modell', 'Diese Routine läuft nur, solange Tovu geöffnet und Ihr Computer eingeschaltet ist'],
  'zh-CN': ['创建例行任务', '暂停例行任务', '恢复例行任务', '删除例行任务', '计划', '提示词', '智能体', '模型', '此例行任务仅在 Tovu 打开且电脑处于唤醒状态时运行'],
  'zh-TW': ['建立例行任務', '暫停例行任務', '恢復例行任務', '刪除例行任務', '排程', '提示詞', '智慧代理', '模型', '此例行任務僅在 Tovu 開啟且電腦處於喚醒狀態時執行'],
  'pt-BR': ['Criar rotina', 'Pausar rotina', 'Retomar rotina', 'Excluir rotina', 'Agendamento', 'Instrução', 'Agente', 'Modelo', 'Esta rotina só é executada enquanto o Tovu estiver aberto e o computador estiver ativo'],
  ru: ['Создать рутину', 'Приостановить рутину', 'Возобновить рутину', 'Удалить рутину', 'Расписание', 'Запрос', 'Агент', 'Модель', 'Эта рутина выполняется, только пока Tovu открыт, а компьютер не спит'],
  fa: ['ایجاد روتین', 'توقف روتین', 'ازسرگیری روتین', 'حذف روتین', 'زمان‌بندی', 'دستور', 'عامل', 'مدل', 'این روتین فقط وقتی اجرا می‌شود که Tovu باز باشد و رایانه شما بیدار باشد'],
  ar: ['إنشاء روتين', 'إيقاف الروتين مؤقتًا', 'استئناف الروتين', 'حذف الروتين', 'الجدول', 'الموجّه', 'الوكيل', 'النموذج', 'يعمل هذا الروتين فقط أثناء فتح Tovu وبقاء جهازك نشطًا'],
  ja: ['ルーティンを作成', 'ルーティンを一時停止', 'ルーティンを再開', 'ルーティンを削除', 'スケジュール', 'プロンプト', 'エージェント', 'モデル', 'このルーティンは、Tovu が開いていてコンピューターがスリープしていない間だけ実行されます'],
  ko: ['루틴 만들기', '루틴 일시중지', '루틴 다시 시작', '루틴 삭제', '일정', '프롬프트', '에이전트', '모델', '이 루틴은 Tovu가 열려 있고 컴퓨터가 절전 상태가 아닐 때만 실행됩니다'],
  pl: ['Utwórz rutynę', 'Wstrzymaj rutynę', 'Wznów rutynę', 'Usuń rutynę', 'Harmonogram', 'Polecenie', 'Agent', 'Model', 'Ta rutyna działa tylko wtedy, gdy Tovu jest otwarte, a komputer nie śpi'],
  hu: ['Rutin létrehozása', 'Rutin szüneteltetése', 'Rutin folytatása', 'Rutin törlése', 'Ütemezés', 'Utasítás', 'Ügynök', 'Modell', 'Ez a rutin csak akkor fut, amíg a Tovu meg van nyitva, és a számítógép ébren van'],
  fr: ['Créer la routine', 'Mettre la routine en pause', 'Reprendre la routine', 'Supprimer la routine', 'Planification', 'Instruction', 'Agent', 'Modèle', 'Cette routine ne s’exécute que lorsque Tovu est ouvert et que votre ordinateur est actif'],
  uk: ['Створити рутину', 'Призупинити рутину', 'Відновити рутину', 'Видалити рутину', 'Розклад', 'Запит', 'Агент', 'Модель', 'Ця рутина виконується, лише поки Tovu відкрито, а комп’ютер не спить'],
  tr: ['Rutin oluştur', 'Rutini duraklat', 'Rutine devam et', 'Rutini sil', 'Zamanlama', 'İstem', 'Ajan', 'Model', 'Bu rutin yalnızca Tovu açıkken ve bilgisayarınız uyanıkken çalışır'],
  th: ['สร้างรูทีน', 'หยุดรูทีนชั่วคราว', 'เริ่มรูทีนต่อ', 'ลบรูทีน', 'กำหนดเวลา', 'พรอมต์', 'เอเจนต์', 'โมเดล', 'รูทีนนี้ทำงานเฉพาะขณะที่ Tovu เปิดอยู่และคอมพิวเตอร์ของคุณไม่อยู่ในโหมดสลีป'],
  it: ['Crea routine', 'Metti in pausa la routine', 'Riprendi la routine', 'Elimina routine', 'Pianificazione', 'Istruzione', 'Agente', 'Modello', 'Questa routine viene eseguita solo mentre Tovu è aperto e il computer è attivo'],
  hi: ['रूटीन बनाएँ', 'रूटीन रोकें', 'रूटीन फिर शुरू करें', 'रूटीन हटाएँ', 'शेड्यूल', 'प्रॉम्प्ट', 'एजेंट', 'मॉडल', 'यह रूटीन केवल तब चलता है जब Tovu खुला हो और आपका कंप्यूटर चालू हो'],
  ur: ['روٹین بنائیں', 'روٹین روکیں', 'روٹین دوبارہ شروع کریں', 'روٹین حذف کریں', 'شیڈول', 'پرامپٹ', 'ایجنٹ', 'ماڈل', 'یہ روٹین صرف اسی وقت چلتی ہے جب Tovu کھلا ہو اور آپ کا کمپیوٹر جاگ رہا ہو'],
  bn: ['রুটিন তৈরি করুন', 'রুটিন বিরতি দিন', 'রুটিন আবার চালু করুন', 'রুটিন মুছুন', 'সময়সূচি', 'প্রম্পট', 'এজেন্ট', 'মডেল', 'এই রুটিন শুধু তখনই চলে যখন Tovu খোলা থাকে এবং আপনার কম্পিউটার জাগ্রত থাকে'],
} as const satisfies Record<keyof typeof APPROVAL_COPY, readonly string[]>;

/** Translate approval chrome and registered catalog copy, falling back to English or the key.
 * @complexity O(k) time for bounded copy-key lookup, O(1) space; no effects. */
export function approvalText({ locale, key }: { locale: string; key: string }, _optional = {}): string {
  const schemaCopy = Object.hasOwn(SCHEMA_TITLE_COPY, key) ? SCHEMA_TITLE_COPY[key] : undefined;
  if (schemaCopy) return schemaCopy[locale] ?? schemaCopy.en!;
  return familyText({ locale, key });
}

/** Chrome, action and routine copy share one lookup: the first family that knows the key wins, an unknown key stays verbatim. */
function familyText({ locale, key }: { locale: string; key: string }): string {
  const copy = APPROVAL_COPY[locale as keyof typeof APPROVAL_COPY] ?? APPROVAL_COPY.en;
  const actionCopy = ACTION_COPY[locale as keyof typeof ACTION_COPY] ?? ACTION_COPY.en;
  const routineCopy = ROUTINE_COPY[locale as keyof typeof ROUTINE_COPY] ?? ROUTINE_COPY.en;
  // One table per key family; the first family that knows the key wins, an unknown key stays verbatim.
  const families: readonly (readonly [readonly string[], readonly string[]])[] = [[copy, KEYS], [actionCopy, ACTION_KEYS], [routineCopy, ROUTINE_KEYS]];
  for (const [values, keys] of families) {
    const index = keys.indexOf(key);
    if (index >= 0) return values[index] ?? key;
  }
  return key;
}
