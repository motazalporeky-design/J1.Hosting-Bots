const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    from: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    to: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    amount: { 
        type: Number, 
        required: true,
        min: 1
    },
    reason: { 
        type: String, 
        required: true 
    },
    type: { 
        type: String,
        enum: ['admin_grant', 'server_create', 'server_renew', 'transfer', 'reward', 'refund'],
        default: 'admin_grant' 
    },
    relatedServer: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Server' 
    },
    balanceAfter: Number,
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// =====================
// 📊 الفهارس (Indexes)
// =====================

// ترتيب زمني سريع (الأكثر استخداماً في /admin)
TransactionSchema.index({ createdAt: -1 });

// معاملات مستخدم معيّن (from) — مع ترتيب زمني
TransactionSchema.index({ from: 1, createdAt: -1 });

// معاملات مستخدم معيّن (to) — مع ترتيب زمني
TransactionSchema.index({ to: 1, createdAt: -1 });

// فلترة حسب النوع
TransactionSchema.index({ type: 1 });

// ربط بالسيرفر (لحذف المعاملات عند حذف السيرفر)
TransactionSchema.index({ relatedServer: 1 });


// =====================
// دوال مساعدة
// =====================

TransactionSchema.statics.getUserTransactions = function(userId, limit = 50) {
    return this.find({
        $or: [{ from: userId }, { to: userId }]
    })
    .populate('from', 'username')
    .populate('to', 'username')
    .sort('-createdAt')
    .limit(limit);
};

TransactionSchema.statics.getTotalSpent = async function(userId) {
    const result = await this.aggregate([
        { $match: { from: mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    return result[0]?.total || 0;
};

TransactionSchema.statics.getTotalReceived = async function(userId) {
    const result = await this.aggregate([
        { $match: { to: mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    return result[0]?.total || 0;
};


// ✅ منع إعادة تعريف الموديل
module.exports = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);