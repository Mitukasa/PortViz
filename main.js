const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const http = require('http');

let mainWindow;

// 系统进程列表（Windows 常见系统进程）
const SYSTEM_PROCESSES = [
    'system', 'svchost.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe',
    'services.exe', 'lsass.exe', 'smss.exe', 'explorer.exe', 'dwm.exe',
    'taskhostw.exe', 'taskhost.exe', 'spoolsv.exe', 'msdtc.exe',
    'wmiapsrv.exe', 'wmiprvse.exe', 'conhost.exe', 'ctfmon.exe',
    'sihost.exe', 'fontdrvhost.exe', 'runtimebroker.exe', 'searchui.exe',
    'searchapp.exe', 'startmenuexperience.exe', 'shellexperiencehost.exe',
    'applicationframehost.exe', 'systemsettings.exe', 'windows.internal.shellcommon.tokenbrokerelevatedcomponent.exe'
];

// 常见 Web 服务端口
const WEB_PORTS = [80, 443, 8080, 8000, 8888, 3000, 3001, 4200, 5000, 5173, 5174, 8081, 8443, 9000];

// 数据库端口映射
const DATABASE_PORTS = {
    1433: 'SQL Server',
    1434: 'SQL Server Browser',
    1521: 'Oracle',
    3306: 'MySQL',
    3307: 'MySQL',
    5432: 'PostgreSQL',
    5433: 'PostgreSQL',
    6379: 'Redis',
    6380: 'Redis',
    27017: 'MongoDB',
    27018: 'MongoDB',
    27019: 'MongoDB Config',
    28017: 'MongoDB Web',
    9042: 'Cassandra',
    9160: 'Cassandra Thrift',
    7000: 'Cassandra',
    8086: 'InfluxDB',
    8083: 'InfluxDB Admin',
    7474: 'Neo4j',
    7687: 'Neo4j Bolt',
    5984: 'CouchDB',
    5672: 'RabbitMQ',
    15672: 'RabbitMQ Management',
    9092: 'Kafka',
    2181: 'ZooKeeper',
    11211: 'Memcached',
    6381: 'Redis Sentinel',
    26257: 'CockroachDB',
    26258: 'CockroachDB HTTP',
    8529: 'ArangoDB',
    9200: 'Elasticsearch',
    9300: 'Elasticsearch Transport'
};

// 数据库进程名映射
const DATABASE_PROCESSES = {
    'mysqld.exe': 'MySQL',
    'mysql.exe': 'MySQL',
    'postgres.exe': 'PostgreSQL',
    'pg_ctl.exe': 'PostgreSQL',
    'mongod.exe': 'MongoDB',
    'mongos.exe': 'MongoDB',
    'redis-server.exe': 'Redis',
    'redis-cli.exe': 'Redis',
    'sqlservr.exe': 'SQL Server',
    'oracle.exe': 'Oracle',
    'tnslsnr.exe': 'Oracle Listener',
    'cassandra.exe': 'Cassandra',
    'influxd.exe': 'InfluxDB',
    'neo4j.exe': 'Neo4j',
    'couchdb.exe': 'CouchDB',
    'rabbitmq-server.exe': 'RabbitMQ',
    'erl.exe': 'RabbitMQ',
    'kafka.exe': 'Kafka',
    'java.exe': 'Kafka/ZooKeeper',
    'memcached.exe': 'Memcached',
    'cockroach.exe': 'CockroachDB',
    'arangod.exe': 'ArangoDB',
    'elasticsearch.exe': 'Elasticsearch'
};

// 检测 HTTP 服务
function detectHttpService(port) {
    return new Promise((resolve) => {
        // 常见 Web 端口或范围直接认为是 Web 服务
        if (WEB_PORTS.includes(port) || (port >= 3000 && port <= 9000)) {
            const req = http.get(`http://localhost:${port}`, { timeout: 1500 }, (res) => {
                resolve({ isWeb: true, url: `http://localhost:${port}`, statusCode: res.statusCode });
                res.destroy();
            });
            req.on('error', () => {
                // 尝试 HTTPS
                resolve({ isWeb: false, url: null });
            });
            req.on('timeout', () => {
                req.destroy();
                resolve({ isWeb: false, url: null });
            });
        } else {
            resolve({ isWeb: false, url: null });
        }
    });
}

// 判断是否是系统进程
function isSystemProcess(processName) {
    if (!processName) return false;
    const lowerName = processName.toLowerCase();
    return SYSTEM_PROCESSES.some(sysProc => lowerName === sysProc || lowerName === sysProc.toLowerCase());
}

