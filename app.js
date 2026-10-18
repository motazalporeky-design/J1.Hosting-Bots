const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs-extra');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');
const { exec } = require('child_process');
const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder
} = require('discord.js');

const config = require('./config');
const User = require('./models/User');
const Server = require('./models/Server');
const Transaction = require('./models/Transaction');
const { processManager, consoleManager } = require('./services/processManager');
const FileManager = require('./services/fileManager');
const auth = require('./middleware/auth');
const portManager = require('./services/portManager');

const apiV1Router = require('./routes/api/v1');
const apiV2Router = require('./routes/api/v2');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ==========================================
// 📋 دالة إنشاء بنل الاستضافات
// ==========================================
function createHostingPanel() {

    const embed = new EmbedBuilder()
        .setTitle(" Hosting Panel")
        .setDescription(
            "1 عملة  \n\n" + 
            "1m <:probot_:1559208554739535922> \n\n" +
            "7 عملات \n\n" +
            "1 (<:libyana:1556551493694394418> / <:almadarly:1556551354774716417>)"
        )
        .setColor("#2B2B2B")
        .setImage("https://cdn.discordapp.com/attachments/1553835656382251210/1556631494901112853/Annotation_2026-10-05_094249.png?backend=b2&ex=6ac4dd8d&is=6ac38c0d&hm=ff172b367985388ee64ac93386ff531fff60f235d4f10ebae984fa4d5e3d7297")
        .setFooter({
            text: "Hosting Panel • اختر الخطة المناسبة لك"
        });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("hosting_plans")
        .setPlaceholder(" اختر مواصفات الاستضافة")
        .addOptions(
            {
                label: "Weekly Plan",
                description: "استضافة لمدة أسبوع",
                value: "weekly",
                emoji: "<:fabrandsnode:1556553359991775272>"
            },
            {
                label: "Biweekly Plan",
                description: "استضافة لمدة أسبوعين",
                value: "biweekly",
                emoji: "<:fabrandsnode:1556553359991775272>"
            },
            {
                label: "Monthly Plan",
                description: "استضافة لمدة شهر",
                value: "monthly",
                emoji: "<:fabrandsnode:1556553359991775272>"
            }
        );

    const selectRow = new ActionRowBuilder()
        .addComponents(selectMenu);

    const buttonRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel(" إنشاء حساب")
                .setStyle(ButtonStyle.Link)
                .setURL("https://j1host.hidenplay.net/register"),

            new ButtonBuilder()
                .setLabel(" لوحة التحكم")
                .setStyle(ButtonStyle.Link)
                .setURL("https://j1host.hidenplay.net/dashboard"),

            new ButtonBuilder()
                .setLabel(" شراء هوست")
                .setStyle(ButtonStyle.Link)
                .setURL("https://j1host.hidenplay.net/servers/create")
        );

    return {
        embeds: [embed],
        components: [selectRow, buttonRow]
    };
}

// ==========================================
// 📌 ID الكاتيجوري
// ==========================================
const PANEL_CATEGORY_ID = "1556159909442228285";


// ==========================================
// 🤖 عند جاهزية البوت
// ==========================================
client.once("clientReady", async () => {
    console.log(`🤖 Bot Online: ${client.user.tag}`);

    client.user.setPresence({
        activities: [
            {
                name: "J1 Studio Hosting bots !",
                type: 1,
                url: "https://www.twitch.tv/j1studio"
            }
        ],
        status: "online"
    });

    // ==========================================
    // 🚀 إرسال البنل في القنوات النصية الموجودة مسبقاً
    // ==========================================
    try {

        const category = await client.channels.fetch(PANEL_CATEGORY_ID).catch(() => null);

        if (!category) {
            return;
        }

        // جلب كل قنوات السيرفر
        const allChannels = await category.guild.channels.fetch();

        // فلترة القنوات النصية داخل الكاتيجوري
        const textChannels = allChannels.filter(
            ch => ch.parentId === PANEL_CATEGORY_ID && ch.type === 0
        );

        if (textChannels.size === 0) {
            return;
        }

        // إرسال البنل في كل قناة نصية موجودة
        for (const [id, channel] of textChannels) {
            try {
                await channel.send(createHostingPanel());
            } catch (err) {
            }
        }

    } catch (err) {
        console.error("❌ خطأ في إرسال البنل التلقائي:", err);
    }
});


// ==========================================
// 🆕 عند إنشاء قناة جديدة في الكاتيجوري
// ==========================================
client.on("channelCreate", async (channel) => {

    try {

        // تحقق أنه قناة نصية داخل الكاتيجوري المحدد
        if (channel.type !== 0) return;                       // ليست نصية
        if (channel.parentId !== PANEL_CATEGORY_ID) return;   // ليست داخل الكاتيجوري
        // انتظار ثانية لضمان جاهزية القناة
        await new Promise(r => setTimeout(r, 1000));

        // فحص الصلاحيات
        const me = channel.guild.members.me;
        const canSend = channel.permissionsFor(me)?.has("SendMessages");

        if (!canSend) {
            return;
        }

        // إرسال البنل
        await channel.send(createHostingPanel());
    } catch (err) {
        console.error("❌ خطأ في إرسال البنل عند إنشاء قناة:", err);
    }
});


client.login(process.env.DISCORD_TOKEN.trim());

const TRANSFER_CHANNEL_ID = ""; // قناة التحويلات

// ==========================
// 💰 أوامر العملات
// ==========================
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const args = content.split(/\s+/);
    const command = args[0].toLowerCase();

    // =========================
    // 💰 أمر شراء العملات +buy
    // =========================
    if (command === "+buy") {

        const coins = parseInt(args[1]);

        if (!coins || coins <= 0) {
            return message.reply("❌ اكتب عدد صحيح من العملات\nمثال: `+buy 5`");
        }

        const coinPrice = 1000000;

        // السعر الأساسي
        const netPrice = coins * coinPrice;

        // إضافة ضريبة 5%
        const totalPrice = Math.ceil(netPrice / 0.95);

        return message.reply(
            `💰 **شراء العملات**\n\n` +
            `العملات: **${coins}**\n` +
            `المبلغ المطلوب: **${totalPrice.toLocaleString()}**\n\n` +
            `قم بالتحويل إلى:\n` +
            `\`c <@${config.ownerId}> ${totalPrice}\`\n\n` +
            `بعد إتمام التحويل، انتظر تأكيد الإدارة.`
        );
    }

