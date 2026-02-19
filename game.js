/** @type {HTMLCanvasElement} */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const uiOverlay = document.getElementById('ui-overlay');
const gameOverOverlay = document.getElementById('game-over-overlay');
const cameraOverlay = document.getElementById('camera-overlay');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const reselectBtn = document.getElementById('reselect-btn');
const imageUpload = document.getElementById('image-upload');
const galleryBtn = document.getElementById('gallery-btn');
const cameraBtn = document.getElementById('camera-btn');
const captureBtn = document.getElementById('capture-btn');
const cancelCameraBtn = document.getElementById('cancel-camera-btn');
const video = document.getElementById('video');
const tempCanvas = document.getElementById('temp-canvas');
const uploadStatus = document.getElementById('upload-status');

const scoreDisplay = document.getElementById('score');
const livesDisplay = document.getElementById('lives');
const finalScoreDisplay = document.getElementById('final-score');
const resultTitle = document.getElementById('result-title');

// Game constants
const PADDLE_HEIGHT = 12;
const PADDLE_WIDTH = 70;   // 패들 사이즈 축소
const BALL_RADIUS = 6;
const BALL_SPEED = 6;       // 공의 일정한 속도 (px/프레임)
const BRICK_ROWS = 16;
const BRICK_COLS = 10;
const BRICK_PADDING = 2;
const BRICK_OFFSET_TOP = 70;
const BRICK_OFFSET_LEFT = 10;

// ─── Web Audio API 사운드 시스템 ─────────────────────────────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (type === 'shatter') {
        // 벽돌 깨지는 소리: 짧은 노이즈 버스트 + 피치 드롭
        const bufferSize = audioCtx.sampleRate * 0.15;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        }
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.8, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1200;
        filter.Q.value = 0.8;

        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        source.start();

    } else if (type === 'wall') {
        // 패들/벽 반사음: 짧고 선명한 틱
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.06);

    } else if (type === 'lose') {
        // 공 落下 실패음: 낮아지는 3음 하강
        [300, 220, 160].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = freq;
            const t = audioCtx.currentTime + i * 0.12;
            gain.gain.setValueAtTime(0.4, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + 0.12);
        });

    } else if (type === 'win') {
        // 클리어 팡파레: 상승하는 화음
        [523, 659, 784, 1047].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = audioCtx.currentTime + i * 0.1;
            gain.gain.setValueAtTime(0.35, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + 0.35);
        });

    } else if (type === 'camera-click') {
        // 📸 카메라 셔터음: 기계적 클릭 + 찰칵 잔향
        // 1) 날카로운 노이즈 클릭
        const bufSize = Math.floor(audioCtx.sampleRate * 0.06);
        const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2.5);
        }
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        const clickGain = audioCtx.createGain();
        clickGain.gain.setValueAtTime(1.2, audioCtx.currentTime);
        clickGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
        const lpf = audioCtx.createBiquadFilter();
        lpf.type = 'bandpass';
        lpf.frequency.value = 2500;
        lpf.Q.value = 1.2;
        src.connect(lpf); lpf.connect(clickGain); clickGain.connect(audioCtx.destination);
        src.start();

        // 2) 미러 반동음 (찰칵~)
        const osc2 = audioCtx.createOscillator();
        const g2 = audioCtx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(900, audioCtx.currentTime + 0.03);
        osc2.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.12);
        g2.gain.setValueAtTime(0.18, audioCtx.currentTime + 0.03);
        g2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.13);
        osc2.connect(g2); g2.connect(audioCtx.destination);
        osc2.start(audioCtx.currentTime + 0.03);
        osc2.stop(audioCtx.currentTime + 0.14);

    } else if (type === 'photo-select') {
        // 🖼️ 걤러리 사진 선택음: 경쾾한 2음 상승 팝
        [660, 990].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = audioCtx.currentTime + i * 0.1;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.4, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + 0.25);
        });
    }
}

// Game state
let score = 0;
let lives = 3;
let initialLives = 3; // Max retries
let gameOver = false;
let gameStarted = false;
let paddleX = (canvas.width - PADDLE_WIDTH) / 2;
let ballX = canvas.width / 2;
let ballY = canvas.height - 50;
let ballDX = 4;
let ballDY = -4;
let rightPressed = false;
let leftPressed = false;
let bricks = [];
let particles = [];
let flashEffects = []; // 순간 번쩍임 효과
let sourceImage = null;

// ─── Delta Time (FPS 독립적 속도 보정) ──────────────────────────────────────
let lastFrameTime = 0;
const TARGET_FRAME_MS = 1000 / 60; // 60fps 기준 1프레임 = 16.667ms

