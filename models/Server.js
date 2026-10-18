const mongoose = require('mongoose');

const ServerSchema = new mongoose.Schema({

    // معلومات السيرفر
    name: {
        type: String,
        required: true
    },

    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },


// =====================
// المتعاونون / الأصدقاء
// =====================

collaborators: [{
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    permissions: {
        view: { type: Boolean, default: true },
        start: { type: Boolean, default: false },
        stop: { type: Boolean, default: false },
        restart: { type: Boolean, default: false },
        console: { type: Boolean, default: false },
        consoleCommand: { type: Boolean, default: false },
        files: { type: Boolean, default: false },
        fileEdit: { type: Boolean, default: false },
        upload: { type: Boolean, default: false },
        deleteFiles: { type: Boolean, default: false },
        packages: { type: Boolean, default: false },
        settings: { type: Boolean, default: false }
    },

    addedAt: {
        type: Date,
        default: Date.now
    }
}],

    pid: Number,

    path: {
        type: String,
        required: true
    },


    // =====================
    // Port + رابط الاستضافة
    // =====================

    port: {
        type: Number
        // ✅ تم نقل unique + sparse إلى الفهرس بالأسفل
    },

    domain: {
        type: String,
        default: null
    },

    url: {
        type: String,
        default: null
    },

    assignedPort: {
        type: Boolean,
        default: false
    },


    status: {
        type: String,
        default: 'stopped'
    },


    mainFile: {
        type: String,
        default: 'index.js'
    },

    language: {
        type: String,
        enum: ['nodejs', 'python'],
        default: 'nodejs'
    },

    subdomain: {
        type: String,
        default: null
    },


    nodeVersion: {
        type: String,
        default: '24'
    },


    // إعدادات التشغيل

    autoRestart: {
        type: Boolean,
        default: false
    },

    maxRestarts: {
        type: Number,
        default: 5
    },

    restartCount: {
        type: Number,
        default: 0
    },


    envVariables: {
        type: Map,
        of: String,
        default: {}
    },


    lastStart: Date,


    createdAt: {
        type: Date,
        default: Date.now
    },


    // =====================
    // خطة الاستضافة
    // =====================

    plan: {
        type: String,
        enum: ['weekly', 'biweekly', 'monthly'],
        default: 'weekly'
    },


    planName: {
        type: String,
        default: 'أسبوع'
    },


    cost: {
        type: Number,
        default: 0
    },


    // =====================
    // موارد الاستضافة
    // =====================

    cpuLimit: {
        type: Number,
        default: 25
    },

    memoryLimit: {
        type: Number,
        default: 256
    },

    diskLimit: {
        type: Number,
        default: 1024
    },


    // =====================
    // استهلاك الموارد
    // =====================

    cpuUsage: {
        type: Number,
        default: 0
    },

    memoryUsage: {
        type: Number,
        default: 0
    },

    diskUsage: {
        type: Number,
        default: 0
    },


    // =====================
    // حظر الموارد
    // =====================

    resourceBlocked: {
        type: Boolean,
        default: false
    },


    resourceBlockReason: {
        type: String,
        default: null
    },


    resourceBlockedAt: {
        type: Date,
        default: null
    },


    // =====================
    // انتهاء الاشتراك
    // =====================

    expiresAt: {
        type: Date,
        default: null
    }

});


// =====================
// 📊 الفهارس (Indexes)
// =====================

// فهرس فريد للـ port (تم نقله من تعريف الحقل)
ServerSchema.index({ port: 1 }, { unique: true, sparse: true });

// فهرس لصاحب السيرفر
ServerSchema.index({ owner: 1 });

// فهرس للحالة
ServerSchema.index({ status: 1 });

// فهرس لانتهاء الاشتراك
ServerSchema.index({ expiresAt: 1 });

// فهرس للمتعاونين
ServerSchema.index({ 'collaborators.user': 1 });

// فهرس مركّب (status + expiresAt) للاستعلامات المركبة
ServerSchema.index({ status: 1, expiresAt: 1 });


// ✅ منع إعادة تعريف الموديل
module.exports = mongoose.models.Server || mongoose.model('Server', ServerSchema);