// =========================
// 👑 أمر إضافة العملات +add
// =========================
if (command === "+add") {

    // المالك فقط
    if (message.author.id !== config.ownerId) {
        return message.reply("❌ هذا الأمر للمالك فقط.");
    }

    // التحقق من الاستخدام
    if (!args[1] || !args[2]) {
        return message.reply(
            "❌ الاستخدام الصحيح:\n\n" +
            "`+add @user 5`\n" +
            "`+add 123456789012345678 5`\n" +
            "`+add username 5`\n" +
            "`+add email@example.com 5`"
        );
    }

    let searchUser = args[1];
    const coinsToAdd = parseInt(args[2]);

    if (!coinsToAdd || coinsToAdd <= 0) {
        return message.reply("❌ عدد العملات يجب أن يكون أكبر من 0.");
    }

    try {

        let user = null;

        // =========================
        // 🔎 تنظيف المدخلات
        // =========================

        // إزالة المنشن إن وجد  <@123456789>
        const mentionMatch = searchUser.match(/^<@!?(\d+)>$/);
        if (mentionMatch) {
            searchUser = mentionMatch[1];
        }

        // =========================
        // 🔎 البحث في قاعدة البيانات
        // =========================

        // 1️⃣ البحث بالـ Discord ID
        if (/^\d{17,20}$/.test(searchUser)) {

            user = await User.findOne({ discordId: searchUser });

        }

        // 2️⃣ البحث بالبريد الإلكتروني
        if (!user && searchUser.includes("@")) {

            user = await User.findOne({
                email: searchUser.toLowerCase()
            });

        }

        // 3️⃣ البحث بالـ Username في الموقع
        if (!user) {

            user = await User.findOne({
                username: {
                    $regex: `^${searchUser}$`,
                    $options: "i"
                }
            });

        }

        // 4️⃣ البحث في Discord بالاسم (كحل أخير)
        if (!user) {

            const discordUser = client.users.cache.find(
                u =>
                    u.username.toLowerCase() === searchUser.toLowerCase() ||
                    (u.globalName &&
                        u.globalName.toLowerCase() === searchUser.toLowerCase())
            );

            if (discordUser) {
                user = await User.findOne({ discordId: discordUser.id });
            }
        }

        // =========================
        // ❌ المستخدم غير موجود
        // =========================
        if (!user) {
            return message.reply(
                `❌ لم يتم العثور على المستخدم:\n\`${searchUser}\`\n\n` +
                `تأكد من كتابة التاق أو اليوزر أو البريد بشكل صحيح.`
            );
        }

        // =========================
        // 💰 إضافة العملات
        // =========================
        user.coins = (user.coins || 0) + coinsToAdd;
        await user.save();
        // =========================
        // 👤 محاولة الحصول على اسم Discord
        // =========================
        let displayName = user.username;

        if (user.discordId) {
            try {
                const discordUser = await client.users.fetch(user.discordId);
                if (discordUser) displayName = discordUser.username;
            } catch (err) {}
        }

        // =========================
        // ✅ رسالة النجاح
        // =========================
        return message.reply(
            ` **تمت إضافة العملات بنجاح**\n\n` +
            ` المستخدم: **${displayName}**\n` +
            ` Discord ID: \`${user.discordId || 'غير مرتبط'}\`\n` +
            ` البريد: \`${user.email || 'غير متوفر'}\`\n` +
            ` العملات المضافة: **${coinsToAdd}**\n` +
            ` الرصيد الجديد: **${user.coins}**`
        );

    } catch (error) {

        console.error("Add Coins Error:", error);

        return message.reply("❌ حدث خطأ أثناء إضافة العملات.");
    }
}
// =========================
// 🧹 resetcoins
// =========================
if (command === "+resetcoins") {

    if (message.author.id !== config.ownerId) {
        return message.reply("❌ هذا الأمر للمالك فقط");
    }

    // =========================
    // 🌍 تصفير كل المستخدمين (بدون باراميتر)
    // =========================
    if (!args[1]) {

        try {
            const result = await User.updateMany(
                {},
                { $set: { coins: 0 } }
            );
            return message.reply(
                `✅ **تم تصفير جميع العملات**\n\n` +
                `👥 عدد المستخدمين: **${result.modifiedCount}**`
            );

        } catch (err) {
            return message.reply("❌ حصل خطأ أثناء التصفير");
        }
    }

    // =========================
    // 👤 تصفير مستخدم واحد
    // =========================

    let searchUser = args[1];

    // إزالة المنشن
    const mentionMatch = searchUser.match(/^<@!?(\d+)>$/);
    if (mentionMatch) {
        searchUser = mentionMatch[1];
    }

    try {

        let user = null;

        // 1️⃣ Discord ID
        if (/^\d{17,20}$/.test(searchUser)) {
            user = await User.findOne({ discordId: searchUser });
        }

        // 2️⃣ Email
        if (!user && searchUser.includes("@")) {
            user = await User.findOne({
                email: searchUser.toLowerCase()
            });
        }

        // 3️⃣ Username
        if (!user) {
            user = await User.findOne({
                username: {
                    $regex: `^${searchUser}$`,
                    $options: "i"
                }
            });
        }

        // 4️⃣ Discord Username
        if (!user) {
            const discordUser = client.users.cache.find(
                u =>
                    u.username.toLowerCase() === searchUser.toLowerCase() ||
                    (u.globalName &&
                        u.globalName.toLowerCase() === searchUser.toLowerCase())
            );

            if (discordUser) {
                user = await User.findOne({ discordId: discordUser.id });
            }
        }

        if (!user) {
            return message.reply(
                `❌ لم يتم العثور على المستخدم:\n\`${searchUser}\``
            );
        }

        user.coins = 0;
        await user.save();
        let displayName = user.username;

        if (user.discordId) {
            try {
                const discordUser = await client.users.fetch(user.discordId);
                if (discordUser) displayName = discordUser.username;
            } catch (err) {}
        }

        return message.reply(
            ` **تم تصفير عملات المستخدم**\n\n` +
            ` المستخدم: **${displayName}**\n` +
            ` Discord ID: \`${user.discordId || 'غير مرتبط'}\`\n` +
            ` البريد: \`${user.email || 'غير متوفر'}\`\n` +
            ` الرصيد الجديد: **0**`
        );

    } catch (err) {

        console.log("Reset User Coins Error:", err);
        return message.reply("❌ حصل خطأ أثناء التصفير");
    }
}

  // =========================
// 📖 help
// =========================
if (command === "+help") {

    return message.channel.send({
        embeds: [
            {
                title: " قائمة الأوامر",
                color: 0x00ffcc,
                description: `
** أوامر العملات**
▶ +buy
▶ +add 
▶ +resetcoins 

** أوامر البنل**
▶ +panel 
▶ +help 

** أوامر الإدارة**
▶ !go 
`,
                footer: {
                    text: "J1 Studio Hosting • Bot Help Menu"
                },
            }
        ]
    });
}
    // =========================
    // 📊 +panel
    // =========================
    if (content === "+panel") {

        return message.channel.send(createHostingPanel());

    }

    // =========================
    // 🚀 تشغيل جميع السيرفرات !go
    // =========================
    if (content === "!go") {

        if (message.author.id !== config.ownerId) {
            return message.reply("❌ هذا الأمر للمالك فقط");
        }

        try {
            const fs = require("fs");
            const path = require("path");

            const servers = await Server.find({
                status: { $ne: "expired" }
            });

            let started = 0;
            let failed = 0;
            let skipped = 0;

            await message.reply(`🚀 جاري فحص وتشغيل ${servers.length} سيرفر...`);

            for (const serverObj of servers) {

                try {
                    const mainFile = serverObj.mainFile || "index.js";
                    const mainPath = path.join(serverObj.path, mainFile);

                    // ❌ الملف غير موجود
                    if (!fs.existsSync(mainPath)) {
                        console.log(`⛔ Skipped ${serverObj.name}`);
                        skipped++;
                        continue;
                    }

                    // ❌ يعمل بالفعل
                    const status = await processManager.checkStatus(
                        serverObj._id,
                        serverObj.path
                    );

                    if (status === "running") {
                        skipped++;
                        continue;
                    }

                    const result = await processManager.start(serverObj);

                    if (result.success) {
                        serverObj.status = "running";
                        serverObj.lastStart = new Date();
                        await serverObj.save();

                        started++;
                        console.log(`✅ Started: ${serverObj.name}`);
                    } else {
                        failed++;
                        console.log(`❌ Failed: ${serverObj.name}`);
                    }

                    await new Promise(r => setTimeout(r, 1000));

                } catch (err) {
                    console.log(`❌ Error: ${serverObj.name}`, err.message);
                    failed++;
                }
            }

            return message.channel.send(
                `📊 النتائج:\n\n` +
                `✅ تم تشغيل: ${started}\n` +
                `⏭️ تم تخطي: ${skipped}\n` +
                `❌ فشل: ${failed}`
            );

        } catch (err) {
            console.log(err);
            return message.channel.send(`❌ خطأ:\n\`${err.message}\``);
        }
    }
});

// ==========================================
// 📦 اختيار خطة الاستضافة من Select Menu
// ==========================================