// ─── 파티클 시스템 (단순화: 작은 색상 점) ───────────────────────────────────
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 4 + 2; // 2~6px 작은 점
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed - 2;
        this.alpha = 1;
        this.decay = Math.random() * 0.04 + 0.02;
        this.gravity = 0.15;
        this.color = color;
    }

    draw() {
        if (this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        ctx.restore();
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.alpha -= this.decay;
    }
}

class FlashEffect {
    constructor(x, y, w, h) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.alpha = 0.6;
        this.decay = 0.12;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = 'rgba(255, 255, 220, 1)';
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.restore();
    }
    update() { this.alpha -= this.decay; }
}

function createParticles(brick) {
    const COUNT = 6; // 적고 단순하게
    // 벽돌 중심 색상 샘플 (사진 or 기본색)
    const colors = ['#ff3e81', '#00f2fe', '#ffffff', '#ffef60', '#ff9f43'];
    for (let i = 0; i < COUNT; i++) {
        const px = brick.x + Math.random() * brick.w;
        const py = brick.y + Math.random() * brick.h;
        const color = colors[Math.floor(Math.random() * colors.length)];
        particles.push(new Particle(px, py, color));
    }
    // 번쩍임 효과
    flashEffects.push(new FlashEffect(brick.x, brick.y, brick.w, brick.h));
}


// Initialize canvas size
function resize() {
    // canvas 자체의 실제 렌더 영역 기준 (padding-bottom safe area 적용 시 부모 rect ≠ 캔버스 rect)
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    paddleX = (canvas.width - PADDLE_WIDTH) / 2;
}
window.addEventListener('resize', resize);
resize();

// Event listeners
document.addEventListener('keydown', (e) => {
    if (e.key === 'Right' || e.key === 'ArrowRight') rightPressed = true;
    else if (e.key === 'Left' || e.key === 'ArrowLeft') leftPressed = true;
});
document.addEventListener('keyup', (e) => {
    if (e.key === 'Right' || e.key === 'ArrowRight') rightPressed = false;
    else if (e.key === 'Left' || e.key === 'ArrowLeft') leftPressed = false;
});
// 터치 & 마우스 패들 컨트롤
function movePaddleTo(clientX) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const relativeX = (clientX - rect.left) * scaleX;
    paddleX = Math.max(0, Math.min(canvas.width - PADDLE_WIDTH, relativeX - PADDLE_WIDTH / 2));
}

document.addEventListener('mousemove', (e) => movePaddleTo(e.clientX));

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    movePaddleTo(e.touches[0].clientX);
}, { passive: false });

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    movePaddleTo(e.touches[0].clientX);
}, { passive: false });



// ─── 사진 미리보기 공통 함수 ──────────────────────────────────────────────
function showPhotoPreview(src) {
    let preview = document.getElementById('capture-preview');
    if (!preview) {
        preview = document.createElement('img');
        preview.id = 'capture-preview';
        preview.style.cssText = `
            width: 72px; height: 72px;
            object-fit: cover;
            border-radius: 12px;
            border: 2px solid #ff5ca8;
            box-shadow: 0 0 12px rgba(255,92,168,0.6);
            display: block;
            margin: 0 auto 4px;
            animation: previewPop 0.3s ease;
        `;
        uploadStatus.insertAdjacentElement('beforebegin', preview);
    }
    // 애니메이션 재실행을 위해 재설정
    preview.style.animation = 'none';
    preview.offsetHeight; // reflow
    preview.style.animation = 'previewPop 0.3s ease';
    preview.src = src;
}

imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            sourceImage = img;
            startBtn.classList.remove('disabled');
            startBtn.disabled = false;
            playSound('photo-select');         // 효과음
            showPhotoPreview(event.target.result);
            uploadStatus.textContent = '😤 준비됐다! 이제 박살내러 가자!';
            uploadStatus.style.color = '#00f2fe';
        };
        img.onerror = () => {
            uploadStatus.textContent = '❌ 이미지 로드 실패. 다른 파일을 선택해주세요.';
            uploadStatus.style.color = '#ff3e81';
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
});

// Camera logic
let stream = null;

async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = stream;
        cameraOverlay.classList.add('active');
    } catch (err) {
        console.error("Camera error:", err);
        alert("카메라를 사용할 수 없습니다. 권한을 확인해주세요.");
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    cameraOverlay.classList.remove('active');
}

