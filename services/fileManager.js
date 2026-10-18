const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const tar = require('tar');

class FileManager {
    constructor(serverPath) { this.serverPath = serverPath; }

    async listDirectory(relativePath = '') {
        const fullPath = path.join(this.serverPath, relativePath);
        if (!await fs.pathExists(fullPath)) throw new Error('المسار غير موجود');
        const items = await fs.readdir(fullPath);
        const result = [];
        for (const item of items) {
            const itemPath = path.join(fullPath, item);
            const stats = await fs.stat(itemPath);
            result.push({ name: item, path: relativePath ? path.join(relativePath, item) : item, isDirectory: stats.isDirectory(), size: stats.size, modified: stats.mtime });
        }
        return result.sort((a, b) => { if (a.isDirectory && !b.isDirectory) return -1; if (!a.isDirectory && b.isDirectory) return 1; return a.name.localeCompare(b.name); });
    }

    async readFile(relativePath) {
        const fullPath = path.join(this.serverPath, relativePath);
        if (!await fs.pathExists(fullPath)) throw new Error('الملف غير موجود');
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) throw new Error('لا يمكن قراءة مجلد');
        const content = await fs.readFile(fullPath, 'utf8');
        return { content, size: stats.size, modified: stats.mtime };
    }

    async saveFile(relativePath, content) {
        const fullPath = path.join(this.serverPath, relativePath);
        await fs.writeFile(fullPath, content, 'utf8');
        return true;
    }

    async createFile(relativePath, content = '') {
        const fullPath = path.join(this.serverPath, relativePath);
        if (await fs.pathExists(fullPath)) throw new Error('الملف موجود');
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, content, 'utf8');
        return true;
    }

    async createFolder(relativePath) {
        const fullPath = path.join(this.serverPath, relativePath);
        if (await fs.pathExists(fullPath)) throw new Error('المجلد موجود');
        await fs.ensureDir(fullPath);
        return true;
    }

    async delete(relativePath) {
        const fullPath = path.join(this.serverPath, relativePath);
        if (fullPath === this.serverPath) throw new Error('لا يمكن حذف المجلد الرئيسي');
        if (!await fs.pathExists(fullPath)) throw new Error('المسار غير موجود');
        await fs.remove(fullPath);
        return true;
    }

    async rename(oldPath, newName) {
        const fullOldPath = path.join(this.serverPath, oldPath);
        const fullNewPath = path.join(path.dirname(fullOldPath), newName);
        if (!await fs.pathExists(fullOldPath)) throw new Error('المسار غير موجود');
        if (await fs.pathExists(fullNewPath)) throw new Error('الاسم موجود');
        await fs.move(fullOldPath, fullNewPath);
        return path.join(path.dirname(oldPath), newName);
    }



    async extractTar(tarPath, extractTo = '') {
    const fullTarPath = path.join(
        this.serverPath,
        tarPath
    );

    const extractPath = extractTo
        ? path.join(this.serverPath, extractTo)
        : this.serverPath;

    if (!await fs.pathExists(fullTarPath))
        throw new Error('ملف الأرشيف غير موجود');

await tar.x({
    file: fullTarPath,
    cwd: extractPath,
    gzip: true
});

    return true;
}

async extractZip(zipPath, extractTo = '') {
    const fullZipPath = path.join(this.serverPath, zipPath);

    const extractPath = extractTo
        ? path.join(this.serverPath, extractTo)
        : this.serverPath;

    if (!await fs.pathExists(fullZipPath)) {
        throw new Error('ملف ZIP غير موجود');
    }

    await fs.ensureDir(extractPath);

    const zip = new AdmZip(fullZipPath);
    zip.extractAllTo(extractPath, true);

    return true;
}

        async extractArchive(archivePath, extractTo = '') {
        const ext = path.extname(archivePath).toLowerCase();

        if (ext === '.zip')
            return this.extractZip(archivePath, extractTo);

        if (
            ext === '.tar' ||
            archivePath.endsWith('.tar.gz') ||
            archivePath.endsWith('.tgz')
        ) {
            return this.extractTar(archivePath, extractTo);
        }

        throw new Error('نوع الأرشيف غير مدعوم');
    }

    async deleteMultiple(paths) {
        for (const p of paths) {
            const fullPath = path.join(this.serverPath, p);

            if (!await fs.pathExists(fullPath))
                continue;

            if (fullPath === this.serverPath)
                continue;

            await fs.remove(fullPath);
        }

        return true;
    }

async createArchive(files = [], archiveName = "archive.zip") {

    if (!Array.isArray(files)) {
        console.log("❌ INVALID FILES:", files);
        files = [];
    }

    console.log("📦 createArchive INPUT:", files);

    const zip = new AdmZip();

    for (const file of files) {
        const fullPath = path.join(this.serverPath, file);

        console.log("➡️ file:", file);
        console.log("➡️ fullPath:", fullPath);

        if (!await fs.pathExists(fullPath)) {
            console.log("❌ NOT FOUND:", fullPath);
            continue;
        }

        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
            zip.addLocalFolder(fullPath, file);
        } else {
            zip.addFile(file, await fs.readFile(fullPath));
        }
    }

    console.log("📦 FINAL ENTRIES:", zip.getEntries().length);

    const archivePath = path.join(this.serverPath, archiveName);
    zip.writeZip(archivePath);

    return archiveName;
}

}

module.exports = FileManager;