client.on("interactionCreate", async (interaction) => {

    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId !== "hosting_plans") return;

    try {

        const selected = interaction.values[0];

        let planEmbed;

        // 🟢 Weekly
        if (selected === "weekly") {

            planEmbed = new EmbedBuilder()
                .setTitle("<:fabrandsnode:1556553359991775272> Weekly Plan")
                .setDescription(
                    "📦 **مواصفات الاستضافة الأسبوعية:**\n\n" +
                    "⚙️ **CPU:** 25%\n" +
                    "💾 **RAM:** 256MB\n" +
                    "💿 **Disk:** 1024MB\n" +
                    "⏱️ **المدة:** أسبوع واحد\n\n" +
                    "────────────────────\n\n" +
                    " **السعر: 15 Coins**"
                )
                .setColor("Green");

        }

        // 🟡 Biweekly
        else if (selected === "biweekly") {

            planEmbed = new EmbedBuilder()
                .setTitle("<:fabrandsnode:1556553359991775272> Biweekly Plan")
                .setDescription(
                    "📦 **مواصفات الاستضافة لمدة أسبوعين:**\n\n" +
                    "⚙️ **CPU:** 50%\n" +
                    "💾 **RAM:** 512MB\n" +
                    "💿 **Disk:** 2048MB\n" +
                    "⏱️ **المدة:** أسبوعين\n\n" +
                    "────────────────────\n\n" +
                    " **السعر: 25 Coins**"
                )
                .setColor("Yellow");

        }

        // 🔵 Monthly
        else if (selected === "monthly") {

            planEmbed = new EmbedBuilder()
                .setTitle("<:fabrandsnode:1556553359991775272> Monthly Plan")
                .setDescription(
                    "📦 **مواصفات الاستضافة الشهرية:**\n\n" +
                    "⚙️ **CPU:** 100%\n" +
                    "💾 **RAM:** 1024MB\n" +
                    "💿 **Disk:** 3072MB\n" +
                    "⏱️ **المدة:** شهر واحد\n\n" +
                    "────────────────────\n\n" +
                    " **السعر: 40 Coins**"
                )
                .setColor("Blue");

        }

        if (!planEmbed) {
            return interaction.reply({
                content: "❌ الخطة غير موجودة.",
                ephemeral: true
            });
        }

        // يظهر للمستخدم الذي اختار فقط
        await interaction.reply({
            embeds: [planEmbed],
            ephemeral: true
        });

    } catch (error) {

        console.error("❌ Select Menu Error:", error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "❌ حدث خطأ أثناء عرض مواصفات الخطة.",
                ephemeral: true
            });
        }
    }
});

// ========== إعدادات Express ==========
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));
app.use(bodyParser.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ========== Session ==========
const sessionMiddleware = session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, secure: false }
});

app.use(sessionMiddleware);

// ========== Passport ==========
app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy({
    clientID: config.discord.clientID,
    clientSecret: config.discord.clientSecret,
    callbackURL: config.discord.callbackURL,
    scope: ['identify', 'email']
}, function(accessToken, refreshToken, profile, done) {
    process.nextTick(async function() {
        try {
            let user = await User.findOne({ discordId: profile.id });
            const isOwner = config.ownerId === profile.id || (config.ownerIds || []).includes(profile.id);
            const isAdmin = (config.adminIds || []).includes(profile.id);
            
if (!user) {

    // حماية من بيانات ناقصة
    if (!profile || !profile.id) return done(new Error("Invalid Discord profile"));

if (!profile || !profile.id) {
    return done(new Error("Invalid Discord profile"));
}

let username = profile.username || `user_${profile.id}`;
let email = profile.email || null;

    let usernameExists = await User.findOne({ username });
    let counter = 1;

    while (usernameExists) {
        username = (profile.username || "user") + counter;
        usernameExists = await User.findOne({ username });
        counter++;
    }

    user = new User({
        discordId: profile.id,
        username,
        discordAvatar: profile.avatar || null,
        email,
        coins: config.defaultCoins,
        isOwner,
        isAdmin,
        maxServers: (isOwner || isAdmin) ? 999999 : config.defaultMaxServers
    });

    await user.save();
}
            return done(null, user);
        } catch (err) {
            return done(err);
        }
    });
}));

passport.use(new LocalStrategy({ usernameField: 'email' }, function(email, password, done) {
    process.nextTick(async function() {
        try {
            const user = await User.findOne({ email: email });
            if (!user) return done(null, false, { message: 'البريد غير موجود' });
            if (!user.password) return done(null, false, { message: 'سجل عن طريق ديسكورد' });
            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) return done(null, false, { message: 'كلمة مرور خاطئة' });
            return done(null, user);
        } catch (err) {
            return done(err);
        }
    });
}));

passport.serializeUser(function(user, done) { done(null, user.id); });
passport.deserializeUser(async function(id, done) {
    try { const user = await User.findById(id); done(null, user); }
    catch (err) { done(err); }
});

app.use((req, res, next) => {
    res.locals.user = req.user || null;
    res.locals.config = config;
    next();
});

app.use(auth.isNotBanned);

// ========== تهيئة المجلدات ==========
fs.ensureDirSync(config.serversPath);
fs.ensureDirSync(config.templatesPath);
fs.ensureDirSync(path.join(__dirname, 'public', 'uploads'));
fs.ensureDirSync(path.join(__dirname, 'views', 'servers'));

// ========== Socket.io ==========
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
    const userId = socket.request.session?.passport?.user;
    if (!userId) return socket.disconnect();
    
    socket.join('user:' + userId);
    
    socket.on('joinServer', async (serverId) => {
    try {

        const userId = socket.request.session?.passport?.user;

        if (!userId) {
            return;
        }

        const user = await User.findById(userId);

        if (!user) {
            return;
        }

        const serverObj = await Server.findById(serverId);

        if (!serverObj) {
            return;
        }

        if (!hasServerAccess(serverObj, user, 'console')) {
            socket.emit('console-error', {
                error: 'ليس لديك صلاحية الوصول إلى Console'
            });

            return;
        }

        socket.join('server:' + serverId);

    } catch (err) {

        console.error('joinServer error:', err);

    }
});
    
    socket.on('get-console-history', async (data) => {
    try {
        const userId = socket.request.session?.passport?.user;

        if (!userId) return;

        const user = await User.findById(userId);
        const serverObj = await Server.findById(data.serverId);

        if (!user || !serverObj) return;

        if (!hasServerAccess(serverObj, user, 'console')) {
            return socket.emit('console-error', {
                error: 'ليس لديك صلاحية مشاهدة Console'
            });
        }

        const logs = consoleManager.getLogsWithType(
            data.serverId,
            200
        );

        socket.emit('console-history', logs);

    } catch (err) {
        console.error('get-console-history error:', err);
    }
});
    
socket.on('console-command', async (data) => {
    try {

        const userId =
            socket.request.session?.passport?.user;

        if (!userId) {
            return;
        }

        const user = await User.findById(userId);

        if (!user) {
            return;
        }

        const serverObj = await Server.findById(
            data.serverId
        );

        if (!serverObj) {
            return;
        }

        if (!hasServerAccess(
            serverObj,
            user,
            'consoleCommand'
        )) {
            socket.emit('console-error', {
                error: 'ليس لديك صلاحية إرسال أوامر Console'
            });

            return;
        }

        if (!data.command || !data.command.trim()) {
            return;
        }

        processManager.sendCommand(
            data.serverId,
            data.command
        );

    } catch (err) {

        console.error(
            'console-command error:',
            err
        );

    }
});
});

consoleManager.on('output', (serverId, type, message) => {
    io.to('server:' + serverId).emit('console-log', { type, message, timestamp: Date.now() });
});

processManager.on('serverExit', async (serverId, code) => {
    const serverObj = await Server.findById(serverId);
    if (!serverObj) return;
    serverObj.status = code === 0 ? 'stopped' : 'error';
    await serverObj.save();
    io.to('user:' + serverObj.owner).emit('status-update', { id: serverId, status: serverObj.status });
    io.to('server:' + serverId).emit('status-update', { id: serverId, status: serverObj.status });
});

// ========== API Routes ==========
app.use('/api/v1', apiV1Router);
app.use('/api/v2', apiV2Router);

// ========== BOT API BRIDGE ==========
app.post("/api/bot/send", async (req, res) => {
    const { userId, message } = req.body;

    try {
        const user = await client.users.fetch(userId);
        await user.send(message);

        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, error: err.message });
    }
});
// ========== Main Routes ==========
app.get('/', (req, res) => {

    res.render('index', { title: 'J1 Studio', user: req.user || null });

});

app.get('/login', (req, res) => {
    if (req.user) return res.redirect('/dashboard');
    res.render('login', { error: null });
});

app.post('/login', passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/login'
}));

