module.exports = {
   // ========== إعدادات المالك ==========
    ownerId: '1379984936366374932',// ايدي الاونر الرئيسي
    ownerIds: ['1379984936366374932'],// ايدي اونرات
    ownerEmail: 'jaamdev@hosting.net', // الإيميل الخاص بالمالك للتسجيل العادي
    // اعدادات ادمن
    adminEmails: ['usemexev60@gmail.com'],// ايميل الادمن
    adminIds: ['1379984936366374932'],// ضع أيدي الديسكورد حقك هنا
    
    // ========== قاعدة البيانات ==========
    mongoURI: 'mongodb+srv://fqjfqfqf1ac:motazmotaz@cluster0.mscmd5f.mongodb.net/?retryWrites=true&w=majority',// رابط مونجو
    
    // ========== إعدادات ديسكورد ==========
    discord: {
        clientID: '1556566591058083860',// ايدي البوت
        clientSecret: '-B-1Y6cjqwtOjohHiF8HGJ36jTYZCDAr',// سيكريت البوت
        callbackURL: 'http://lou.hidencloud.com:24595/auth/discord/callback'
    },
    
    // ========== نظام العملات ==========
    defaultCoins: 0,
    normalRegisterCoins: 0,
    defaultMaxServers: 5,
    
    // ========== إعدادات المنافذ ==========
    portRange: { 
        start: 10000,  
        end: 65535     
    },
    // ========== إعدادات البانل ==========
    panelPort: 24595,
    sessionSecret: 'mD8#xP92!kL5@vQ7$rN1zA4',
    siteName: 'J1 Hosting',
    siteUrl: 'http://lou.hidencloud.com:24595',
    
    // ========== حدود الرفع ==========
    maxUploadSize: 4024 * 4024 * 4024, // 100MB
    
    // ========== المجلدات ==========
    serversPath: './servers',
    templatesPath: './templates',
    
    // ========== أنواع الملفات المسموح بتحريرها ==========
    editableExtensions: ['.js', '.json', '.txt', '.env', '.md']
};