// 갤러리 버튼 → 파일 선택 다이얼로그 (JS로 직접 트리거)
galleryBtn.addEventListener('click', () => {
    imageUpload.value = '';   // 같은 파일 재선택 허용
    imageUpload.click();
});

cameraBtn.addEventListener('click', startCamera);
cancelCameraBtn.addEventListener('click', stopCamera);


captureBtn.addEventListener('click', () => {
    const context = tempCanvas.getContext('2d');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;

    // 🔵 화면 번쩍임 효과 (셔터 플래시)
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: white; opacity: 0.85;
        pointer-events: none;
        transition: opacity 0.4s ease;
    `;
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = '0'; }, 60);
    setTimeout(() => { flash.remove(); }, 460);

    // 📸 셔터음 재생
    playSound('camera-click');

    // 미러 반전으로 영상 캡처
    context.translate(tempCanvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

    const imgData = tempCanvas.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
        sourceImage = img;
        startBtn.classList.remove('disabled');
        startBtn.disabled = false;
        showPhotoPreview(imgData); // 미리보기 공통 함수 사용
        uploadStatus.textContent = '📸 현행범 포착 완료! 이제 응징합시다!';
        uploadStatus.style.color = '#ff9f43';
        stopCamera();
    };
    img.src = imgData;
});

function initBricks() {
    const availableWidth = canvas.width - BRICK_OFFSET_LEFT * 2;
    const brickWidth = (availableWidth / BRICK_COLS) - BRICK_PADDING;
    const brickHeight = 18; // Shorter height for rectangular look

    bricks = [];
    for (let c = 0; c < BRICK_COLS; c++) {
        bricks[c] = [];
        for (let r = 0; r < BRICK_ROWS; r++) {
            bricks[c][r] = {
                x: 0,
                y: 0,
                status: 1,
                // These are for cropping the source image
                srcX: (c / BRICK_COLS),
                srcY: (r / BRICK_ROWS),
                srcW: (1 / BRICK_COLS),
                srcH: (1 / BRICK_ROWS),
                w: brickWidth,
                h: brickHeight
            };
        }
    }
}

function drawBricks() {
    const availableWidth = canvas.width - BRICK_OFFSET_LEFT * 2;
    const brickWidth = (availableWidth / BRICK_COLS) - BRICK_PADDING;
    const brickHeight = 18;

    for (let c = 0; c < BRICK_COLS; c++) {
        for (let r = 0; r < BRICK_ROWS; r++) {
            const b = bricks[c][r];
            if (b.status === 1) {
                const brickX = c * (brickWidth + BRICK_PADDING) + BRICK_OFFSET_LEFT;
                const brickY = r * (brickHeight + BRICK_PADDING) + BRICK_OFFSET_TOP;
                b.x = brickX;
                b.y = brickY;
                b.w = brickWidth;
                b.h = brickHeight;

                ctx.save();
                // Draw clipped image
                if (sourceImage) {
                    ctx.drawImage(
                        sourceImage,
                        b.srcX * sourceImage.width,
                        b.srcY * sourceImage.height,
                        b.srcW * sourceImage.width,
                        b.srcH * sourceImage.height,
                        brickX,
                        brickY,
                        brickWidth,
                        brickHeight
                    );
                } else {
                    ctx.fillStyle = '#ff3e81';
                    ctx.fillRect(brickX, brickY, brickWidth, brickHeight);
                }

                // Add border/polish
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.lineWidth = 1;
                ctx.strokeRect(brickX, brickY, brickWidth, brickHeight);
                ctx.restore();
            }
        }
    }
}

function drawBall() {
    ctx.beginPath();
    ctx.arc(ballX, ballY, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#00f2fe';
    ctx.fill();

    // Ball glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f2fe';
    ctx.closePath();
    ctx.shadowBlur = 0; // Reset for next drawings
}

function drawPaddle() {
    ctx.beginPath();
    ctx.rect(paddleX, canvas.height - PADDLE_HEIGHT - 10, PADDLE_WIDTH, PADDLE_HEIGHT);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#4e54c8';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.closePath();
}

function collisionDetection(dt) {
    // dt로 다음 위치 예측 (FPS에 관계없이 정확한 충돌)
    const nextX = ballX + ballDX * dt;
    const nextY = ballY + ballDY * dt;

    for (let c = 0; c < BRICK_COLS; c++) {
        for (let r = 0; r < BRICK_ROWS; r++) {
            const b = bricks[c][r];
            if (b.status !== 1) continue;

            // AABB 충돌 검사
            const bLeft = b.x;
            const bRight = b.x + b.w;
            const bTop = b.y;
            const bBottom = b.y + b.h;

            if (nextX + BALL_RADIUS > bLeft && nextX - BALL_RADIUS < bRight &&
                nextY + BALL_RADIUS > bTop && nextY - BALL_RADIUS < bBottom) {

                b.status = 0;
                score += 10;
                updateHUD();
                playSound('shatter');
                createParticles(b);

                // 어느 면에 침는지 케스 별 판단
                const overlapLeft = (ballX + BALL_RADIUS) - bLeft;
                const overlapRight = bRight - (ballX - BALL_RADIUS);
                const overlapTop = (ballY + BALL_RADIUS) - bTop;
                const overlapBottom = bBottom - (ballY - BALL_RADIUS);

                const minOverlapX = Math.min(overlapLeft, overlapRight);
                const minOverlapY = Math.min(overlapTop, overlapBottom);

                if (minOverlapX < minOverlapY) {
                    ballDX = -ballDX;
                } else {
                    ballDY = -ballDY;
                }

                // 속도 점진적 증가 (점수에 따라)
                const currentSpeed = Math.hypot(ballDX, ballDY);
                const targetSpeed = BALL_SPEED + (score / (BRICK_ROWS * BRICK_COLS * 10)) * 2;
                const scale = targetSpeed / currentSpeed;
                ballDX *= scale;
                ballDY *= scale;

                if (score === BRICK_ROWS * BRICK_COLS * 10) {
                    endGame(true);
                }
                return;
            }
        }
    }
}

function updateHUD() {
    scoreDisplay.textContent = score.toString().padStart(4, '0');
    livesDisplay.textContent = '❤️'.repeat(lives) + '🖤'.repeat(initialLives - lives);
}

function endGame(win) {
    gameOver = true;
    gameStarted = false;
    finalScoreDisplay.textContent = score;
    resultTitle.textContent = win ? '💥 완전 박살남!' : '😡 공을 놓쳤다!';
    resultTitle.style.color = win ? '#00f2fe' : '#ff3e81';

    // If lost, check if lives remain
    const hasLives = lives > 0;

    if (!win && hasLives) {
        const funnyFails = [
            `😤 아직 포기 안 해! (${lives}번 남음)`,
            `💢 이번엔 살려줬다 (${lives}번 남음)`,
            `🤬 다음엔 가만 안 둬! (${lives}번)`,
        ];
        resultTitle.textContent = funnyFails[Math.floor(Math.random() * funnyFails.length)];
        restartBtn.innerHTML = "🔄 다시 박살내기";
        restartBtn.style.display = "block";
        restartBtn.onclick = () => {
            gameOverOverlay.classList.remove('active');
            continueGame();
        };
        reselectBtn.style.display = "none";
    } else {
        const winMessages = [
            '💥 완전 박살남!',
            '🎉 응징 완료!',
            '👊 속이 다 시원해!',
        ];
        const loseMessages = [
            '😭 공이 세상 고단해',
            '🫠 손이 너무 느려...',
            '💀 오늘 운 없는 날',
        ];
        resultTitle.textContent = win
            ? winMessages[Math.floor(Math.random() * winMessages.length)]
            : loseMessages[Math.floor(Math.random() * loseMessages.length)];

        restartBtn.innerHTML = "🔄 다시 박살내기";
        restartBtn.style.display = "block";
        restartBtn.onclick = () => {
            gameOverOverlay.classList.remove('active');
            initGame();
        };

        reselectBtn.innerHTML = "😈 다른 사람 소환";
        reselectBtn.style.display = "block";
        reselectBtn.onclick = () => {
            stopCamera();
            gameOverOverlay.classList.remove('active');
            uiOverlay.classList.add('active');
            sourceImage = null;
            imageUpload.value = '';
            startBtn.classList.add('disabled');
            startBtn.disabled = true;
            uploadStatus.textContent = '👆 사진을 고르면 응징 준비 완료!';
            uploadStatus.style.color = '';
        };
    }

    gameOverOverlay.classList.add('active');
    playSound(win ? 'win' : 'lose');
}

function draw(timestamp = 0) {
    if (!gameStarted) return;

    // ── Delta Time 계산 (60fps 기준 정규화) ─────────────────────────────
    const elapsed = lastFrameTime > 0 ? timestamp - lastFrameTime : TARGET_FRAME_MS;
    // 최대 2.5배로 제한 (탭 전환 후 복귀 시 공이 튀지 않도록)
    const dt = Math.min(elapsed / TARGET_FRAME_MS, 2.5);
    lastFrameTime = timestamp;
    // ──────────────────────────────────────────────────────────────────

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBricks();

    // 번쩍임 효과 (flashEffects) - 파티클보다 먼저 렌더
    for (let i = flashEffects.length - 1; i >= 0; i--) {
        flashEffects[i].update();
        flashEffects[i].draw();
        if (flashEffects[i].alpha <= 0) {
            flashEffects.splice(i, 1);
        }
    }

    // 파티클 파편 렌더
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].alpha <= 0) {
            particles.splice(i, 1);
        }
    }

    drawBall();
    drawPaddle();
    collisionDetection(dt);

    // Wall & Ceiling collisions (dt 반영)
    if (ballX + ballDX * dt > canvas.width - BALL_RADIUS) {
        ballX = canvas.width - BALL_RADIUS;
        ballDX = -Math.abs(ballDX);
        playSound('wall');
    } else if (ballX + ballDX * dt < BALL_RADIUS) {
        ballX = BALL_RADIUS;
        ballDX = Math.abs(ballDX);
        playSound('wall');
    }

    if (ballY + ballDY * dt < BALL_RADIUS) {
        ballY = BALL_RADIUS;
        ballDY = Math.abs(ballDY);
        playSound('wall');
    } else if (ballY + ballDY * dt > canvas.height - BALL_RADIUS - PADDLE_HEIGHT - 10) {
        const paddleTop = canvas.height - PADDLE_HEIGHT - 10;
        // Paddle collision
        if (ballX > paddleX && ballX < paddleX + PADDLE_WIDTH &&
            ballY + ballDY * dt >= paddleTop && ballY <= paddleTop) {
            playSound('wall');

            const hitPos = ((ballX - paddleX) / PADDLE_WIDTH) * 2 - 1;
            const normalizedPos = Math.sign(hitPos) * Math.pow(Math.abs(hitPos), 1.8);
            const MAX_ANGLE = Math.PI / 3;
            const angle = normalizedPos * MAX_ANGLE;

            const speed = Math.hypot(ballDX, ballDY);
            ballDX = speed * Math.sin(angle);
            ballDY = -speed * Math.cos(angle);

            if (Math.abs(ballDY) < 2) ballDY = -2;

            ballY = paddleTop - BALL_RADIUS;
        } else if (ballY + ballDY * dt > canvas.height) {
            lives--;
            updateHUD();
            playSound('lose');
            endGame(false);
            return;
        }
    }

    // Move paddle (dt 반영)
    if (rightPressed && paddleX < canvas.width - PADDLE_WIDTH) {
        paddleX += 7 * dt;
    } else if (leftPressed && paddleX > 0) {
        paddleX -= 7 * dt;
    }

    // Move ball (dt 반영 — 핵심: 실제 경과 시간만큼만 이동)
    ballX += ballDX * dt;
    ballY += ballDY * dt;

    // 클리핑
    ballX = Math.max(BALL_RADIUS, Math.min(canvas.width - BALL_RADIUS, ballX));
    ballY = Math.max(BALL_RADIUS, ballY);

    if (!gameOver) {
        requestAnimationFrame(draw);
    }
}

// Event listeners for UI buttons (now handled dynamically in endGame or init)
// But we still need the initial logic for the first game start
startBtn.addEventListener('click', () => {
    if (!startBtn.disabled && sourceImage) {
        uiOverlay.classList.remove('active');
        initGame();
    }
});

function continueGame() {
    gameOver = false;
    gameStarted = true;
    ballX = canvas.width / 2;
    ballY = canvas.height - 80;
    const launchAngle = (Math.random() - 0.5) * (Math.PI * 80 / 180);
    ballDX = BALL_SPEED * Math.sin(launchAngle);
    ballDY = -BALL_SPEED * Math.cos(launchAngle);
    paddleX = (canvas.width - PADDLE_WIDTH) / 2;
    particles = [];
    flashEffects = [];
    lastFrameTime = 0; // dt 초기화
    requestAnimationFrame(draw);
}

function initGame() {
    score = 0;
    lives = 3;
    gameOver = false;
    gameStarted = true;
    ballX = canvas.width / 2;
    ballY = canvas.height - 80;
    const launchAngle = (Math.random() - 0.5) * (Math.PI * 80 / 180);
    ballDX = BALL_SPEED * Math.sin(launchAngle);
    ballDY = -BALL_SPEED * Math.cos(launchAngle);
    particles = [];
    flashEffects = [];
    lastFrameTime = 0; // dt 초기화
    updateHUD();
    initBricks();
    requestAnimationFrame(draw); // draw() 직접 호출 대신 rAF 사용
}
