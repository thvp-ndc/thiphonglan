const express = require('express');
const http = require('node:http');
const path = require('node:path');
const cors = require('cors');
const { Server } = require('socket.io');

const apiRoutes = require('./routes/api');
const { setupSocketIO } = require('./services/socketHandler');
const { UdpDiscoveryService, getLocalIpAddress } = require('./services/udpDiscovery');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Setup Socket.IO with CORS enabled for LAN access
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.set('port', PORT);
app.set('io', io);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets if built
const staticPath = path.join(__dirname, '..', 'public');
app.use(express.static(staticPath));

// API Routes
app.use('/api', apiRoutes);

// Setup WebSockets
setupSocketIO(io);

// Start UDP Discovery Beacon
const udpBeacon = new UdpDiscoveryService(PORT);
app.set('udpBeacon', udpBeacon);
udpBeacon.start();

// Fallback to index.html for SPA client routing if client is built in public
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexPath = path.join(staticPath, 'index.html');
  if (require('node:fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // If frontend hasn't been built to public yet, provide an informative status page
    const localIp = getLocalIpAddress();
    res.send(`
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <title>Hệ Thống Thi Mạng LAN - Máy Chủ Khảo Thí</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; margin: 0; }
          .card { background: #1e293b; max-width: 800px; margin: 0 auto; border-radius: 12px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
          h1 { color: #38bdf8; margin-top: 0; font-size: 28px; }
          .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 14px; font-weight: bold; background: #059669; color: #fff; margin-bottom: 20px; }
          .info-box { background: #0f172a; border-left: 4px solid #38bdf8; padding: 16px; border-radius: 6px; margin: 20px 0; }
          .btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; margin-right: 12px; transition: 0.2s; }
          .btn:hover { background: #1d4ed8; }
          .btn-student { background: #10b981; }
          .btn-student:hover { background: #059669; }
          code { background: #334155; padding: 2px 6px; border-radius: 4px; color: #facc15; font-size: 15px; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">SERVER ĐANG HOẠT ĐỘNG (ONLINE)</span>
          <h1>Máy Chủ Thi Trực Tiếp Qua Mạng LAN</h1>
          <p>Hệ thống máy chủ đã sẵn sàng phục vụ phòng máy thi trắc nghiệm và tự luận.</p>
          <div class="info-box">
            <p>🌐 <strong>Địa chỉ máy chủ LAN:</strong> <code>http://${localIp}:${PORT}</code></p>
            <p>📡 <strong>Tín hiệu UDP Beacon:</strong> Đang phát sóng định kỳ trên cổng <code>41234</code></p>
            <p>💾 <strong>Cơ sở dữ liệu:</strong> SQLite WAL mode (File: <code>data/exam_master.db</code>)</p>
          </div>
          <p>Truy cập bảng điều khiển:</p>
          <div>
            <a href="/teacher" class="btn">Giao Diện Giáo Viên (Teacher Dashboard)</a>
            <a href="/student" class="btn btn-student">Giao Diện Thí Sinh (Student Exam)</a>
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

server.listen(PORT, () => {
  const localIp = getLocalIpAddress();
  console.log('====================================================');
  console.log(`[LAN EXAM SERVER] Running at port ${PORT} (IPv4 + IPv6 Dual-Stack)`);
  console.log(`[TEACHER ACCESS] http://localhost:${PORT}/teacher hoặc http://127.0.0.1:${PORT}/teacher`);
  console.log(`[STUDENT ACCESS] http://${localIp}:${PORT}/student`);
  console.log('====================================================');
});

process.on('SIGINT', () => {
  console.log('\n[SERVER] Shutting down gracefully...');
  udpBeacon.stop();
  server.close(() => {
    console.log('[SERVER] Stopped.');
    process.exit(0);
  });
});
