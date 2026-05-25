// Qaff Studio — i18n Support (English + Arabic)

export type Locale = 'en' | 'ar'

const translations = {
    en: {
        // Files Manager
        videos: 'Files',
        videosManager: 'File Manager',
        selectVideoForSlot: 'Select Video for Slot',
        browseAndSelect: 'Browse and select a video file for streaming',
        name: 'Name',
        size: 'Size',
        date: 'Date',
        folder: 'Folder',
        actions: 'Actions',
        rename: 'Rename',
        move: 'Move',
        delete: 'Delete',
        copy: 'Copy',
        select: 'Select',
        cancel: 'Cancel',
        confirm: 'Confirm',
        createFolder: 'Create Folder',
        newFolder: 'New Folder',
        folderName: 'Folder Name',
        enterFolderName: 'Enter folder name',
        moveToFolder: 'Move to Folder',
        selectFolder: 'Select target folder',
        rootFolder: 'Root (Main)',
        noVideosFound: 'No files found',
        uploadVideo: 'Upload File',
        uploadFolder: 'Upload Folder',
        uploading: 'Uploading...',
        uploadSuccess: 'Upload successful',
        uploadFailed: 'Upload failed',

        // Rename
        renameItem: 'Rename',
        enterNewName: 'Enter new name (without extension)',
        extensionLocked: 'Extension cannot be changed',
        extensionChangeBlocked: 'Extension change is not allowed. The original extension will be kept.',
        renameFailed: 'Failed to rename',
        renameSuccess: 'Renamed successfully',

        // Delete
        deleteConfirm: 'Are you sure you want to delete',
        deleteWarning: 'This action cannot be undone.',
        deleteFailed: 'Failed to delete',
        deleteSuccess: 'Deleted successfully',

        // Move
        moveFailed: 'Failed to move',
        moveSuccess: 'Moved successfully',

        // Download
        downloadFromUrl: 'Download from URL',
        enterUrl: 'Enter video URL (direct link...)',
        fileName: 'File name',
        downloading: 'Downloading...',
        downloadStarted: 'Download started in background',
        downloadComplete: 'Download complete',
        downloadFailed: 'Download failed',

        // Storage
        storage: 'Storage',
        used: 'Used',
        free: 'Free',

        // General
        refresh: 'Refresh',
        close: 'Close',
        back: 'Back',
        root: 'Root',
        items: 'items',
        loading: 'Loading...',
        error: 'Error',
        success: 'Success',
        clear: 'Clear',

        // Header
        diagnostics: 'Diagnostics',
        active: 'Active',
        scheduled: 'Scheduled',
        slots: 'Live Streams Management',
        startAll: 'Start All',
        stopAll: 'Stop All',
        setTimeAll: 'Set Time All',
        dailyAll: 'Daily All',
        hourlyAll: '15-Min Repeat All',
        resetAll: 'Reset All',
        autoSave: 'Auto-Save',

        colDetails: 'Stream Name',
        colOutput: 'Output',
        colPlatform: 'Platform',
        colOutputSettings: 'Settings',
        colStreamKey: 'Stream Key',
        colFilePath: 'File Path',
        colSchedule: 'Schedule',
        colStart: 'Start',
        colAmPm: 'AM/PM',
        colStop: 'Stop',
        colNextRun: 'Next Run',
        colDaily: 'Daily',
        colWeekly: 'Weekly',
        lblDaily: 'Daily',
        lblWeekly: 'Weekly',
        lblHourly: '20-Min Repeat',
        colActions: 'Actions',
        colStatus: 'Status',
        colReset: 'Reset',
        colLogs: 'Logs',
        colFolder: 'Folder',
        lblNext12: 'Set to Next 12',
        lblScheduling: 'Scheduling',
        btnAM: 'AM',
        btnPM: 'PM',

        startStream: 'Start Stream',
        stopStream: 'Stop Stream',
        scheduleStream: 'Schedule Stream',
        resetSlot: 'Reset Slot',

        // Output dropdown options
        optYouTube: 'YouTube',
        optFacebook: 'Facebook',
        optTikTok: 'TikTok',
        optCustom: 'Custom',

        // Placeholders
        phRtmpServer: 'rtmp://your-rtmp-url',
        phStreamKey: 'Stream Key',
        phFilePath: 'path/to/video.mp4',
        phTikTokServer: 'rtmp://push.tiktokcdn.com/stream',
        phCustomServer: 'rtmp://your-server-url',

        // Output Settings labels
        rtmpBaseLabel: 'RTMP Base (read-only)',
        fullRtmpUrl: 'Full RTMP URL',

        // Copy buttons
        copyPath: 'Copy Path',
        copyKey: 'Copy Key',
        copyRtmp: 'Copy RTMP URL',
        copied: 'Copied!',

        // Stop Group Dropdowns
        chooseHour: 'Hour',
        chooseMin: 'Min',

        // Footer
        footerText: 'Qaff Digital © - For Sales',
        footerContact: '01202406944',
        footerMoreInfo: 'For more, please visit our website',
        footerLink: 'https://streamer.qaff.net',

        // Theme & Confirms
        theme: 'Theme',
        darkMode: 'Dark Mode',
        lightMode: 'Light Mode',
        demoNoteText: 'Demo Password: test (This interface is for testing only)',
        scheduleAllExt: 'Start Schedule All',
        confirmStartAll: 'Start ALL configured slots?',
        confirmScheduleAll: 'Schedule ALL configured slots based on their set times?',
        confirmStopAll: 'Stop ALL running streams?',
        confirmSetTimeAll: 'Set alternating schedule for ALL empty slots?',
        confirmDailyAll: 'Toggle Daily for ALL slots?',
        confirmHourlyAll: 'Toggle 15-minute automatic repetition for all slots?',
        confirmResetAll: 'Reset schedule data for ALL slots?',
        logs: 'Logs',

        // Settings & Timezone
        timezoneServer: 'Timezone',
        timezoneWarning: 'Changing the timezone affects future scheduled streams only. Currently running streams are not affected.',
        timezoneCurrent: 'Current Timezone',
        timezoneNew: 'New Timezone',
        timezoneLoading: 'Loading...',
        timezoneSave: 'Save',

        optional: 'Stream Name',
        timezoneBtn: 'Timezone',

        // Language
        language: 'Language',
        english: 'English',
        arabic: 'العربية',
        logout: 'Logout',

        // Login
        loginTitle: 'Enter password to continue',
        usernamePlaceholder: 'Username',
        roleAdmin: 'Administrator',
        roleClient: 'Client',
        passwordPlaceholder: 'Password',
        loginButton: 'Login',
        loggingIn: 'Verifying...',
        invalidPassword: 'Invalid password',
        connectionError: 'Connection error — check your network',

        // Video Manager Actions
        recommendedOutput: 'Recommended Output',

        // Validation & Status Messages
        streamKeyRequired: 'Stream key is required.',
        invalidRtmpUrl: 'Invalid RTMP URL. Must start with rtmp:// or rtmps://',
        channelSaved: 'Channel saved successfully.',
        streamFailed: 'Failed to start stream.',
        streamRunning: 'Streaming is running.',
        fileNotFound: 'File not found.',
        outputIncomplete: 'Output configuration is incomplete.',

        // DateTimePicker
        now: 'Now',
        pickDateTime: 'Pick date and time',

        // Logs Panel
        ramUsage: 'RAM',
        dataRate: 'Rate',
        noLogs: 'No logs yet',
        channelLogs: 'Channel Logs',
        liveStats: 'Live Stats',
        renewalPrefix: 'Renewal in',
        renewalDaysSuffix: 'days',
        renewalExpired: 'Subscription Expired',
        done: 'Done',
        resetQuestionRequired: 'You must enter the reset question to change the password',
        advancedSettings: 'Advanced Stream Settings',
        audioControls: 'Audio Settings',
        videoOverlay: 'Video Overlay',
        muteOriginalAudio: 'Mute Source Stream Audio',
        audioVolumeLabel: 'Output Audio Volume',
        bgMusicFile: 'Background Audio Loop File',
        noBgMusic: 'No Background Audio Selected',
        selectAudioFile: 'Select Audio File',
        bannerTextLabel: 'Bottom Banner Text',
        bannerTextPlaceholder: 'Enter the text to display at the bottom of the video',
        enableBannerText: 'Enable Bottom Banner Text',
        saveSettings: 'Save Settings',
        settingsSaved: 'Settings saved successfully',
        // Pre-Stop Swap Video
        preStopSwap: 'Pre-Stop Swap Video',
        preStopSwapDesc: 'Select a video to automatically switch to 2 minutes before the scheduled stop time.',
        enablePreStopSwap: 'Enable Pre-Stop Swap',
        enablePreStopSwapDesc: 'Automatically switch to a pre-recorded video 2 minutes before the broadcast ends, replacing the live source and overlays.',
        swapVideoFile: 'Swap Video File',
        noSwapVideoSelected: 'No Swap Video Selected',
        selectSwapVideo: 'Select Swap Video File',
        swapVideoActive: 'Pre-stop swap is now active',
        swapVideoNoStop: 'No scheduled stop time set — swap has no trigger.',
    },
    ar: {
        // Files Manager
        videos: 'الملفات',
        videosManager: 'إدارة الملفات',
        selectVideoForSlot: 'اختيار ملف للقناة',
        browseAndSelect: 'تصفح واختر ملفاً للبث',
        name: 'الاسم',
        size: 'الحجم',
        date: 'التاريخ',
        folder: 'المجلد',
        actions: 'الإجراءات',
        rename: 'إعادة تسمية',
        move: 'نقل',
        delete: 'حذف',
        copy: 'نسخ',
        select: 'اختيار',
        cancel: 'إلغاء',
        confirm: 'تأكيد',
        createFolder: 'إنشاء مجلد',
        newFolder: 'مجلد جديد',
        folderName: 'اسم المجلد',
        enterFolderName: 'أدخل اسم المجلد',
        moveToFolder: 'نقل إلى مجلد',
        selectFolder: 'اختر المجلد المستهدف',
        rootFolder: 'الجذر (الرئيسي)',
        noVideosFound: 'لا توجد ملفات',
        uploadVideo: 'رفع ملف',
        uploadFolder: 'رفع مجلد',
        uploading: 'جاري الرفع...',
        uploadSuccess: 'تم الرفع بنجاح',
        uploadFailed: 'فشل الرفع',

        // Rename
        renameItem: 'إعادة التسمية',
        enterNewName: 'أدخل الاسم الجديد (بدون الامتداد)',
        extensionLocked: 'لا يمكن تغيير الامتداد',
        extensionChangeBlocked: 'تغيير الامتداد غير مسموح. سيتم الاحتفاظ بالامتداد الأصلي.',
        renameFailed: 'فشل في إعادة التسمية',
        renameSuccess: 'تمت إعادة التسمية بنجاح',

        // Delete
        deleteConfirm: 'هل أنت متأكد من حذف',
        deleteWarning: 'لا يمكن التراجع عن هذا الإجراء.',
        deleteFailed: 'فشل في الحذف',
        deleteSuccess: 'تم الحذف بنجاح',

        // Move
        moveFailed: 'فشل في النقل',
        moveSuccess: 'تم النقل بنجاح',

        // Download
        downloadFromUrl: 'تحميل من رابط',
        enterUrl: 'أدخل رابط الفيديو (رابط مباشر...)',
        fileName: 'اسم الملف',
        downloading: 'جاري التحميل...',
        downloadStarted: 'بدأ التحميل في الخلفية',
        downloadComplete: 'اكتمل التحميل',
        downloadFailed: 'فشل التحميل',

        // Storage
        storage: 'التخزين',
        used: 'مستخدم',
        free: 'متاح',

        // General
        refresh: 'تحديث',
        close: 'إغلاق',
        back: 'رجوع',
        root: 'الجذر',
        items: 'عناصر',
        loading: 'جاري التحميل...',
        error: 'خطأ',
        success: 'نجاح',
        clear: 'مسح',

        // Header
        diagnostics: 'التشخيص',
        active: 'نشط',
        scheduled: 'مجدول',
        slots: 'إدارة البثوث المباشرة',
        startAll: 'تشغيل الكل',
        stopAll: 'إيقاف الكل',
        setTimeAll: 'ضبط الوقت للكل',
        dailyAll: 'يومي للكل',
        hourlyAll: '15 دقيقة للكل',
        resetAll: 'إعادة تعيين الكل',
        autoSave: 'حفظ تلقائي',

        colDetails: 'إسم البث',
        colOutput: 'الإخراج',
        colPlatform: 'المنصة',
        colOutputSettings: 'الإعدادات',
        colStreamKey: 'مفتاح البث',
        colFilePath: 'مسار الملف',
        colSchedule: 'الجدولة',
        colStart: 'البدء',
        colAmPm: 'ص/م',
        colStop: 'الإيقاف',
        colNextRun: 'التشغيل التالي',
        colDaily: 'يومي',
        colWeekly: 'أسبوعي',
        lblDaily: 'يومياً',
        lblWeekly: 'إسبوعياً',
        lblHourly: 'تكرار 20 دقيقة',
        colActions: 'الإجراءات',
        colStatus: 'الحالة',
        colReset: 'إعادة',
        colLogs: 'السجلات',
        colFolder: 'المجلد',
        lblNext12: 'ضبط لأقرب 12',
        lblScheduling: 'جدولة',
        btnAM: 'ص',
        btnPM: 'م',

        startStream: 'بدء البث',
        stopStream: 'إيقاف البث',
        scheduleStream: 'جدولة البث',
        resetSlot: 'إعادة تعيين القناة',

        // Output dropdown options
        optYouTube: 'يوتيوب',
        optFacebook: 'فيسبوك',
        optTikTok: 'تيك توك',
        optCustom: 'مخصص',

        // Placeholders
        phRtmpServer: 'rtmp://رابط-rtmp-الخاص-بك',
        phStreamKey: 'مفتاح البث',
        phFilePath: 'مسار/الفيديو.mp4',
        phTikTokServer: 'rtmp://push.tiktokcdn.com/stream',
        phCustomServer: 'rtmp://رابط-السيرفر-الخاص-بك',

        // Output Settings labels
        rtmpBaseLabel: 'رابط RTMP الثابت (للقراءة فقط)',
        fullRtmpUrl: 'رابط RTMP الكامل',

        // Copy buttons
        copyPath: 'نسخ المسار',
        copyKey: 'نسخ المفتاح',
        copyRtmp: 'نسخ رابط RTMP',
        copied: 'تم النسخ!',

        // Stop Group Dropdowns
        chooseHour: 'الساعة',
        chooseMin: 'الدقيقة',

        // Footer
        footerText: 'قاف ديجيتال © للمبيعات تواصل معنا',
        footerContact: '01202406944',
        footerMoreInfo: 'للمزيد يرجى زيارة موقعنا',
        footerLink: 'https://streamer.qaff.net',

        // Theme & Confirms
        theme: 'المظهر',
        darkMode: 'الوضع الليلي',
        lightMode: 'الوضع الساطع',
        demoNoteText: 'كلمة المرور التجريبية: test (هذه الواجهة للاختبار فقط)',
        scheduleAllExt: 'تشغيل جدولة الكل',
        confirmStartAll: 'هل تريد تشغيل جميع القنوات المجهزة بالبث الآن؟',
        confirmScheduleAll: 'هل تريد جدولة كل القنوات المجهزة بناءً على أوقاتها المحددة؟',
        confirmStopAll: 'هل أنت متأكد من إيقاف جميع عمليات البث الحالية المشغلة؟',
        confirmSetTimeAll: 'هل تريد ضبط أوقات تبادلية لجميع القنوات الفارغة؟',
        confirmDailyAll: 'هل تريد تفعيل/إلغاء التكرار اليومي لجميع القنوات؟',
        confirmHourlyAll: 'هل تريد تفعيل/إلغاء التكرار كل ربع ساعة لجميع القنوات؟',
        confirmResetAll: 'تحذير: هل أنت متأكد من إعادة تعيين ومسح بيانات الجدولة لجميع القنوات؟',
        logs: 'السجلات',

        // Settings & Timezone
        timezoneServer: 'المنطقة الزمنية',
        timezoneWarning: 'تغيير المنطقة الزمنية يؤثر على جدولة البثوث المستقبلية فقط، ولن يؤثر على البثوث الجارية حالياً.',
        timezoneCurrent: 'المنطقة الزمنية الحالية',
        timezoneNew: 'المنطقة الزمنية الجديدة',
        timezoneLoading: 'جاري التحميل...',
        timezoneSave: 'حفظ',

        optional: 'إسم البث',
        timezoneBtn: 'المنطقة الزمنية',

        // Language
        language: 'اللغة',
        english: 'English',
        arabic: 'العربية',
        logout: 'تسجيل الخروج',

        // Login
        loginTitle: 'أدخل كلمة المرور للمتابعة',
        usernamePlaceholder: 'اسم المستخدم',
        roleAdmin: 'مدير النظام',
        roleClient: 'عميل',
        passwordPlaceholder: 'كلمة المرور',
        loginButton: 'دخول',
        loggingIn: 'جارٍ التحقق...',
        invalidPassword: 'كلمة المرور غير صحيحة',
        connectionError: 'حدث خطأ — تحقق من الاتصال',

        // Video Manager Actions
        recommendedOutput: 'الإخراج الموصى به',

        // Validation & Status Messages
        streamKeyRequired: 'مفتاح البث مطلوب.',
        invalidRtmpUrl: 'رابط RTMP غير صالح. يجب أن يبدأ بـ rtmp:// أو rtmps://',
        channelSaved: 'تم حفظ القناة بنجاح.',
        streamFailed: 'تعذّر بدء البث.',
        streamRunning: 'البث يعمل الآن.',
        fileNotFound: 'لم يتم العثور على الملف.',
        outputIncomplete: 'إعدادات الإخراج غير مكتملة.',

        // DateTimePicker
        now: 'الآن',
        pickDateTime: 'اختر التاريخ والوقت',

        // Logs Panel
        ramUsage: 'ذاكرة',
        dataRate: 'معدل',
        noLogs: 'لا توجد سجلات بعد',
        channelLogs: 'سجلات القناة',
        liveStats: 'إحصائيات مباشرة',
        renewalPrefix: 'متبقي',
        renewalDaysSuffix: 'أيام',
        renewalExpired: 'انتهى الاشتراك',
        done: 'تم',
        resetQuestionRequired: 'يجب إدخال سؤال التعيين لتغيير كلمة المرور',
        advancedSettings: 'إعدادات البث المتقدمة',
        audioControls: 'إعدادات الصوت',
        videoOverlay: 'إعدادات مظهر الفيديو',
        muteOriginalAudio: 'كتم الصوت الوارد من البث الرئيسي',
        audioVolumeLabel: 'درجة صوت البث النهائي',
        bgMusicFile: 'ملف صوتي خلفي متكرر',
        noBgMusic: 'لم يتم اختيار ملف صوتي خلفي',
        selectAudioFile: 'اختيار ملف صوتي',
        bannerTextLabel: 'نص الشريط الإعلاني السفلي',
        bannerTextPlaceholder: 'اكتب النص المراد إظهاره أسفل الفيديو',
        enableBannerText: 'تفعيل إظهار الشريط الإعلاني السفلي',
        saveSettings: 'حفظ الإعدادات',
        settingsSaved: 'تم حفظ الإعدادات بنجاح',
        // Pre-Stop Swap Video
        preStopSwap: 'فيديو التبديل قبل الإيقاف',
        preStopSwapDesc: 'اختر فيديو للتبديل إليه تلقائياً قبل دقيقتين من موعد الإيقاف المجدول.',
        enablePreStopSwap: 'تفعيل التبديل قبل الإيقاف',
        enablePreStopSwapDesc: 'يتم التبديل تلقائياً إلى فيديو مسجل قبل دقيقتين من انتهاء البث، مع إلغاء المصدر المباشر والإعدادات الحالية.',
        swapVideoFile: 'ملف فيديو التبديل',
        noSwapVideoSelected: 'لم يتم اختيار فيديو تبديل',
        selectSwapVideo: 'اختر ملف فيديو التبديل',
        swapVideoActive: 'تم تفعيل التبديل قبل الإيقاف',
        swapVideoNoStop: 'لا يوجد وقت إيقاف مجدول — لن يتم تفعيل التبديل.',
    }
} as const

export type TranslationKey = keyof typeof translations.en

let currentLocale: Locale = 'ar'

export function setLocale(locale: Locale) {
    currentLocale = locale
    if (typeof window !== 'undefined') {
        localStorage.setItem('qaff-locale', locale)
    }
}

export function getLocale(): Locale {
    if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('qaff-locale') as Locale | null
        if (saved && (saved === 'en' || saved === 'ar')) {
            currentLocale = saved
        }
    }
    return currentLocale
}

export function t(key: TranslationKey): string {
    return translations[currentLocale]?.[key] || translations.en[key] || key
}

export function isRTL(): boolean {
    return currentLocale === 'ar'
}
