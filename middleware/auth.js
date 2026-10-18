const config = require('../config');

const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    res.redirect('/login');
};

const isOwner = (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (req.user.isOwner || config.ownerId === req.user.discordId || config.ownerIds.includes(req.user.discordId)) return next();
    res.status(403).render('error', { message: 'غير مصرح - للمالك فقط', error: { status: 403 } });
};

const isNotBanned = async (req, res, next) => {
    if (req.user?.isBanned) { req.logout(() => {}); return res.render('banned', { reason: req.user.banReason }); }
    next();
};

module.exports = { isAuthenticated, isOwner, isNotBanned };