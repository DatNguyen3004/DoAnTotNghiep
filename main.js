const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess;

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
        resizable: true, // Cho phép thay đổi kích thước
        maximizable: true, // Mở lại nút phóng to/thu nhỏ
        frame: true,
        show: false
    });

    mainWindow.maximize(); 
    mainWindow.show();
    mainWindow.setMenu(null); // Xóa bỏ thanh menu trắng (nguyên nhân gây 'hở')

    // Mở trang login của ứng dụng
    const url = 'http://127.0.0.1:8000/static/login.html';
    
    mainWindow.loadURL(url).catch(err => {
        console.log("Đang đợi Server... thử lại sau 2 giây");
        setTimeout(() => {
            mainWindow.loadURL(url);
        }, 2000);
    });

    // Ép buộc kích thước cố định cho TẤT CẢ các trang
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.insertCSS(`
            body { 
                min-width: 1300px !important; 
                min-height: 850px !important; 
                overflow: auto !important; 
            }
        `);
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

// Khởi động Backend Python (FastAPI)
function startPython() {
    console.log("Đang khởi động Backend...");
    
    // Chạy lệnh uvicorn giống như bạn chạy ở terminal
    // Lưu ý: Cần cd vào thư mục backend trước hoặc chỉ định rõ đường dẫn
    pythonProcess = spawn('python', ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], {
        cwd: path.join(__dirname, 'backend')
    });

    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python Error: ${data}`);
    });
}

app.on('ready', () => {
    startPython();
    // Đợi 5 giây để server kịp khởi động hoàn toàn (đề phòng máy load chậm)
    setTimeout(createWindow, 5000);
});

app.on('window-all-closed', function () {
    // Khi tắt app, tắt luôn process Python
    if (pythonProcess) {
        console.log("Đang tắt Backend...");
        pythonProcess.kill();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
