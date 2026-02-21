// ===== Удалённый Доступ — Веб-просмотрщик ===== //

let ws = null;
const canvas = document.getElementById('screenCanvas');
const ctx = canvas.getContext('2d');
let frameCount = 0;
let chatUnread = 0;
let chatVisible = false;
let keyboardVisible = false;

// ===== ПОДКЛЮЧЕНИЕ =====

function connect() {
    const input = document.getElementById('codeInput');
    const code = input.value.trim();
    if (!code || code.length !== 6) {
        showError('Введите 6-значный код комнаты');
        return;
    }

    const btn = document.getElementById('btnConnect');
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.btn-loader').style.display = 'inline-block';
    hideError();

    try {
        // Подключаемся к тому же серверу, который отдал эту страницу
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
            console.log('Подключено к серверу-ретранслятору');
            // Присоединяемся к комнате
            ws.send(JSON.stringify({ type: 'join_room', code }));
        };

        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                handleFrame(event.data);
            } else {
                handleMessage(JSON.parse(event.data));
            }
        };

        ws.onerror = (err) => {
            console.error('Ошибка WebSocket', err);
            showError('Ошибка подключения к серверу');
            resetConnectBtn();
        };

        ws.onclose = () => {
            console.log('Отключено');
            if (document.getElementById('viewerScreen').classList.contains('active')) {
                document.getElementById('connStatus').textContent = 'Отключено';
                document.querySelector('.status-indicator').classList.remove('connected');
            }
        };

        // Таймаут
        setTimeout(() => {
            if (ws && ws.readyState !== WebSocket.OPEN) {
                ws.close();
                showError('Время ожидания истекло. Проверьте подключение к интернету.');
                resetConnectBtn();
            }
        }, 8000);

    } catch (e) {
        showError('Ошибка: ' + e.message);
        resetConnectBtn();
    }
}

function disconnect() {
    if (ws) ws.close();
    ws = null;
    frameCount = 0;
    document.getElementById('connectScreen').classList.add('active');
    document.getElementById('viewerScreen').classList.remove('active');
    resetConnectBtn();
}

function showViewer(deviceInfo) {
    document.getElementById('connectScreen').classList.remove('active');
    document.getElementById('viewerScreen').classList.add('active');
    resetConnectBtn();

    if (deviceInfo) {
        document.getElementById('deviceName').textContent =
            `${deviceInfo.brand || ''} ${deviceInfo.model || ''}`.trim() || 'Устройство';
        document.getElementById('deviceMeta').textContent =
            deviceInfo.android ? `Android ${deviceInfo.android}` : '';
    }

    document.getElementById('roomInfo').textContent = document.getElementById('codeInput').value;
    setupCanvasListeners();
}

function showError(msg) {
    const el = document.getElementById('connectError');
    el.textContent = msg;
    el.style.display = 'block';
}

function hideError() {
    document.getElementById('connectError').style.display = 'none';
}

function resetConnectBtn() {
    const btn = document.getElementById('btnConnect');
    btn.querySelector('.btn-text').style.display = 'inline';
    btn.querySelector('.btn-loader').style.display = 'none';
}

// ===== РЕНДЕРИНГ КАДРОВ =====

const frameImage = new Image();

function handleFrame(data) {
    const blob = new Blob([data], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);

    frameImage.onload = () => {
        if (canvas.width !== frameImage.width || canvas.height !== frameImage.height) {
            canvas.width = frameImage.width;
            canvas.height = frameImage.height;
            fitPhoneFrame();
        }

        ctx.drawImage(frameImage, 0, 0);
        URL.revokeObjectURL(url);

        const overlay = document.getElementById('phoneOverlay');
        if (!overlay.classList.contains('hidden')) {
            overlay.classList.add('hidden');
        }

        frameCount++;
        document.getElementById('frameCount').textContent = frameCount;
    };

    frameImage.src = url;
}

function fitPhoneFrame() {
    const wrapper = document.getElementById('phoneWrapper');
    const frame = document.querySelector('.phone-frame');
    const aspectRatio = canvas.width / canvas.height;

    const maxH = wrapper.clientHeight - 100;
    const maxW = wrapper.clientWidth - 40;

    let h = maxH;
    let w = h * aspectRatio;

    if (w > maxW) {
        w = maxW;
        h = w / aspectRatio;
    }

    frame.style.width = w + 'px';
    frame.style.height = h + 'px';
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
}

// ===== ОБРАБОТКА СООБЩЕНИЙ =====

function handleMessage(msg) {
    switch (msg.type) {
        case 'room_joined':
            showViewer(msg.device);
            break;
        case 'error':
            showError(msg.message || 'Неизвестная ошибка');
            resetConnectBtn();
            break;
        case 'host_disconnected':
            showError('Устройство отключилось');
            document.getElementById('connStatus').textContent = 'Устройство отключено';
            document.querySelector('.status-indicator').classList.remove('connected');
            break;
        case 'device_info':
            document.getElementById('deviceName').textContent =
                `${msg.brand || ''} ${msg.model || ''}`.trim() || 'Устройство';
            document.getElementById('deviceMeta').textContent =
                msg.android ? `Android ${msg.android}` : '';
            break;
        case 'chat':
            addChatMessage(msg.message, 'received');
            break;
    }
}

