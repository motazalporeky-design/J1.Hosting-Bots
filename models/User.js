const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true },
    password: String,
    discordId: { type: String },
    discordAvatar: String,
    discordEmail: String,
    
    isOwner: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    banReason: String,
    
    coins: { type: Number, default: 0 },
    totalCoinsEarned: { type: Number, default: 0 },
    maxServers: { type: Number, default: 2 },
    
    lastLogin: Date,
    lastLoginIP: String,
    sessionToken: String,
    sessionExpires: Date,
    
    apiKey: { type: String },
    apiKeyPrefix: { type: String, default: 'hp_' },
    apiKeyCreatedAt: Date,
    apiKeyLastUsed: Date,
    
    createdAt: { type: Date, default: Date.now }
});

// توليد API Key
UserSchema.methods.generateApiKey = function() {
    const config = require('../config');
    const siteName = config.siteName || 'Host Panel';
    const words = siteName.split(/\s+/);
    let prefix = '';
    
    if (words.length >= 2) {
        prefix = words.map(w => w[0]).join('').toLowerCase() + '_';
    } else {
        prefix = siteName.substring(0, 2).toLowerCase() + '_';
    }
    
    const randomKey = crypto.randomBytes(24).toString('hex');
    this.apiKey = prefix + randomKey;
    this.apiKeyPrefix = prefix;
    this.apiKeyCreatedAt = new Date();
    
    return this.apiKey;
};

UserSchema.methods.revokeApiKey = function() {
    this.apiKey = null;
    this.apiKeyCreatedAt = null;
    this.apiKeyLastUsed = null;
    return this.save();
};

UserSchema.methods.updateApiKeyUsage = function() {
    this.apiKeyLastUsed = new Date();
    return this.save();
};

UserSchema.statics.findByApiKey = function(apiKey) {
    return this.findOne({ apiKey: apiKey });
};

UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        this.password = await bcrypt.hash(this.password, 10);
        next();
    } catch (err) {
        next(err);
    }
});

UserSchema.methods.comparePassword = function(password) {
    return bcrypt.compare(password, this.password);
};

UserSchema.methods.addCoins = async function(amount) {
    this.coins += amount;
    this.totalCoinsEarned += amount;
    return this.save();
};

UserSchema.methods.deductCoins = async function(amount) {
    if (this.coins < amount) throw new Error('رصيد غير كافي');
    this.coins -= amount;
    return this.save();
};

// ✅ الفهارس معرّفة هنا فقط (مصدر واحد للحقيقة)
UserSchema.index({ discordId: 1 }, { unique: true, sparse: true });
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ apiKey: 1 }, { unique: true, sparse: true });

// ✅ منع إعادة تعريف الموديل
module.exports = mongoose.models.User || mongoose.model('User', UserSchema);