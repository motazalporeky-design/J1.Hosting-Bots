const socket = io();

socket.on('serverStatus', (data) => {
    const card = document.querySelector(`[data-server-id="${data.id}"]`);
    if (card) {
        const statusEl = card.querySelector('.server-status');
        statusEl.className = `server-status status-${data.status}`;
        statusEl.textContent = data.status === 'running' ? '🟢 يعمل' : data.status === 'error' ? '🔴 خطأ' : '⚫ متوقف';
        
        const actionsDiv = card.querySelector('.server-actions');
        const serverId = data.id;
        
        let actionsHtml = `<a href="/servers/${serverId}" class="btn btn-sm">🔧 إدارة</a>`;
        if (data.status === 'running') {
            actionsHtml += `
                <button class="btn btn-sm btn-warning" onclick="serverAction('${serverId}', 'stop')">⏹️ إيقاف</button>
                <button class="btn btn-sm btn-info" onclick="serverAction('${serverId}', 'restart')">🔄 إعادة</button>
            `;
        } else {
            actionsHtml += `<button class="btn btn-sm btn-success" onclick="serverAction('${serverId}', 'start')">▶️ تشغيل</button>`;
        }
        actionsHtml += `<button class="btn btn-sm btn-danger" onclick="serverAction('${serverId}', 'delete')">🗑️ حذف</button>`;
        actionsDiv.innerHTML = actionsHtml;
    }
});

async function serverAction(id, action) {
    if (action === 'delete' && !confirm('هل أنت متأكد من حذف هذا السيرفر؟')) return;
    try {
        const res = await fetch(`/servers/${id}/${action}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            if (action === 'delete') location.reload();
        } else {
            alert(data.error);
        }
    } catch (err) {
        alert('حدث خطأ');
    }
}