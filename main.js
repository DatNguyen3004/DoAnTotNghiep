const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let pythonProcess;

const isPackaged = app.isPackaged;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        icon: path.join(__dirname, 'backend/static/image/NuLabel-removebg-preview.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        title: "NuLabel Desktop",
        autoHideMenuBar: true,
        show: false
    });

    mainWindow.maximize();
    mainWindow.setMenu(null);

    const url = 'http://127.0.0.1:8000/login.html';
    
    const checkServer = () => {
        http.get(url, (res) => {
            mainWindow.loadURL(url);
            mainWindow.show();
        }).on('error', (err) => {
            console.log("Đang đợi Server... thử lại sau 1 giây");
            setTimeout(checkServer, 1000);
        });
    };

    checkServer();

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function startPython() {
    console.log("Đang khởi động Backend...");
    
    let serverExe;
    let cwd;

    if (!isPackaged) {
        console.log("Chế độ: Development");
        serverExe = 'python';
        const args = ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'];
        cwd = path.join(__dirname, 'backend');
        pythonProcess = spawn(serverExe, args, { cwd });
    } else {
        console.log("Chế độ: Production");
        // ĐƯỜNG DẪN CỐ ĐỊNH TRONG RESOURCES
        const baseBackendPath = path.join(process.resourcesPath, 'backend', 'dist', 'nulabel-server');
        serverExe = path.join(baseBackendPath, 'nulabel-server.exe');
        cwd = baseBackendPath; // Phải chạy CWD tại đúng folder chứa exe

        if (!fs.existsSync(serverExe)) {
            dialog.showErrorBox("Lỗi", "Không tìm thấy file server tại: " + serverExe);
            return;
        }

        pythonProcess = spawn(serverExe, [], { cwd });
    }

    pythonProcess.stdout.on('data', (data) => console.log(`Backend: ${data}`));
    pythonProcess.stderr.on('data', (data) => console.error(`Backend Error: ${data}`));
    
    pythonProcess.on('close', (code) => {
        console.log(`Backend process exited with code ${code}`);
    });
}

app.on('ready', () => {
    startPython();
    createWindow();
});

app.on('window-all-closed', function () {
    if (pythonProcess) {
        pythonProcess.kill();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
