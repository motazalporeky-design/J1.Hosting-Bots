const Server = require('../models/Server');
const config = require('../config');

class PortManager {
    constructor() {
        this.usedPorts = new Set();
        this.initialized = false;
    }

    async initialize() {
        try {
            const servers = await Server.find({ port: { $ne: null } }, 'port');
            this.usedPorts.clear();
            
            if (servers && servers.length > 0) {
                servers.forEach(s => {
                    if (s && s.port) {
                        this.usedPorts.add(s.port);
                    }
                });
            }
            
            this.initialized = true;
            console.log('✅ PortManager initialized, used ports:', this.usedPorts.size);
        } catch (err) {
            console.error('❌ PortManager initialization error:', err);
            this.usedPorts = new Set();
            this.initialized = true;
        }
    }

    // ✅ توليد بورت عشوائي متاح
    async getAvailablePort() {
        if (!this.initialized) {
            await this.initialize();
        }
        
        const min = config.portRange?.start || 10000;
        const max = config.portRange?.end || 65535;
        
        let port;
        let exists = true;
        let attempts = 0;
        const maxAttempts = 1000;
        
        while (exists && attempts < maxAttempts) {
            port = Math.floor(Math.random() * (max - min + 1)) + min;
            exists = this.usedPorts.has(port);
            attempts++;
        }
        
        if (attempts >= maxAttempts) {
            throw new Error('لا توجد منافذ متاحة');
        }
        
        this.usedPorts.add(port);
        return port;
    }

    // ✅ تحرير بورت
    releasePort(port) {
        if (port && this.usedPorts) {
            this.usedPorts.delete(port);
        }
    }

    // ✅ التحقق إذا كان البورت متاح
    isPortAvailable(port) {
        if (!port) return false;
        const min = config.portRange?.start || 10000;
        const max = config.portRange?.end || 65535;
        return !this.usedPorts.has(port) && port >= min && port <= max;
    }

    // ✅ عدد البورتات المستخدمة
    getUsedPortsCount() {
        return this.usedPorts ? this.usedPorts.size : 0;
    }

    // ✅ إجمالي البورتات المتاحة
    getTotalPorts() {
        const min = config.portRange?.start || 10000;
        const max = config.portRange?.end || 65535;
        return max - min + 1;
    }

    // ✅ عدد البورتات المتاحة
    getAvailablePortsCount() {
        const used = this.getUsedPortsCount();
        const total = this.getTotalPorts();
        return Math.max(0, total - used);
    }

    // ✅ الحصول على جميع البورتات المستخدمة
    getUsedPorts() {
        return Array.from(this.usedPorts);
    }

    // ✅ حجز بورت محدد
    reservePort(port) {
        if (!this.isPortAvailable(port)) {
            return false;
        }
        this.usedPorts.add(port);
        return true;
    }

    // ✅ إعادة تعيين
    reset() {
        this.usedPorts.clear();
        this.initialized = false;
    }
}

module.exports = new PortManager();