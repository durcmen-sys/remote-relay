const express = require('express');
const { createServer } = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.static(__dirname));

// Любой маршрут → index.html (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 10 * 1024 * 1024 }); // 10MB max

// ===== Управление комнатами =====
const rooms = new Map(); // код → { host, viewers, deviceInfo }

function generateCode() {
    return crypto.randomInt(100000, 999999).toString();
}

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws._role = null;
    ws._roomCode = null;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data, isBinary) => {
        if (isBinary) {
            // Бинарные данные = JPEG кадр от телефона → пересылаем зрителям
            if (ws._role === 'host' && ws._roomCode) {
                const room = rooms.get(ws._roomCode);
                if (room) {
                    for (const viewer of room.viewers) {
                        if (viewer.readyState === WebSocket.OPEN) {
                            viewer.send(data, { binary: true });
                        }
                    }
                }
            }
            return;
        }

        // Текстовое сообщение (JSON)
        try {
            const msg = JSON.parse(data.toString());
            handleMessage(ws, msg);
        } catch (e) {
            console.error('Ошибка парсинга:', e.message);
        }
    });

    ws.on('close', () => {
        if (ws._role === 'host' && ws._roomCode) {
            const room = rooms.get(ws._roomCode);
            if (room) {
                for (const viewer of room.viewers) {
                    if (viewer.readyState === WebSocket.OPEN) {
                        viewer.send(JSON.stringify({ type: 'host_disconnected' }));
                    }
                }
                rooms.delete(ws._roomCode);
            }
            console.log(`Комната ${ws._roomCode} удалена (хост отключился)`);
        } else if (ws._role === 'viewer' && ws._roomCode) {
            const room = rooms.get(ws._roomCode);
            if (room) {
                room.viewers.delete(ws);
                if (room.host && room.host.readyState === WebSocket.OPEN) {
                    room.host.send(JSON.stringify({ type: 'viewer_disconnected' }));
                }
            }
        }
    });

    ws.on('error', (err) => {
        console.error('Ошибка WebSocket:', err.message);
    });
});

function handleMessage(ws, msg) {
    switch (msg.type) {
        case 'create_room': {
            // Телефон создаёт комнату
            const code = generateCode();
            rooms.set(code, {
                host: ws,
                viewers: new Set(),
                deviceInfo: msg.device || {}
            });
            ws._role = 'host';
            ws._roomCode = code;
            ws.send(JSON.stringify({ type: 'room_created', code }));
            console.log(`Комната ${code} создана: ${JSON.stringify(msg.device || {})}`);
            break;
        }
        case 'join_room': {
            // Зритель подключается к комнате
            const code = msg.code;
            const room = rooms.get(code);
            if (!room) {
                ws.send(JSON.stringify({ type: 'error', message: 'Комната не найдена. Проверьте код.' }));
                return;
            }
            room.viewers.add(ws);
            ws._role = 'viewer';
            ws._roomCode = code;
            ws.send(JSON.stringify({ type: 'room_joined', device: room.deviceInfo }));
            // Уведомляем хост
            if (room.host && room.host.readyState === WebSocket.OPEN) {
                room.host.send(JSON.stringify({ type: 'viewer_joined' }));
            }
            console.log(`Зритель подключился к комнате ${code}`);
            break;
        }
        default: {
            // Пересылаем сообщение на другую сторону
            if (!ws._roomCode) return;
            const room = rooms.get(ws._roomCode);
            if (!room) return;

            const jsonStr = JSON.stringify(msg);
            if (ws._role === 'host') {
                for (const viewer of room.viewers) {
                    if (viewer.readyState === WebSocket.OPEN) {
                        viewer.send(jsonStr);
                    }
                }
            } else if (ws._role === 'viewer') {
                if (room.host && room.host.readyState === WebSocket.OPEN) {
                    room.host.send(jsonStr);
                }
            }
        }
    }
}

// Проверка живых соединений (heartbeat)
const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) { ws.terminate(); return; }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

// ===== Запуск =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Сервер-ретранслятор запущен на порту ${PORT}`);
    console.log(`   Откройте http://localhost:${PORT} в браузере для подключения\n`);
});