// 检测数据库服务
function detectDatabaseService(port, processName) {
    // 通过端口检测
    if (DATABASE_PORTS[port]) {
        return { isDatabase: true, dbType: DATABASE_PORTS[port] };
    }

    // 通过进程名检测
    if (processName) {
        const lowerName = processName.toLowerCase();
        for (const [proc, dbType] of Object.entries(DATABASE_PROCESSES)) {
            if (lowerName.includes(proc.toLowerCase().replace('.exe', ''))) {
                return { isDatabase: true, dbType: dbType };
            }
        }
    }

    return { isDatabase: false, dbType: null };
}

// 获取端口占用信息
function getPortInfo() {
    return new Promise((resolve) => {
        exec('netstat -ano | findstr LISTENING', (error, stdout) => {
            if (error) {
                resolve([]);
                return;
            }

            const lines = stdout.split('\n').filter(line => line.trim());
            const portMap = new Map();

            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 5) {
                    const localAddr = parts[1];
                    const pid = parts[4];
                    const addrParts = localAddr.split(':');
                    const port = addrParts[addrParts.length - 1];

                    if (!isNaN(port) && port > 0) {
                        if (!portMap.has(port)) {
                            portMap.set(port, {
                                port: parseInt(port),
                                pid: pid,
                                processName: 'Unknown',
                                address: localAddr
                            });
                        }
                    }
                }
            });

            resolve(Array.from(portMap.values()));
        });
    });
}

// 获取进程详细信息
function getProcessInfo(pid) {
    return new Promise((resolve) => {
        exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, (error, stdout) => {
            if (error) {
                resolve({ name: 'Unknown', command: '' });
                return;
            }

            const lines = stdout.trim().split('\n');
            if (lines.length > 0) {
                const parts = lines[0].match(/"([^"]*)"/g);
                if (parts && parts.length >= 1) {
                    const name = parts[0].replace(/"/g, '');
                    resolve({ name: name, command: name });
                } else {
                    resolve({ name: 'Unknown', command: '' });
                }
            } else {
                resolve({ name: 'Unknown', command: '' });
            }
        });
    });
}

// 关闭进程
function killProcess(pid) {
    return new Promise((resolve, reject) => {
        exec(`taskkill /F /PID ${pid}`, (error) => {
            if (error) {
                reject(new Error(`Failed to kill process ${pid}`));
            } else {
                resolve({ success: true, pid: pid });
            }
        });
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 450,
        height: 650,
        transparent: true,
        frame: false,
        resizable: true,
        alwaysOnTop: false,
        skipTaskbar: false,
        backgroundColor: '#00000000',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        titleBarStyle: 'hidden',
        titleBarOverlay: false,
        minWidth: 350,
        minHeight: 400,
        roundedCorners: true,
        hasShadow: false,
        title: ''
    });

    // Windows 上使用亚克力效果
    if (process.platform === 'win32') {
        const { BrowserWindow } = require('electron');
        try {
            mainWindow.setGlassEffect && mainWindow.setGlassEffect({
                effect: 'acrylic',
                tint: 'rgba(255, 255, 255, 0.1)'
            });
        } catch (e) {
            // 忽略不支持的情况
        }
    }

    mainWindow.loadFile('public/index.html');

    // 窗口控制
    ipcMain.on('close-window', () => {
        mainWindow.close();
    });

    ipcMain.on('minimize-window', () => {
        mainWindow.minimize();
    });

    ipcMain.on('maximize-window', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });

    // 获取端口列表
    ipcMain.handle('get-ports', async () => {
        try {
            const ports = await getPortInfo();
            const detailedPorts = await Promise.all(
                ports.map(async (portInfo) => {
                    const procInfo = await getProcessInfo(portInfo.pid);
                    const isSystem = isSystemProcess(procInfo.name);
                    const webInfo = await detectHttpService(portInfo.port);
                    const dbInfo = detectDatabaseService(portInfo.port, procInfo.name);

                    return {
                        ...portInfo,
                        processName: procInfo.name,
                        command: procInfo.command,
                        isSystem: isSystem,
                        isWeb: webInfo.isWeb,
                        webUrl: webInfo.url,
                        isDatabase: dbInfo.isDatabase,
                        dbType: dbInfo.dbType
                    };
                })
            );

            const uniquePorts = Array.from(
                new Map(detailedPorts.map(p => [p.port, p])).values()
            ).sort((a, b) => a.port - b.port);

            return { success: true, data: uniquePorts };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // 关闭进程
    ipcMain.handle('kill-process', async (event, pid) => {
        try {
            const result = await killProcess(pid);
            return result;
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // 打开链接
    ipcMain.on('open-url', (event, url) => {
        shell.openExternal(url);
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