// ===== УПРАВЛЕНИЕ ВВОДОМ =====

let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let dragStartTime = 0;

function setupCanvasListeners() {
    canvas.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        dragStartX = (e.clientX - rect.left) / rect.width;
        dragStartY = (e.clientY - rect.top) / rect.height;
        dragStartTime = Date.now();
        isDragging = true;
    });

    canvas.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        isDragging = false;

        const rect = canvas.getBoundingClientRect();
        const endX = (e.clientX - rect.left) / rect.width;
        const endY = (e.clientY - rect.top) / rect.height;
        const duration = Date.now() - dragStartTime;
        const distance = Math.sqrt((endX - dragStartX) ** 2 + (endY - dragStartY) ** 2);

        if (distance < 0.02) {
            if (duration > 500) {
                sendJSON({ type: 'longpress', x: dragStartX, y: dragStartY });
            } else {
                sendJSON({ type: 'tap', x: dragStartX, y: dragStartY });
            }
            showTouchIndicator(e.clientX, e.clientY);
        } else {
            sendJSON({
                type: 'swipe',
                x1: dragStartX, y1: dragStartY,
                x2: endX, y2: endY,
                duration: Math.max(150, Math.min(duration, 800))
            });
        }
    });

    canvas.addEventListener('mouseleave', () => { isDragging = false; });

    // Тач-события для мобильного просмотра
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        dragStartX = (touch.clientX - rect.left) / rect.width;
        dragStartY = (touch.clientY - rect.top) / rect.height;
        dragStartTime = Date.now();
        isDragging = true;
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;

        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const endX = (touch.clientX - rect.left) / rect.width;
        const endY = (touch.clientY - rect.top) / rect.height;
        const distance = Math.sqrt((endX - dragStartX) ** 2 + (endY - dragStartY) ** 2);

        if (distance < 0.02) {
            sendJSON({ type: 'tap', x: dragStartX, y: dragStartY });
            showTouchIndicator(touch.clientX, touch.clientY);
        } else {
            sendJSON({
                type: 'swipe',
                x1: dragStartX, y1: dragStartY,
                x2: endX, y2: endY,
                duration: Math.max(150, Math.min(Date.now() - dragStartTime, 800))
            });
        }
    }, { passive: false });

    // Колёсико мыши = прокрутка (свайп)
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) / rect.width;
        const cy = (e.clientY - rect.top) / rect.height;
        const dy = e.deltaY > 0 ? 0.15 : -0.15;

        sendJSON({
            type: 'swipe',
            x1: cx, y1: cy,
            x2: cx, y2: cy - dy,
            duration: 200
        });
    }, { passive: false });
}

function showTouchIndicator(clientX, clientY) {
    const indicator = document.getElementById('touchIndicator');
    const frame = document.querySelector('.phone-frame');
    const rect = frame.getBoundingClientRect();

    indicator.style.left = (clientX - rect.left) + 'px';
    indicator.style.top = (clientY - rect.top) + 'px';
    indicator.classList.remove('show');
    void indicator.offsetWidth;
    indicator.classList.add('show');
}

// ===== ОТПРАВКА КОМАНД =====

function sendJSON(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function sendKey(action) {
    sendJSON({ type: 'key', action });
}

// ===== КАЧЕСТВО И FPS =====

document.getElementById('qualitySlider').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('qualityValue').textContent = val + '%';
    sendJSON({ type: 'quality', value: val });
});

document.getElementById('fpsSlider').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('fpsValue').textContent = val;
    sendJSON({ type: 'fps', value: val });
});

// ===== ЧАТ =====

function toggleChat() {
    chatVisible = !chatVisible;
    document.getElementById('chatSection').style.display = chatVisible ? 'block' : 'none';
    if (chatVisible) {
        chatUnread = 0;
        document.getElementById('chatBadge').style.display = 'none';
    }
}

function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    sendJSON({ type: 'chat', message: msg });
    addChatMessage(msg, 'sent');
    input.value = '';
}

function addChatMessage(text, type) {
    const container = document.getElementById('chatMessages');
    const el = document.createElement('div');
    el.className = `chat-msg ${type}`;
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;

    if (type === 'received' && !chatVisible) {
        chatUnread++;
        const badge = document.getElementById('chatBadge');
        badge.textContent = chatUnread;
        badge.style.display = 'flex';
    }
}

document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
});

// ===== КЛАВИАТУРА =====

function toggleKeyboard() {
    keyboardVisible = !keyboardVisible;
    document.getElementById('keyboardSection').style.display = keyboardVisible ? 'block' : 'none';
    if (keyboardVisible) {
        document.getElementById('keyboardInput').focus();
    }
}

// ===== ПОЛНЫЙ ЭКРАН =====

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
    } else {
        document.exitFullscreen?.();
    }
}

// ===== ENTER НА ПОЛЕ КОДА =====

document.getElementById('codeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connect();
});

// ===== РАЗМЕР ОКНА =====

window.addEventListener('resize', () => {
    if (canvas.width > 0) fitPhoneFrame();
});

// ===== АВТОФОКУС =====

window.addEventListener('load', () => {
    document.getElementById('codeInput').focus();
});