app.get('/register', (req, res) => {
    if (req.user) return res.redirect('/dashboard');
    res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
    try {
        const { username, email, password, confirmPassword } = req.body;
        if (password !== confirmPassword) return res.render('register', { error: 'كلمات المرور غير متطابقة' });
        
        const existing = await User.findOne({ email });
        if (existing) return res.render('register', { error: 'البريد مستخدم' });
        
        let finalUsername = username;
        let usernameExists = await User.findOne({ username: finalUsername });
        let counter = 1;
        while (usernameExists) {
            finalUsername = username + counter;
            usernameExists = await User.findOne({ username: finalUsername });
            counter++;
        }
        
        const isOwner = config.ownerEmail === email;
        const user = new User({
            username: finalUsername, email, password,
            coins: config.normalRegisterCoins, isOwner,
            maxServers: isOwner ? 999999 : config.defaultMaxServers
        });
        await user.save();
        
        req.login(user, (err) => { if (err) throw err; res.redirect('/dashboard'); });
    } catch (err) {
        res.render('register', { error: err.message });
    }
});

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/login' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => { req.logout(() => res.redirect('/')); });

// ========== API Keys Routes ==========
app.get('/api-keys', auth.isAuthenticated, async (req, res) => {
    res.render('api-keys', {
        apiKey: req.user.apiKey,
        apiKeyPrefix: req.user.apiKeyPrefix,
        apiKeyCreatedAt: req.user.apiKeyCreatedAt,
        apiKeyLastUsed: req.user.apiKeyLastUsed
    });
});

app.post('/api/keys/generate', auth.isAuthenticated, async (req, res) => {
    try {
        const apiKey = req.user.generateApiKey();
        await req.user.save();
        res.json({ success: true, apiKey });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/keys/revoke', auth.isAuthenticated, async (req, res) => {
    try {
        await req.user.revokeApiKey();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== Dashboard ==========
app.get('/dashboard', auth.isAuthenticated, async (req, res) => {
    try {
        const servers = await Server.find({
    $or: [
        { owner: req.user._id },
        { 'collaborators.user': req.user._id }
    ]
})
.populate('owner')
.populate('collaborators.user')
.sort('-createdAt');
        for (const s of servers) {
            s.status = await processManager.checkStatus(s._id, s.path);
            await s.save();
        }
        res.render('dashboard', {
            servers,
            stats: {
                totalServers: servers.length,
                runningServers: servers.filter(s => s.status === 'running').length,
                maxServers: req.user.maxServers
            }
        });
    } catch (err) {
        res.status(500).render('error', { message: err.message, error: err });
    }
});

app.get('/servers/create', auth.isAuthenticated, (req, res) => {
    res.render('servers/create', { error: null });
});

app.post('/servers/create', auth.isAuthenticated, async (req, res) => {
    try {
        const { name, mainFile, plan, nodeVersion, language } = req.body;

        // ========== أسعار الخطط ==========
        const plans = {
    weekly: {
        price: 15,
        cpu: 25,
        memory: 256,
        disk: 1024
    },

    biweekly: {
        price: 25,
        cpu: 50,
        memory: 512,
        disk: 2048
    },

    monthly: {
        price: 40,
        cpu: 100,
        memory: 1024,
        disk: 4096
    }
};

        const planNames = {
            weekly: 'أسبوع',
            biweekly: 'أسبوعين',
            monthly: 'شهر'
        };

        if (!plans[plan]) {
            return res.render('servers/create', { error: 'خطة غير صحيحة' });
        }

const planResources = {
    weekly: {
        cpu: 25,
        memory: 256,
        disk: 1024
    },
    biweekly: {
        cpu: 50,
        memory: 512,
        disk: 2048
    },
    monthly: {
        cpu: 100,
        memory: 1024,
        disk: 3072
    }
};

const resources = planResources[plan];

        const selectedPlan = plans[plan];

const cost = selectedPlan.price;

        // ========== تحقق الرصيد ==========
const creatingServer = await Server.findOne({
    owner: req.user._id,
    status: "creating"
});

if (creatingServer) {
    return res.render('servers/create', {
        error: 'يوجد طلب إنشاء قيد المعالجة'
    });
}

const updatedUser = await User.findOneAndUpdate(
    {
        _id: req.user._id,
        coins: { $gte: cost }
    },
    {
        $inc: { coins: -cost }
    },
    {
        new: true
    }
);

if (!updatedUser) {
    return res.render('servers/create', {
        error: 'رصيد غير كافي'
    });
}

// ========== الحد ==========
const serverCount = await Server.countDocuments({ owner: req.user._id });

if (serverCount >= req.user.maxServers) {
    return res.render('servers/create', {
        error: 'وصلت الحد الأقصى'
    });
}

// ========== إنشاء السيرفر ==========
const serverId = new mongoose.Types.ObjectId();
const serverPath = path.join(
    config.serversPath,
    req.user._id.toString(),
    serverId.toString()
);

// ========== إنشاء بورت عشوائي للسيرفر ==========
let port;

do {
    port = Math.floor(
        Math.random() * (config.portRange.end - config.portRange.start + 1)
    ) + config.portRange.start;

} while (await Server.findOne({ port }));

await fs.ensureDir(serverPath);

const selectedLanguage = language === 'python' ? 'python' : 'nodejs';

let defaultCode;
let defaultMainFile;

if (selectedLanguage === 'python') {

    defaultMainFile = mainFile || 'main.py';

    defaultCode = `
import os
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = int(os.environ.get("PORT", ${port}))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"<h1>${name}</h1><p>Python server is running!</p>")

server = HTTPServer(("0.0.0.0", PORT), Handler)

print(f"Python server running on port {PORT}")

server.serve_forever()
`;

} else {

    defaultMainFile = mainFile || 'index.js';

    defaultCode = `
const http = require('http');

const PORT = process.env.PORT || ${port};

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(\`<h1>${name}</h1><p>Node.js server is running!</p>\`);
});

server.listen(PORT, "0.0.0.0", () => {
    console.log('Node.js server running on port ' + PORT);
});
`;

}

await fs.writeFile(
    path.join(serverPath, defaultMainFile),
    defaultCode
);

if (selectedLanguage === 'nodejs') {

    const packageJson = {
        name: name.toLowerCase().replace(/\s+/g, '-'),
        version: '1.0.0',
        main: defaultMainFile,
        scripts: {
            start: `node ${defaultMainFile}`
        },
        dependencies: {}
    };

    await fs.writeFile(
        path.join(serverPath, 'package.json'),
        JSON.stringify(packageJson, null, 2)
    );

} else {

    // Python
    const requirementsPath = path.join(serverPath, 'requirements.txt');

    if (!await fs.pathExists(requirementsPath)) {
        await fs.writeFile(requirementsPath, '');
    }
}

        // ========== حفظ السيرفر ==========
const serverObj = new Server({
    _id: serverId,
    name,
    owner: req.user._id,
port: port,
domain: "J1.hosting",
url: `http://J1.hosting.cloud:${port}`,
assignedPort: true,
    status: "creating",
    path: serverPath,
language: selectedLanguage,
    mainFile: defaultMainFile,
    nodeVersion: nodeVersion || '24',

    plan,
    planName: planNames[plan],
    cost,

    cpuLimit: selectedPlan.cpu,
    memoryLimit: selectedPlan.memory,
    diskLimit: selectedPlan.disk,

    cpuUsage: 0,
    memoryUsage: 0,
    diskUsage: 0,

    expiresAt: new Date(Date.now() + (
        plan === 'weekly' ? 7 :
        plan === 'biweekly' ? 14 : 30
    ) * 24 * 60 * 60 * 1000)
});

        await serverObj.save();
serverObj.status = "stopped";
await serverObj.save();

res.redirect(`/servers/${serverObj._id}`);

    } catch (err) {
        console.error(err);
        res.render('servers/create', {
            error: err.message
        });
    }
});


// ==========================================
// نظام صلاحيات السيرفر والمتعاونين
// ==========================================

function isSystemAdmin(user) {
    if (!user) return false;

    return (
        user.isOwner ||
        user.isAdmin ||
        config.ownerId === user.discordId ||
        (config.ownerIds || []).includes(user.discordId) ||
        (config.adminIds || []).includes(user.discordId)
    );
}


// الحصول على المتعاون
function getCollaborator(serverObj, userId) {
    if (!serverObj || !serverObj.collaborators) {
        return null;
    }

    return serverObj.collaborators.find(collaborator => {
        if (!collaborator.user) {
            return false;
        }

        const collaboratorId =
            collaborator.user._id
                ? collaborator.user._id.toString()
                : collaborator.user.toString();

        return collaboratorId === userId.toString();
    });
}


// التحقق من الوصول للسيرفر
function hasServerAccess(serverObj, user, permission = 'view') {
    if (!serverObj || !user) {
        return false;
    }

    // صاحب السيرفر لديه كل الصلاحيات
    if (
        serverObj.owner &&
        (serverObj.owner._id
            ? serverObj.owner._id.toString()
            : serverObj.owner.toString()) === user._id.toString()
    ) {
        return true;
    }

    // الأدمن/الأونر لديه كل الصلاحيات
    if (isSystemAdmin(user)) {
        return true;
    }

    // البحث عن المتعاون
    const collaborator = getCollaborator(
        serverObj,
        user._id
    );

    if (!collaborator) {
        return false;
    }

    // صلاحية view تكون افتراضيًا فقط إذا لم توجد permissions
    if (!collaborator.permissions) {
        return permission === 'view';
    }

    return collaborator.permissions[permission] === true;
}


// التحقق من أن المستخدم هو صاحب السيرفر فقط
function isServerOwner(serverObj, user) {
    if (!serverObj || !user || !serverObj.owner) {
        return false;
    }

    const ownerId =
        serverObj.owner._id
            ? serverObj.owner._id.toString()
            : serverObj.owner.toString();

    return ownerId === user._id.toString();
}

// ==========================================
// إضافة متعاون للسيرفر
// Discord ID أو Email
// ==========================================

app.post('/servers/:id/collaborators/add', auth.isAuthenticated, async (req, res) => {
    try {

        const { identifier } = req.body;

        if (!identifier || !identifier.trim()) {
            return res.status(400).json({
                error: 'أدخل Discord ID أو البريد الإلكتروني'
            });
        }

        const serverObj = await Server.findById(req.params.id);

        if (!serverObj) {
            return res.status(404).json({
                error: 'السيرفر غير موجود'
            });
        }

        // فقط صاحب السيرفر يستطيع إضافة متعاون
        if (!isServerOwner(serverObj, req.user)) {
            return res.status(403).json({
                error: 'فقط صاحب السيرفر يستطيع إدارة المتعاونين'
            });
        }

        const value = identifier.trim();

        let friend = null;

        // ==================================
        // البحث باستخدام Discord ID
        // ==================================

        if (/^\d{17,20}$/.test(value)) {

            friend = await User.findOne({
                discordId: value
            });

        } else {

            // ==================================
            // البحث باستخدام Email
            // ==================================

            friend = await User.findOne({
                email: value.toLowerCase()
            });

        }

        if (!friend) {
            return res.status(404).json({
                error: 'لم يتم العثور على حساب بهذا Discord ID أو البريد الإلكتروني'
            });
        }

        // منع إضافة نفسك
        if (
            friend._id.toString() ===
            req.user._id.toString()
        ) {
            return res.status(400).json({
                error: 'لا يمكنك إضافة نفسك كمتعاون'
            });
        }

        // منع إضافة الأونر نفسه
        if (
            serverObj.owner.toString() ===
            friend._id.toString()
        ) {
            return res.status(400).json({
                error: 'هذا المستخدم هو صاحب السيرفر بالفعل'
            });
        }

        // منع التكرار
        const alreadyCollaborator =
            serverObj.collaborators &&
            serverObj.collaborators.some(
                collaborator =>
                    collaborator.user &&
                    collaborator.user.toString() ===
                    friend._id.toString()
            );

        if (alreadyCollaborator) {
            return res.status(400).json({
                error: 'هذا المستخدم مضاف بالفعل'
            });
        }

        // ==================================
        // الصلاحيات الافتراضية
        // ==================================

        serverObj.collaborators.push({
            user: friend._id,

            permissions: {
                view: true,

                start: false,
                stop: false,
                restart: false,

                console: false,
                consoleCommand: false,

                files: false,
                fileEdit: false,
                upload: false,
                deleteFiles: false,

                packages: false,
                settings: false
            },

            addedAt: new Date()
        });

        await serverObj.save();

        res.json({
            success: true,
            message: 'تمت إضافة المتعاون بنجاح',

            user: {
                id: friend._id,
                username: friend.username,
                email: friend.email || null,
                discordId: friend.discordId || null,
                discordAvatar: friend.discordAvatar || null
            }
        });

    } catch (err) {

        console.error('Add collaborator error:', err);

        res.status(500).json({
            error: err.message
        });
    }
});

// ==========================================
// إزالة متعاون من السيرفر
// ==========================================

app.post('/servers/:id/collaborators/remove', auth.isAuthenticated, async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: 'معرف المستخدم مطلوب'
            });
        }

        const serverObj = await Server.findById(req.params.id);

        if (!serverObj) {
            return res.status(404).json({
                error: 'السيرفر غير موجود'
            });
        }

        // فقط صاحب السيرفر يستطيع إدارة المتعاونين
        if (!isServerOwner(serverObj, req.user)) {
            return res.status(403).json({
                error: 'فقط صاحب السيرفر يستطيع إدارة المتعاونين'
            });
        }

        const before = serverObj.collaborators.length;

        serverObj.collaborators =
            serverObj.collaborators.filter(collaborator => {

                if (!collaborator.user) {
                    return false;
                }

                return collaborator.user.toString() !== userId.toString();
            });

        if (serverObj.collaborators.length === before) {
            return res.status(404).json({
                error: 'هذا المستخدم ليس متعاونًا'
            });
        }

        await serverObj.save();

        res.json({
            success: true,
            message: 'تمت إزالة المتعاون بنجاح'
        });

    } catch (err) {

        console.error(
            'Remove collaborator error:',
            err
        );

        res.status(500).json({
            error: err.message
        });
    }
});

