const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');

class ConsoleManager extends EventEmitter {
    constructor() {
        super();
        this.io = null;
        this.logBuffers = new Map();
        this.maxLogLines = 1000;
    }

    setSocketIO(io) {
        this.io = io;
    }

    // ✅ إرسال لوج للكونسول
    emitLog(serverId, type, message) {
        if (!this.logBuffers.has(serverId)) {
            this.logBuffers.set(serverId, []);
        }
        const logs = this.logBuffers.get(serverId);
        logs.push({ type, message, timestamp: Date.now() });
        if (logs.length > this.maxLogLines) logs.shift();

        this.emit('output', serverId, type, message);

        if (this.io) {
            this.io.to('server:' + serverId).emit('console-log', {
                type: type,
                message: message,
                timestamp: Date.now()
            });
        }
    }

    stdout(serverId, message) { this.emitLog(serverId, 'stdout', message); }
    stderr(serverId, message) { this.emitLog(serverId, 'stderr', message); }
    info(serverId, message) { this.emitLog(serverId, 'info', message); }
    success(serverId, message) { this.emitLog(serverId, 'success', message); }
    warn(serverId, message) { this.emitLog(serverId, 'warning', message); }
    error(serverId, message) { this.emitLog(serverId, 'error', message); }
    command(serverId, command) { this.emitLog(serverId, 'command', `> ${command}`); }

    saveToFile(serverPath, message) {
        try {
            const logDir = path.join(serverPath, 'logs');
            fs.ensureDirSync(logDir);
            const logFile = path.join(logDir, 'bot.log');
            fs.appendFileSync(logFile, message);
        } catch (err) {
            console.error('Failed to save log:', err.message);
        }
    }

    sendAndSave(serverId, serverPath, type, message) {
        this.emitLog(serverId, type, message);
        this.saveToFile(serverPath, message);
    }

    async loadFromFile(serverId, serverPath, lines = 100) {
        const logFile = path.join(serverPath, 'logs', 'bot.log');
        
        if (!await fs.pathExists(logFile)) {
            this.info(serverId, '📟 لا توجد لوجات سابقة\n');
            return;
        }

        try {
            const content = await fs.readFile(logFile, 'utf8');
            const allLines = content.split('\n');
            const lastLines = allLines.slice(-lines);
            
            this.info(serverId, '📋 === لوجات سابقة ===\n');
            for (const line of lastLines) {
                if (line.trim()) {
                    this.stdout(serverId, line + '\n');
                }
            }
            this.info(serverId, '📋 === نهاية اللوجات ===\n');
        } catch (err) {
            this.error(serverId, `❌ خطأ في قراءة اللوجات: ${err.message}\n`);
        }
    }

    async clearFile(serverPath) {
        const logFile = path.join(serverPath, 'logs', 'bot.log');
        if (await fs.pathExists(logFile)) {
            await fs.writeFile(logFile, '');
        }
    }

    // ✅ إضافة دالة clearBuffer
    clearBuffer(serverId) {
        if (this.logBuffers.has(serverId)) {
            this.logBuffers.set(serverId, []);
        }
    }

    // ✅ إضافة دالة getLogs
    getLogs(serverId, lines = 100) {
        const logs = this.logBuffers.get(serverId) || [];
        return logs.slice(-lines).map(l => l.message).join('');
    }

    // ✅ إضافة دالة getLogsWithType
    getLogsWithType(serverId, lines = 100) {
        const logs = this.logBuffers.get(serverId) || [];
        return logs.slice(-lines);
    }

    async clear(serverId, serverPath) {
        this.clearBuffer(serverId);
        await this.clearFile(serverPath);
        this.success(serverId, '✅ تم مسح جميع اللوجات\n');
    }
}

module.exports = new ConsoleManager();