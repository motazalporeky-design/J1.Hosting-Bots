 const express = require('express');
const router = express.Router();
const Server = require('../../models/Server');
const User = require('../../models/User');
const { processManager } = require('../../services/processManager');

const checkApiKey = async (req, res, next) => {
    const apiKey =
        req.headers['authorization']?.replace('Bearer ', '') ||
        req.headers['x-api-key'];

    if (!apiKey) return res.status(401).json({ error: 'API key required' });

    const user = await User.findOne({ apiKey });
    if (!user) return res.status(401).json({ error: 'Invalid API key' });

    await user.updateApiKeyUsage();
    req.apiUser = user;
    next();
};

router.get('/servers/:id', checkApiKey, async (req, res) => {
    try {
        const server = await Server.findById(req.params.id);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        if (server.owner.toString() !== req.apiUser._id.toString() && !req.apiUser.isOwner) {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.json({ id: server._id, name: server.name, status: server.status, port: server.port, mainFile: server.mainFile, createdAt: server.createdAt, lastStart: server.lastStart });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/servers', checkApiKey, async (req, res) => {
    try {
        const servers = await Server.find({ owner: req.apiUser._id });
        res.json({ total: servers.length, servers: servers.map(s => ({ id: s._id, name: s.name, status: s.status, port: s.port, createdAt: s.createdAt })) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/servers/:id/start', checkApiKey, async (req, res) => {
    try {
        const server = await Server.findById(req.params.id);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        if (server.owner.toString() !== req.apiUser._id.toString()) return res.status(403).json({ error: 'Access denied' });
        const result = await processManager.start(server);
        if (result.success) { server.status = 'running'; server.lastStart = new Date(); await server.save(); }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/servers/:id/stop', checkApiKey, async (req, res) => {
    try {
        const server = await Server.findById(req.params.id);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        if (server.owner.toString() !== req.apiUser._id.toString()) return res.status(403).json({ error: 'Access denied' });
        const result = await processManager.stop(server._id, server.path);
        if (result.success) { server.status = 'stopped'; await server.save(); }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/servers/:id/restart', checkApiKey, async (req, res) => {
    try {
        const server = await Server.findById(req.params.id);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        if (server.owner.toString() !== req.apiUser._id.toString()) return res.status(403).json({ error: 'Access denied' });
        const result = await processManager.restart(server);
        if (result.success) { server.status = 'running'; await server.save(); }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/servers/:id/command', checkApiKey, async (req, res) => {
    try {
        const { command } = req.body;
        if (!command) return res.status(400).json({ error: 'Command required' });
        const server = await Server.findById(req.params.id);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        if (server.owner.toString() !== req.apiUser._id.toString()) return res.status(403).json({ error: 'Access denied' });
        const sent = processManager.sendCommand(server._id, command);
        res.json({ success: sent });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/user', checkApiKey, async (req, res) => {
    res.json({ id: req.apiUser._id, username: req.apiUser.username, email: req.apiUser.email, coins: req.apiUser.coins, maxServers: req.apiUser.maxServers, isOwner: req.apiUser.isOwner, isAdmin: req.apiUser.isAdmin });
});

module.exports = router;