// ==========================================
// تعديل صلاحيات المتعاون
// ==========================================

app.post('/servers/:id/collaborators/permissions', auth.isAuthenticated, async (req, res) => {
    try {
        const { userId, permissions } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: 'معرف المستخدم مطلوب'
            });
        }

        const serverObj = await Server.findById(req.params.id);

        if (!serverObj) {
            return res.status(404).json({
                error: 'السيرفر غير موجود'
            });
        }

        // فقط صاحب السيرفر يستطيع تعديل الصلاحيات
        if (!isServerOwner(serverObj, req.user)) {
            return res.status(403).json({
                error: 'فقط صاحب السيرفر يستطيع تعديل الصلاحيات'
            });
        }

        const collaborator = serverObj.collaborators.find(
            collaborator =>
                collaborator.user &&
                collaborator.user.toString() === userId.toString()
        );

        if (!collaborator) {
            return res.status(404).json({
                error: 'هذا المستخدم ليس متعاونًا'
            });
        }

        const allowedPermissions = [
            'view',
            'start',
            'stop',
            'restart',
            'console',
            'consoleCommand',
            'files',
            'fileEdit',
            'upload',
            'deleteFiles',
            'packages',
            'settings'
        ];

        for (const permission of allowedPermissions) {
            collaborator.permissions[permission] =
                permissions &&
                permissions[permission] === true;
        }

        // يجب أن تبقى صلاحية view موجودة
        if (!collaborator.permissions.view) {
            collaborator.permissions.view = true;
        }

        await serverObj.save();

        res.json({
            success: true,
            message: 'تم تحديث صلاحيات المتعاون'
        });

    } catch (err) {

        console.error(
            'Update collaborator permissions error:',
            err
        );

        res.status(500).json({
            error: err.message
        });
    }
});

// ==========================================
// عرض صاحب السيرفر والمتعاونين
// ==========================================

