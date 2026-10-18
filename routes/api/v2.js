 const express = require('express');
const router = express.Router();
const Server = require('../../models/Server');
const User = require('../../models/User');
const { processManager, consoleManager } = require('../../services/processManager');
const FileManager = require('../../services/fileManager');
const fs = require('fs-extra');
const path = require('path');
const mongoose = require('mongoose');
const config = require('../../config');

const checkApiKey = async (req, res, next) => {
    const apiKey = req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ success: false, error: 'API key required' });
    const user = await User.findOne({ apiKey: apiKey });
    if (!user) return res.status(401).json({ success: false, error: 'Invalid API key' });
    await user.updateApiKeyUsage();
    req.apiUser = user;
    next();
};

const success = (res, data, message = 'Success') => res.json({ success: true, message, data });
const error = (res, message, code = 400) => res.status(code).json({ success: false, error: message });

router.get('/servers', checkApiKey, async (req, res) => {
    try {
        const servers = await Server.find({ owner: req.apiUser._id }).sort('-createdAt');
        success(res, { total: servers.length, running: servers.filter(s => s.status === 'running').length, stopped: servers.filter(s => s.status === 'stopped').length, servers: servers.map(s => ({ id: s._id, name: s.name, status: s.status, port: s.port, mainFile: s.mainFile, pid: s.pid, createdAt: s.createdAt, lastStart: s.lastStart, autoRestart: s.autoRestart })) }, 'Servers retrieved');
    } catch (err) {
        error(res, err.message, 500);
    }
});

router.get('/servers/:id', checkApiKey, async (req, res) => {
    try {
        const server = await Server.findById(req.params.id);
        if (!server) return error(res, 'Server not found', 404);
        if (server.owner.toString() !== req.apiUser._id.toString() && !req.apiUser.isOwner) return error(res, 'Access denied', 403);
        const status = await processManager.checkStatus(server._id, server.path);
        success(res, { id: server._id, name: server.name, status, port: server.port, mainFile: server.mainFile, pid: server.pid, createdAt: server.createdAt, lastStart: server.lastStart, autoRestart: server.autoRestart, maxRestarts: server.maxRestarts, restartCount: server.restartCount }, 'Server details');
    } catch (err) {
        error(res, err.message, 500);
    }
});

router.post('/servers', checkApiKey, async (req, res) => {
    try {
        const { name, mainFile } = req.body;
        if (!name) return error(res, 'Server name required');
        if (req.apiUser.coins < config.serverCost) return error(res, 'Insufficient coins');
        const serverCount = await Server.countDocuments({ owner: req.apiUser._id });
        if (serverCount >= req.apiUser.maxServers) return error(res, 'Maximum servers limit reached');
        
        const serverId = new mongoose.Types.ObjectId();
        const serverPath = path.join(config.serversPath, req.apiUser._id.toString(), serverId.toString());
        await fs.ensureDir(serverPath);
        
        const defaultCode = `const http = require('http');\nconst server = http.createServer((req, res) => {\n    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });\n    res.end(\`<h1>${name}</h1><p>Server is running!</p>\`);\n});\nserver.listen(process.env.PORT || 3000, () => console.log('Server running'));`;
        await fs.writeFile(path.join(serverPath, mainFile || 'index.js'), defaultCode);
        
        const server = new Server({ _id: serverId, name, owner: req.apiUser._id, port: null, path: serverPath, mainFile: mainFile || 'index.js' });
        await server.save();
        await req.apiUser.deductCoins(config.serverCost);
        
        success(res, { id: server._id, name: server.name, mainFile: server.mainFile }, 'Server created');
    } catch (err) {
        error(res, err.message, 500);
    }
});

router.delete('/servers/:id', checkApiKey, async (req, res) => {
    try {
        const server = await Server.findById(req.params.id);
        if (!server) return error(res, 'Server not found', 404);
        if (server.owner.toString() !== req.apiUser._id.toString()) return error(res, 'Access denied', 403);
        await processManager.stop(server._id, server.path);
        await fs.remove(server.path);
        await Server.findByIdAndDelete(req.params.id);
        success(res, null, 'Server deleted');
    } catch (err) {
        error(res, err.message, 500);
    }
});

router.post('/servers/:id/start', checkApiKey, async (req, res) => {
    try {
        const server = await Server.findById(req.params.id);
        if (!server) return error(res, 'Server not found', 404);
        if (server.owner.toString() !== req.apiUser._id.toString()) return error(res, 'Access denied', 403);
        const result = await processManager.start(server);
        if (result.success) { server.status = 'running'; server.lastStart = new Date(); await server.save(); }
        success(res, { pid: result.pid }, 'Server started');
    } catch (err) {
        error(res, err.message, 500);
    }
});

