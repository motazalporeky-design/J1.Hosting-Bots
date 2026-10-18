const express = require('express');
const router = express.Router();

const FileManager = require('./FileManager');

// لازم تكون موجودة أو تستوردها
const getServerPath = (id) => {
    return `/home/container/servers/${id}`; // عدلها حسب نظامك
};

router.post('/servers/:id/files/archive', async (req, res) => {
    try {
        console.log('📦 RAW BODY:', req.body);

        const { paths = [], archiveName = 'archive.zip' } = req.body;

        const serverPath = getServerPath(req.params.id);
        const fm = new FileManager(serverPath);

        console.log('📦 PATHS:', paths);

        const result = await fm.createArchive(paths, archiveName);

        return res.json({
            success: true,
            file: result
        });

    } catch (err) {
        console.error('❌ ARCHIVE ERROR:', err);
        return res.json({
            success: false,
            error: err.message
        });
    }
});

router.post('/servers/:id/start', async (req, res) => {
    res.json({ success: true });
});

router.post('/servers/:id/stop', async (req, res) => {
    res.json({ success: true });
});

router.post('/servers/:id/restart', async (req, res) => {
    res.json({ success: true });
});

module.exports = router;