app.get('/servers/:id/users', auth.isAuthenticated, async (req, res) => {
    try {
        const serverObj = await Server.findById(req.params.id)
            .populate('owner')
            .populate('collaborators.user');

        if (!serverObj) {
            return res.status(404).json({
                error: 'السيرفر غير موجود'
            });
        }

        // صاحب السيرفر أو الأدمن يستطيع مشاهدة القائمة
        if (
            !isServerOwner(serverObj, req.user) &&
            !isSystemAdmin(req.user)
        ) {
            return res.status(403).json({
                error: 'ليس لديك صلاحية مشاهدة مستخدمي السيرفر'
            });
        }

        const users = [];

        // صاحب السيرفر
        if (serverObj.owner) {
            users.push({
                id: serverObj.owner._id,
                username: serverObj.owner.username,
                email: serverObj.owner.email || null,
                discordId: serverObj.owner.discordId || null,
                discordAvatar: serverObj.owner.discordAvatar || null,
                role: 'owner',
                permissions: {
                    view: true,
                    start: true,
                    stop: true,
                    restart: true,
                    console: true,
                    consoleCommand: true,
                    files: true,
                    fileEdit: true,
                    upload: true,
                    deleteFiles: true,
                    packages: true,
                    settings: true
                }
            });
        }

        // المتعاونون
        for (const collaborator of serverObj.collaborators || []) {

            if (!collaborator.user) {
                continue;
            }

            users.push({
                id: collaborator.user._id,
                username: collaborator.user.username,
                email: collaborator.user.email || null,
                discordId: collaborator.user.discordId || null,
                discordAvatar: collaborator.user.discordAvatar || null,
                role: 'collaborator',
                permissions: collaborator.permissions || {}
            });
        }

        res.json({
            success: true,
            users
        });

    } catch (err) {

        console.error(
            'Get server users error:',
            err
        );

        res.status(500).json({
            error: err.message
        });
    }
});

        // ========== خصم العملات ==========
app.get('/servers/:id', auth.isAuthenticated, async (req, res) => {
    try {
        const serverObj = await Server.findById(req.params.id)
    .populate('owner')
    .populate('collaborators.user');

        if (!serverObj)
            return res.status(404).render('error', {
                message: 'السيرفر غير موجود',
                error: {}
            });

const canViewServer = hasServerAccess(
    serverObj,
    req.user,
    'view'
);

if (!canViewServer) {
    return res.status(403).render('error', {
        message: 'غير مصرح',
        error: {}
    });
}

        // 🔥 فحص انتهاء الاشتراك
        if (
            serverObj.expiresAt &&
            new Date() > serverObj.expiresAt
        ) {
            serverObj.status = "expired";
            await serverObj.save();

            return res.render('expired', {
                server: serverObj
            });
        }

        serverObj.status = await processManager.checkStatus(
            serverObj._id,
            serverObj.path
        );

        await serverObj.save();

const ownerOfServer = isServerOwner(
    serverObj,
    req.user
);

const adminOfServer = isSystemAdmin(
    req.user
);

const collaborator = getCollaborator(
    serverObj,
    req.user._id
);

const allPermissions = {
    view: true,
    start: true,
    stop: true,
    restart: true,
    console: true,
    consoleCommand: true,
    files: true,
    fileEdit: true,
    upload: true,
    deleteFiles: true,
    packages: true,
    settings: true
};

const permissions =
    ownerOfServer || adminOfServer
        ? allPermissions
        : (collaborator?.permissions || {
            view: false,
            start: false,
            stop: false,
            restart: false,
            console: false,
            consoleCommand: false,
            files: false,
            fileEdit: false,
            upload: false,
            deleteFiles: false,
            packages: false,
            settings: false
        });

const fileManager = new FileManager(
    serverObj.path
);

let files = [];

if (permissions.files === true) {
    try {
        files = await fileManager.listDirectory();
    } catch (e) {
        console.error(
            "Extract Error:",
            e
        );
    }
}

res.render('servers/view', {
    server: serverObj,
    files,
    portRange: serverObj.port,
    user: req.user,
    permissions,
    isServerOwner: ownerOfServer,
    isSystemAdmin: adminOfServer,
    collaborator: collaborator || null
});

    } catch (err) {
        res.status(500).render('error', {
            message: err.message,
            error: err
        });
    }
});

app.post('/servers/:id/start', auth.isAuthenticated, async (req, res) => {
    try {
        const serverObj = await Server.findById(req.params.id);

        if (!serverObj) {
            return res.status(404).json({
                error: 'السيرفر غير موجود'
            });
        }

        if (!hasServerAccess(serverObj, req.user, 'start')) {
            return res.status(403).json({
                error: 'ليس لديك صلاحية تشغيل السيرفر'
            });
        }

        if (
            serverObj.expiresAt &&
            new Date() > serverObj.expiresAt
        ) {
            return res.status(403).json({
                error: 'انتهى الاشتراك'
            });
        }

        const result = await processManager.start(serverObj);

        if (result.success) {
            serverObj.status = 'running';
            serverObj.lastStart = new Date();
            await serverObj.save();
        }

        res.json(result);

    } catch (err) {
        console.error('Start Error:', err);

        res.status(500).json({
            error: err.message
        });
    }
});