router.post('/servers/:id/stop', checkApiKey, async (req, res) => {
    try {
        const server = await Server.findById(req.params.id);
        if (!server) return error(res, 'Server not found', 404);
        if (server.owner.toString() !== req.apiUser._id.toString()) return error(res, 'Access denied', 403);
        const result = await processManager.stop(server._id, server.path);
        if (result.success) { server.status = 'stopped'; await server.save(); }
        success(res, null, 'Server stopped');
    } catch (err) {
        error(res, err.message, 500);
    }
});

router.post('/servers/:id/restart', checkApiKey, async (req, res) => {
    try {
        const server = await Server.findById(req.params.id);
        if (!server) return error(res, 'Server not found', 404);
        if (server.owner.toString() !== req.apiUser._id.toString()) return error(res, 'Access denied', 403);
        const result = await processManager.restart(server);
        if (result.success) { server.status = 'running'; await server.save(); }
        success(res, { pid: result.pid }, 'Server restarted');
    } catch (err) {
        error(res, err.message, 500);
    }
});

router.post('/servers/:id/command', checkApiKey, async (req, res) => {
    try {
        const { command } = req.body;
        if (!command) return error(res, 'Command required');
        const server = await Server.findById(req.params.id);
        if (!server) return error(res, 'Server not found', 404);
        if (server.owner.toString() !== req.apiUser._id.toString()) return error(res, 'Access denied', 403);
        const sent = processManager.sendCommand(server._id, command);
        success(res, { sent }, sent ? 'Command sent' : 'Failed to send command');
    } catch (err) {
        error(res, err.message, 500);
    }
});

router.get('/servers/:id/logs', checkApiKey, async (req, res) => {
    try {
        const { lines } = req.query;
        const server = await Server.findById(req.params.id);
        if (!server) return error(res, 'Server not found', 404);
        if (server.owner.toString() !== req.apiUser._id.toString()) return error(res, 'Access denied', 403);
        const logs = consoleManager.getLogs(server._id, parseInt(lines) || 100);
        success(res, { logs }, 'Logs retrieved');
    } catch (err) {
        error(res, err.message, 500);
    }
});

router.get('/servers/:id/files', checkApiKey, async (req, res) => {
    try {
        const { dir } = req.query;
        const server = await Server.findById(req.params.id);
        if (!server) return error(res, 'Server not found', 404);
        if (server.owner.toString() !== req.apiUser._id.toString()) return error(res, 'Access denied', 403);
        const fileManager = new FileManager(server.path);
        const files = await fileManager.listDirectory(dir || '');
        success(res, { path: dir || '/', files: files.map(f => ({ name: f.name, path: f.path, isDirectory: f.isDirectory, size: f.size, modified: f.modified })) }, 'Files retrieved');
    } catch (err) {
        error(res, err.message, 500);
    }
});

router.get('/servers/:id/files/read', checkApiKey, async (req, res) => {
    try {
        const { file } = req.query;
        const server = await Server.findById(req.params.id);
        if (!server) return error(res, 'Server not found', 404);
        if (server.owner.toString() !== req.apiUser._id.toString()) return error(res, 'Access denied', 403);
        const fileManager = new FileManager(server.path);
        const data = await fileManager.readFile(file);
        success(res, { name: path.basename(file), path: file, content: data.content, size: data.size, modified: data.modified }, 'File content retrieved');
    } catch (err) {
        error(res, err.message, 500);
    }
});

router.get('/user', checkApiKey, async (req, res) => {
    success(res, { id: req.apiUser._id, username: req.apiUser.username, email: req.apiUser.email, coins: req.apiUser.coins, maxServers: req.apiUser.maxServers, isOwner: req.apiUser.isOwner, isAdmin: req.apiUser.isAdmin, createdAt: req.apiUser.createdAt }, 'User info');
});

router.get('/stats', checkApiKey, async (req, res) => {
    try {
        const servers = await Server.find({ owner: req.apiUser._id });
        success(res, { servers: { total: servers.length, running: servers.filter(s => s.status === 'running').length, stopped: servers.filter(s => s.status === 'stopped').length }, resources: { coins: req.apiUser.coins, maxServers: req.apiUser.maxServers } }, 'Stats retrieved');
    } catch (err) {
        error(res, err.message, 500);
    }
});

module.exports = router;