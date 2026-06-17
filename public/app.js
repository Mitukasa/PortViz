const { ipcRenderer } = require('electron');

// DOM 元素
const portList = document.getElementById('portList');
const refreshBtn = document.getElementById('refreshBtn');
const autoRefreshBtn = document.getElementById('autoRefreshBtn');
const searchInput = document.getElementById('searchInput');
const lastUpdate = document.getElementById('lastUpdate');
const totalPorts = document.getElementById('totalPorts');
const totalProcesses = document.getElementById('totalProcesses');
const confirmDialog = document.getElementById('confirmDialog');
const confirmPort = document.getElementById('confirmPort');
const confirmPid = document.getElementById('confirmPid');
const confirmProcess = document.getElementById('confirmProcess');
const confirmKillBtn = document.getElementById('confirmKillBtn');
const cancelBtn = document.getElementById('cancelBtn');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const toast = document.getElementById('toast');
const minimizeBtn = document.getElementById('minimizeBtn');
const maximizeBtn = document.getElementById('maximizeBtn');
const closeBtn = document.getElementById('closeBtn');

// 状态
let ports = [];
let autoRefreshInterval = null;
let currentKillPid = null;

// 窗口控制
minimizeBtn.addEventListener('click', () => ipcRenderer.send('minimize-window'));
maximizeBtn.addEventListener('click', () => ipcRenderer.send('maximize-window'));
closeBtn.addEventListener('click', () => ipcRenderer.send('close-window'));

// 获取端口列表
async function fetchPorts() {
    try {
        const result = await ipcRenderer.invoke('get-ports');

        if (result.success) {
            ports = result.data;
            renderPorts(ports);
            updateStats();
            updateTime();
        } else {
            showError('获取端口信息失败: ' + result.error);
        }
    } catch (err) {
        showError('获取端口信息失败: ' + err.message);
    }
}

// 渲染端口列表
function renderPorts(portsToRender) {
    if (portsToRender.length === 0) {
        portList.innerHTML = '<div class="empty">没有找到匹配的端口</div>';
        return;
    }

    portList.innerHTML = portsToRender.map(port => {
        // 构建徽章
        let badges = '';
        if (port.isSystem) {
            badges += '<span class="badge badge-system">系统</span>';
        }
        if (port.isDatabase) {
            badges += `<span class="badge badge-database" title="${port.dbType}">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <ellipse cx="12" cy="5" rx="9" ry="3"/>
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
                ${port.dbType}
            </span>`;
        }

        // Web 链接
        const webLink = port.isWeb ? `<a href="#" class="web-link" onclick="openUrl('${port.webUrl}'); return false;" title="打开 ${port.webUrl}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
        </a>` : '';

        // 端口项类名
        let itemClass = 'port-item';
        if (port.isSystem) itemClass += ' system-port';
        if (port.isDatabase) itemClass += ' database-port';

        return `
        <div class="${itemClass}" data-port="${port.port}" data-pid="${port.pid}">
            <div class="port-number">:${port.port}</div>
            <div class="process-info">
                <div class="process-name">
                    ${escapeHtml(port.processName)}
                    ${badges}
                </div>
                <div class="process-pid">PID: ${port.pid}</div>
            </div>
            <div class="port-actions-group">
                ${webLink}
                <button class="btn-kill" onclick="showKillConfirm(${port.port}, '${escapeHtml(port.processName).replace(/'/g, "\\'")}', '${port.pid}', ${port.isSystem})">
                    关闭
                </button>
            </div>
        </div>
    `}).join('');
}

// 打开链接
function openUrl(url) {
    ipcRenderer.send('open-url', url);
}

// 更新统计信息
function updateStats() {
    totalPorts.textContent = ports.length;
    const uniquePids = new Set(ports.map(p => p.pid));
    totalProcesses.textContent = uniquePids.size;
}

// 更新时间
function updateTime() {
    const now = new Date();
    lastUpdate.textContent = `最后更新: ${now.toLocaleTimeString()}`;
}

// 搜索过滤
function filterPorts() {
    const keyword = searchInput.value.toLowerCase().trim();
    if (!keyword) {
        renderPorts(ports);
        return;
    }

    const filtered = ports.filter(port =>
        port.port.toString().includes(keyword) ||
        port.processName.toLowerCase().includes(keyword) ||
        port.pid.toString().includes(keyword)
    );
    renderPorts(filtered);
}

// 显示关闭确认
function showKillConfirm(port, processName, pid, isSystem) {
    currentKillPid = pid;
    confirmPort.textContent = port;
    confirmPid.textContent = pid;
    confirmProcess.textContent = processName;

    // 显示系统进程警告
    const systemWarning = document.getElementById('systemWarning');
    if (isSystem) {
        systemWarning.classList.remove('hidden');
    } else {
        systemWarning.classList.add('hidden');
    }

    confirmDialog.classList.remove('hidden');
}

// 隐藏确认对话框
function hideKillConfirm() {
    confirmDialog.classList.add('hidden');
    currentKillPid = null;
}

// 执行关闭操作
async function killProcess() {
    if (!currentKillPid) return;

    try {
        const result = await ipcRenderer.invoke('kill-process', currentKillPid);

        if (result.success) {
            showSuccess(`端口已关闭 (PID: ${currentKillPid})`);
            hideKillConfirm();
            // 刷新列表
            setTimeout(fetchPorts, 500);
        } else {
            showError('关闭失败: ' + result.error);
        }
    } catch (err) {
        showError('操作失败: ' + err.message);
    }
}

// 切换自动刷新
function toggleAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        autoRefreshBtn.classList.remove('active');
    } else {
        autoRefreshInterval = setInterval(fetchPorts, 3000);
        autoRefreshBtn.classList.add('active');
    }
}

// 显示提示信息
function showToast(message, type = '') {
    toast.textContent = message;
    toast.className = 'toast ' + type;
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function showSuccess(message) {
    showToast(message, 'success');
}

function showError(message) {
    showToast(message, 'error');
}

// HTML 转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 事件监听
refreshBtn.addEventListener('click', fetchPorts);
autoRefreshBtn.addEventListener('click', toggleAutoRefresh);
searchInput.addEventListener('input', filterPorts);
confirmKillBtn.addEventListener('click', killProcess);
cancelBtn.addEventListener('click', hideKillConfirm);
modalCloseBtn.addEventListener('click', hideKillConfirm);

// 初始加载
fetchPorts();