app.post('/servers/:id/stop', auth.isAuthenticated, async (req, res) => {
    try {
        const serverObj = await Server.findById(req.params.id);
        if (!serverObj) return res.status(404).json({ error: 'غير موجود' });
        
        if (!hasServerAccess(serverObj, req.user, 'stop')) {
    return res.status(403).json({
        error: 'ليس لديك صلاحية إيقاف السيرفر'
    });
}
        
        const result = await processManager.stop(serverObj._id, serverObj.path);
        if (result.success) {
            serverObj.status = 'stopped';
            await serverObj.save();
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/servers/:id/restart', auth.isAuthenticated, async (req, res) => {
    try {
        const serverObj = await Server.findById(req.params.id);
        if (!serverObj) return res.status(404).json({ error: 'غير موجود' });
        
        if (!hasServerAccess(serverObj, req.user, 'restart')) {
    return res.status(403).json({
        error: 'ليس لديك صلاحية إعادة تشغيل السيرفر'
    });
}
        
        const result = await processManager.restart(serverObj);
        if (result.success) {
            serverObj.status = 'running';
            await serverObj.save();
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/servers/:id/delete', auth.isAuthenticated, async (req, res) => {
    try {
        const serverObj = await Server.findById(req.params.id);
        if (!serverObj) return res.status(404).json({ error: 'غير موجود' });
        
        if (!isServerOwner(serverObj, req.user) && !isSystemAdmin(req.user)) {
    return res.status(403).json({
        error: 'فقط صاحب السيرفر يستطيع حذف السيرفر'
    });
}
        
        await processManager.stop(serverObj._id, serverObj.path);
        await fs.remove(serverObj.path);
        await Server.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/servers/:id/rename', auth.isAuthenticated, async (req, res) => {
    try {
        const { name } = req.body;
        const serverObj = await Server.findById(req.params.id);
        if (!serverObj) return res.status(404).json({ error: 'غير موجود' });
        if (!hasServerAccess(serverObj, req.user, 'settings')) {
    return res.status(403).json({
        error: 'ليس لديك صلاحية تعديل إعدادات السيرفر'
    });
}
        serverObj.name = name;
        await serverObj.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/servers/:id/settings', auth.isAuthenticated, async (req, res) => {
    try {
const { mainFile, nodeVersion, envVariables } = req.body;
        const serverObj = await Server.findById(req.params.id);

        if (!serverObj)
            return res.status(404).json({ error: 'غير موجود' });

        if (!hasServerAccess(serverObj, req.user, 'settings')) {
    return res.status(403).json({
        error: 'ليس لديك صلاحية تعديل إعدادات السيرفر'
    });
}

serverObj.mainFile = mainFile;
serverObj.nodeVersion = nodeVersion || '24';
serverObj.envVariables = new Map(Object.entries(envVariables || {}));

        await serverObj.save();

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== File Management ==========
app.get('/servers/:id/files', auth.isAuthenticated, async (req, res) => {
    try {
        const serverObj = await Server.findById(req.params.id);
        if (!serverObj) return res.status(404).json({ error: 'غير موجود' });
        if (!hasServerAccess(serverObj, req.user, 'files')) {
    return res.status(403).json({
        error: 'ليس لديك صلاحية الوصول إلى الملفات'
    });
}
        const dir = req.query.dir || '';
        const fileManager = new FileManager(serverObj.path);
        const files = await fileManager.listDirectory(dir);
        res.json({ files, currentDir: dir });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/servers/:id/files/read', auth.isAuthenticated, async (req, res) => {
    try {
        const { file, download } = req.query;

        if (!file) {
            return res.status(400).json({
                error: 'لم يتم تحديد الملف'
            });
        }

        const serverObj = await Server.findById(req.params.id);

        if (!serverObj) {
            return res.status(404).json({
                error: 'السيرفر غير موجود'
            });
        }

        if (!hasServerAccess(serverObj, req.user, 'files')) {
            return res.status(403).json({
                error: 'ليس لديك صلاحية الوصول إلى الملفات'
            });
        }

        // تنظيف مسار الملف
        const relativePath = String(file)
            .replace(/\\/g, '/')
            .replace(/^\/+/, '');

        // المسار الكامل للملف
        const basePath = path.resolve(serverObj.path);
        const filePath = path.resolve(basePath, relativePath);

        // منع الخروج من مجلد السيرفر
        if (
            filePath !== basePath &&
            !filePath.startsWith(basePath + path.sep)
        ) {
            return res.status(403).json({
                error: 'مسار الملف غير مسموح'
            });
        }

        // تحميل الملف
        if (download === 'true') {

            let stat;

            try {
                stat = await fs.stat(filePath);
            } catch (err) {
                console.error('Download stat error:', {
                    file,
                    filePath,
                    serverPath: serverObj.path,
                    error: err.message
                });

                return res.status(404).json({
                    error: 'الملف غير موجود',
                    path: relativePath
                });
            }

            // تأكد أنه ملف وليس مجلد
            if (!stat.isFile()) {
                return res.status(400).json({
                    error: 'العنصر المحدد ليس ملفًا'
                });
            }

            console.log('Downloading file:', {
                file: relativePath,
                filePath,
                size: stat.size
            });

            return res.download(
                filePath,
                path.basename(filePath),
                {
                    dotfiles: 'allow'
                },
                (err) => {
                    if (err) {
                        console.error('Download Error:', {
                            file: relativePath,
                            filePath,
                            error: err.message,
                            code: err.code
                        });

                        // إذا كان Express بدأ إرسال الملف بالفعل
                        if (res.headersSent) {
                            return;
                        }

                        return res.status(500).json({
                            error: 'فشل تحميل الملف',
                            details: err.message
                        });
                    }

                    console.log('Download completed:', relativePath);
                }
            );
        }

        // قراءة محتوى الملف
        const fileManager = new FileManager(serverObj.path);

        const data = await fileManager.readFile(relativePath);

        res.json(data);

    } catch (err) {
        console.error('File Read Error:', err);

        if (res.headersSent) {
            return;
        }

        res.status(500).json({
            error: err.message
        });
    }
});
app.post('/servers/:id/files/save', auth.isAuthenticated, async (req, res) => {
    try {
        const { file, content } = req.body;
        const serverObj = await Server.findById(req.params.id);
        if (!serverObj) return res.status(404).json({ error: 'غير موجود' });
        if (!hasServerAccess(serverObj, req.user, 'fileEdit')) {
    return res.status(403).json({
        error: 'ليس لديك صلاحية تعديل الملفات'
    });
}
        const fileManager = new FileManager(serverObj.path);
        await fileManager.saveFile(file, content);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/servers/:id/files/create', auth.isAuthenticated, async (req, res) => {
    try {
        const { path: filePath, type, content } = req.body;
        const serverObj = await Server.findById(req.params.id);
        if (!serverObj) return res.status(404).json({ error: 'غير موجود' });
        if (!hasServerAccess(serverObj, req.user, 'fileEdit')) {
    return res.status(403).json({
        error: 'ليس لديك صلاحية إنشاء الملفات'
    });
}
        const fileManager = new FileManager(serverObj.path);
        if (type === 'file') await fileManager.createFile(filePath, content || '');
        else await fileManager.createFolder(filePath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/servers/:id/files/delete', auth.isAuthenticated, async (req, res) => {
    try {
        const { path: filePath } = req.body;
        const serverObj = await Server.findById(req.params.id);
        if (!serverObj) return res.status(404).json({ error: 'غير موجود' });
        if (!hasServerAccess(serverObj, req.user, 'deleteFiles')) {
    return res.status(403).json({
        error: 'ليس لديك صلاحية حذف الملفات'
    });
}
        const fileManager = new FileManager(serverObj.path);
        await fileManager.delete(filePath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/servers/:id/files/rename', auth.isAuthenticated, async (req, res) => {
    try {
        const { oldPath, newName } = req.body;
        const serverObj = await Server.findById(req.params.id);
        if (!serverObj) return res.status(404).json({ error: 'غير موجود' });
        if (!hasServerAccess(serverObj, req.user, 'fileEdit')) {
    return res.status(403).json({
        error: 'ليس لديك صلاحية إعادة تسمية الملفات'
    });
}
        const fileManager = new FileManager(serverObj.path);
        const newPath = await fileManager.rename(oldPath, newName);
        res.json({ success: true, newPath });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const upload = multer({ dest: 'uploads/' });
app.post('/servers/:id/files/upload', auth.isAuthenticated, upload.array('files'), async (req, res) => {
    try {
        const serverObj = await Server.findById(req.params.id);
        if (!serverObj) return res.status(404).json({ error: 'غير موجود' });
        if (!hasServerAccess(serverObj, req.user, 'upload')) {
    return res.status(403).json({
        error: 'ليس لديك صلاحية رفع الملفات'
    });
}
        const dir = req.body.dir || '';
        const extract = req.body.extract === 'true';
        for (const file of req.files) {
            const targetPath = path.join(serverObj.path, dir, file.originalname);
            await fs.move(file.path, targetPath, { overwrite: true });
            if (extract) {
                const fileManager = new FileManager(serverObj.path);
                const archivePath = path.join(dir, file.originalname);
                try {
                    await fileManager.extractArchive(archivePath, dir);
                    await fs.remove(targetPath);
                } catch (e) {
    console.error("Extract Error:", e);
}
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/servers/:id/files/archive', auth.isAuthenticated, async (req, res) => {
    try {
        const { paths, archiveName } = req.body;

        const serverObj = await Server.findById(req.params.id);

        if (!serverObj) {
            return res.status(404).json({
                error: 'السيرفر غير موجود'
            });
        }

        if (!hasServerAccess(serverObj, req.user, 'fileEdit')) {
            return res.status(403).json({
                error: 'ليس لديك صلاحية ضغط الملفات'
            });
        }

        const fileManager = new FileManager(serverObj.path);

        const archive = await fileManager.createArchive(
            paths || [],
            archiveName || 'archive.zip'
        );

        res.json({
            success: true,
            archive
        });

    } catch (err) {
        console.error('Archive Error:', err);

        res.status(500).json({
            error: err.message
        });
    }
});

// ========== Console Routes ==========
app.post('/servers/:id/logs/reload', auth.isAuthenticated, async (req, res) => {
    try {

        const serverObj = await Server.findById(req.params.id);

        if (!serverObj) {
            return res.status(404).json({
                error: 'السيرفر غير موجود'
            });
        }

        if (!hasServerAccess(serverObj, req.user, 'console')) {
            return res.status(403).json({
                error: 'ليس لديك صلاحية الوصول إلى Console'
            });
        }

        await consoleManager.loadFromFile(
            serverObj._id.toString(),
            serverObj.path
        );

        res.json({
            success: true
        });

    } catch (err) {

        console.error(
            'Console reload error:',
            err
        );

        res.status(500).json({
            error: err.message
        });
    }
});

app.post('/servers/:id/logs/clear', auth.isAuthenticated, async (req, res) => {
    try {

        const serverObj = await Server.findById(req.params.id);

        if (!serverObj) {
            return res.status(404).json({
                error: 'السيرفر غير موجود'
            });
        }

        if (!hasServerAccess(serverObj, req.user, 'console')) {
            return res.status(403).json({
                error: 'ليس لديك صلاحية الوصول إلى Console'
            });
        }

        await consoleManager.clear(
            serverObj._id.toString(),
            serverObj.path
        );

        res.json({
            success: true
        });

    } catch (err) {

        console.error(
            'Console clear error:',
            err
        );

        res.status(500).json({
            error: err.message
        });
    }
});

// ========== Admin Routes ==========
app.get('/admin', auth.isAuthenticated, auth.isOwner, async (req, res) => {
    try {
        const users = await User.find().sort('-createdAt').limit(100);
        const servers = await Server.find().populate('owner').sort('-createdAt').limit(50);
        const transactions = await Transaction.find().populate('from to').sort('-createdAt').limit(50);
        const stats = {
            totalUsers: await User.countDocuments() || 0,
            totalServers: await Server.countDocuments() || 0,
            runningServers: await Server.countDocuments({ status: 'running' }) || 0,
            totalCoins: (await User.aggregate([{ $group: { _id: null, total: { $sum: '$coins' } } }]))[0]?.total || 0
        };
        res.render('admin', { users: users || [], servers: servers || [], transactions: transactions || [], stats, config });
    } catch (err) {
        res.status(500).render('error', { message: err.message, error: err });
    }
});

app.post('/admin/users/:id/coins', auth.isAuthenticated, auth.isOwner, async (req, res) => {
    try {
        const { amount, reason } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'غير موجود' });
        await user.addCoins(parseInt(amount));
        await Transaction.create({ from: req.user._id, to: user._id, amount: parseInt(amount), reason: reason || 'إضافة من المالك' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/admin/users/:id/limits', auth.isAuthenticated, auth.isOwner, async (req, res) => {
    try {
        const { maxServers } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'غير موجود' });
        user.maxServers = parseInt(maxServers);
        await user.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/admin/users/:id/ban', auth.isAuthenticated, auth.isOwner, async (req, res) => {
    try {
        const { reason } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'غير موجود' });
        if (user.isOwner) return res.status(403).json({ error: 'لا يمكن حظر المالك' });
        user.isBanned = !user.isBanned;
        user.banReason = user.isBanned ? reason : null;
        await user.save();
        if (user.isBanned) {
            const servers = await Server.find({ owner: user._id, status: 'running' });
            for (const s of servers) {
                await processManager.stop(s._id, s.path);
                s.status = 'stopped';
                await s.save();
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/admin/servers/:id/delete', auth.isAuthenticated, auth.isOwner, async (req, res) => {
    try {
        const serverObj = await Server.findById(req.params.id);
        if (!serverObj) return res.status(404).json({ error: 'غير موجود' });
        await processManager.stop(serverObj._id, serverObj.path);
        await fs.remove(serverObj.path);
        await Server.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/admin/users/:id/admin', auth.isAuthenticated, auth.isOwner, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'غير موجود' });
        if (user.isOwner) return res.status(403).json({ error: 'لا يمكن تعديل صلاحيات المالك' });
        user.isAdmin = !user.isAdmin;
        user.maxServers = user.isAdmin ? 999999 : config.defaultMaxServers;
        await user.save();
        res.json({ success: true, isAdmin: user.isAdmin });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/servers/:id/packages/download', auth.isAuthenticated, async (req, res) => {
    try {
        const serverObj = await Server.findById(req.params.id);
        if (!serverObj) return res.status(404).json({ error: 'Server not found' });

        if (!hasServerAccess(serverObj, req.user, 'packages')) {
    return res.status(403).json({
        error: 'ليس لديك صلاحية إدارة الحزم'
    });
}

const packageName = req.query.name;

if (!packageName) {
    return res.status(400).json({ error: 'Package name required' });
}

// ✅ الحماية هنا (قبل أي exec)
if (!/^[a-zA-Z0-9@._/-]+$/.test(packageName)) {
    return res.status(400).json({ error: "Invalid package name" });
}


exec(`npm install ${packageName}`, { cwd: serverObj.path }, (err, stdout, stderr) => {

    console.log("PACKAGE:", packageName);
    console.log("STDOUT:", stdout);
    console.log("STDERR:", stderr);

    if (err) {
        return res.status(500).json({
            error: stderr || err.message
        });
    }

    res.json({
        success: true,
        message: `Installed ${packageName}`,
        output: stdout
    });
});

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/servers/:id/packages', auth.isAuthenticated, async (req, res) => {
    try {
        const serverObj = await Server.findById(req.params.id);
        if (!serverObj) return res.status(404).json({ error: 'Server not found' });

        if (!hasServerAccess(serverObj, req.user, 'packages')) {
    return res.status(403).json({
        error: 'ليس لديك صلاحية عرض الحزم'
    });
}

        const fs = require('fs');
        const path = require('path');

        const packageJsonPath = path.join(serverObj.path, 'package.json');

        if (!fs.existsSync(packageJsonPath)) {
            return res.json({ packages: [] });
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

        const deps = packageJson.dependencies || {};

        res.json({
            success: true,
            packages: Object.keys(deps).map(name => ({
                name,
                version: deps[name]
            }))
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/servers/:id/packages/view', auth.isAuthenticated, async (req, res) => {
    try {
        const serverObj = await Server.findById(req.params.id);

        if (!serverObj) {
            return res.status(404).render('error', {
                message: 'Server not found',
                error: {}
            });
        }

        if (!hasServerAccess(serverObj, req.user, 'packages')) {
    return res.status(403).render('error', {
        message: 'ليس لديك صلاحية عرض الحزم',
        error: {}
    });
}

        res.render('servers/packages', { server: serverObj });

    } catch (err) {
        res.status(500).render('error', {
            message: err.message,
            error: err
        });
    }
});

app.post('/servers/:id/renew', auth.isAuthenticated, async (req, res) => {

    const serverObj = await Server.findById(req.params.id);

    if (!serverObj)
        return res.status(404).send("Not Found");

    if (serverObj.owner.toString() !== req.user._id.toString())
        return res.status(403).send("Forbidden");

    const prices = {
        weekly: 15,
        biweekly: 25,
        monthly: 40
    };

    const renewCost = prices[serverObj.plan];

    if (req.user.coins < renewCost) {
        return res.send("❌ لا تملك عملات كافية");
    }

    req.user.coins -= renewCost;
    await req.user.save();

    let days = 30;

    if (serverObj.plan === "weekly") days = 7;
    if (serverObj.plan === "biweekly") days = 14;

    serverObj.status = "stopped";

const base = serverObj.expiresAt && serverObj.expiresAt > new Date()
    ? serverObj.expiresAt
    : new Date();

serverObj.expiresAt = new Date(
    base.getTime() + days * 24 * 60 * 60 * 1000
);

    await serverObj.save();

    res.redirect(`/servers/${serverObj._id}`);
});

// ========== Error handlers ==========
app.use((req, res) => { res.status(404).render('error', { message: 'الصفحة غير موجودة', error: { status: 404 } }); });
app.use((err, req, res, next) => { console.error('Server Error:', err); res.status(500).render('error', { message: 'حدث خطأ في السيرفر', error: err }); });



// ==========================
// ⏰ فحص انتهاء الاشتراكات
// ==========================
setInterval(async () => {
    try {

        const expiredServers = await Server.find({
    expiresAt: {
        $ne: null,
        $lte: new Date()
    },
    status: { $ne: 'expired' }
});

        for (const server of expiredServers) {

            try {
                await processManager.stop(server._id, server.path);
            } catch (e) {}

            server.status = "expired";
            await server.save();

            console.log(`⛔ Expired: ${server.name}`);
        }

    } catch (err) {
        console.log(err);
    }

}, 60000);
// ========== Start server ==========
mongoose.connect(config.mongoURI)
  .then(() => {
      console.log("✅ DB Connected");

      server.listen(config.panelPort, '0.0.0.0', () => {
          console.log('🚀 Host Panel: https://j1host.hidenplay.net');
      });

  })
  .catch(err => {
      console.log("❌ DB Connection Failed:", err);
  });

process.on('SIGINT', async () => {
    console.log('🛑 Shutting down...');
    await processManager.shutdown();
    await mongoose.connection.close();
    process.exit(0);
});
