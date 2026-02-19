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
let paddleWidth = 120;    // 현재 패들 크기 (스테이지별 변동)
const BALL_RADIUS = 6;
const BALL_SPEED = 6;
const BRICK_ROWS = 16;
const BRICK_COLS = 10;
const BRICK_PADDING = 2;
const BRICK_OFFSET_TOP = 70;
const BRICK_OFFSET_LEFT = 10;
const BOMB_COUNT = 7;          // 폭탄 블럭 개수 (난이도 조절)

// ─── 스테이지 시스템 ──────────────────────────────────────────────
const MAX_STAGE = 5;
// 스테이지별 패들 크기 (점점 줄어듬)
const STAGE_PADDLES = [120, 100, 80, 65, 50];
let stage = 1;

// ─── Web Audio API 사운드 시스템 ─────────────────────────────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (type === 'shatter') {
        // 🪨 유리 파편음: 날카롬게 쯭어지는 실감
        const t0 = audioCtx.currentTime;
        // 가) 날카로운 쯭어짐 (찰칝!)
        const bufSz = Math.floor(audioCtx.sampleRate * 0.08);
        const buf = audioCtx.createBuffer(1, bufSz, audioCtx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSz; i++)
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSz, 3.5);
        const src = audioCtx.createBufferSource(); src.buffer = buf;
        const hpf = audioCtx.createBiquadFilter();
        hpf.type = 'highpass'; hpf.frequency.value = 1800;
        const gn = audioCtx.createGain();
        gn.gain.setValueAtTime(1.5, t0);
        gn.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
        src.connect(hpf); hpf.connect(gn); gn.connect(audioCtx.destination);
        src.start(t0);
        // 나) 잔해 떨어지는 소리
        const tinySz = Math.floor(audioCtx.sampleRate * 0.2);
        const tinyBuf = audioCtx.createBuffer(1, tinySz, audioCtx.sampleRate);
        const td = tinyBuf.getChannelData(0);
        for (let i = 0; i < tinySz; i++)
            td[i] = (Math.random() * 2 - 1) * 0.15 * Math.pow(1 - i / tinySz, 1.5) * (Math.sin(i * 0.3) > 0 ? 1 : 0.3);
        const tSrc = audioCtx.createBufferSource(); tSrc.buffer = tinyBuf;
        const tGn = audioCtx.createGain();
        tGn.gain.setValueAtTime(0.8, t0 + 0.03);
        tGn.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
        tSrc.connect(tGn); tGn.connect(audioCtx.destination);
        tSrc.start(t0 + 0.03);

    } else if (type === 'wall') {
        // 🏓 탄성 바운스음: 단단한 타격감
        const t0 = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, t0);
        osc.frequency.exponentialRampToValueAtTime(250, t0 + 0.04);
        gain.gain.setValueAtTime(0.5, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(t0); osc.stop(t0 + 0.06);
        // 서브 타격감
        const sub = audioCtx.createOscillator();
        const sg = audioCtx.createGain();
        sub.type = 'sine'; sub.frequency.value = 120;
        sg.gain.setValueAtTime(0.3, t0);
        sg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.04);
        sub.connect(sg); sg.connect(audioCtx.destination);
        sub.start(t0); sub.stop(t0 + 0.05);

    } else if (type === 'lose') {
        // 😵 코믹한 추락음: 휘익~ 탁! 삐이익↓
        const t0 = audioCtx.currentTime;
        // 휠익~ (남어림)
        const o1 = audioCtx.createOscillator(); const g1 = audioCtx.createGain();
        o1.type = 'sine';
        o1.frequency.setValueAtTime(800, t0);
        o1.frequency.exponentialRampToValueAtTime(80, t0 + 0.5);
        g1.gain.setValueAtTime(0.5, t0);
        g1.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
        o1.connect(g1); g1.connect(audioCtx.destination);
        o1.start(t0); o1.stop(t0 + 0.55);
        // 탁! (착지)
        const impSz = Math.floor(audioCtx.sampleRate * 0.05);
        const impBuf = audioCtx.createBuffer(1, impSz, audioCtx.sampleRate);
        const impD = impBuf.getChannelData(0);
        for (let i = 0; i < impSz; i++) impD[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impSz, 5);
        const impSrc = audioCtx.createBufferSource(); impSrc.buffer = impBuf;
        const impG = audioCtx.createGain();
        impG.gain.setValueAtTime(2.0, t0 + 0.35);
        impG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
        impSrc.connect(impG); impG.connect(audioCtx.destination);
        impSrc.start(t0 + 0.35);
        // 삐이익 (습한 이명)
        const ring = audioCtx.createOscillator(); const rg = audioCtx.createGain();
        ring.type = 'sine'; ring.frequency.value = 2500;
        rg.gain.setValueAtTime(0.08, t0 + 0.38);
        rg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
        ring.connect(rg); rg.connect(audioCtx.destination);
        ring.start(t0 + 0.38); ring.stop(t0 + 1.0);

    } else if (type === 'win') {
        // 🎉 승리 팡파레: 실감나는 화음 + 멜로디 상승
        const t0 = audioCtx.currentTime;
        // 멜로디 4음: 도미솔라도~
        [523, 659, 784, 1047].forEach((freq, i) => {
            ['sine', 'triangle'].forEach(tp => {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.type = tp;
                o.frequency.value = freq;
                const t = t0 + i * 0.12;
                g.gain.setValueAtTime(tp === 'sine' ? 0.35 : 0.12, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
                o.connect(g); g.connect(audioCtx.destination);
                o.start(t); o.stop(t + 0.5);
            });
        });
        // 심벨즈 콤보 (삐★삐★삐!)
        [0.5, 0.55, 0.6].forEach((delay, i) => {
            const nSz = Math.floor(audioCtx.sampleRate * 0.06);
            const nBuf = audioCtx.createBuffer(1, nSz, audioCtx.sampleRate);
            const nd = nBuf.getChannelData(0);
            for (let j = 0; j < nSz; j++) nd[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / nSz, 4);
            const ns = audioCtx.createBufferSource(); ns.buffer = nBuf;
            const ng = audioCtx.createGain();
            ng.gain.setValueAtTime(1.5 - i * 0.3, t0 + delay);
            ng.gain.exponentialRampToValueAtTime(0.001, t0 + delay + 0.08);
            ns.connect(ng); ng.connect(audioCtx.destination);
            ns.start(t0 + delay);
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

    } else if (type === 'bomb-explosion') {
        // 💥 초거대 폭발음: 5레이어 시네마틱 사운드
        const t0 = audioCtx.currentTime;

        // 1레이어: 초저음 서브 붐 (쿵!)
        const boomLen = Math.floor(audioCtx.sampleRate * 1.2);
        const boomBuf = audioCtx.createBuffer(1, boomLen, audioCtx.sampleRate);
        const boomData = boomBuf.getChannelData(0);
        for (let i = 0; i < boomLen; i++)
            boomData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / boomLen, 0.5);
        const boomSrc = audioCtx.createBufferSource();
        boomSrc.buffer = boomBuf;
        const boomLpf = audioCtx.createBiquadFilter();
        boomLpf.type = 'lowpass'; boomLpf.frequency.value = 150;
        const boomGain = audioCtx.createGain();
        boomGain.gain.setValueAtTime(8.0, t0);
        boomGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.1);
        boomSrc.connect(boomLpf); boomLpf.connect(boomGain); boomGain.connect(audioCtx.destination);
        boomSrc.start(t0);

        // 2레이어: 금속성 파편음 (치익!)
        const debrisLen = Math.floor(audioCtx.sampleRate * 0.4);
        const debrisBuf = audioCtx.createBuffer(1, debrisLen, audioCtx.sampleRate);
        const debrisData = debrisBuf.getChannelData(0);
        for (let i = 0; i < debrisLen; i++)
            debrisData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / debrisLen, 3);
        const debrisSrc = audioCtx.createBufferSource();
        debrisSrc.buffer = debrisBuf;
        const debrisHpf = audioCtx.createBiquadFilter();
        debrisHpf.type = 'highpass'; debrisHpf.frequency.value = 3000;
        const debrisGain = audioCtx.createGain();
        debrisGain.gain.setValueAtTime(2.0, t0);
        debrisGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
        debrisSrc.connect(debrisHpf); debrisHpf.connect(debrisGain); debrisGain.connect(audioCtx.destination);
        debrisSrc.start(t0);

        // 3레이어: 묵직한 피치 하강 (슈우웅↓)
        [150, 100, 60].forEach((freq, i) => {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(freq * 3, t0 + i * 0.03);
            o.frequency.exponentialRampToValueAtTime(30, t0 + i * 0.03 + 0.6);
            g.gain.setValueAtTime(1.8, t0 + i * 0.03);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.03 + 0.7);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(t0 + i * 0.03); o.stop(t0 + i * 0.03 + 0.8);
        });

        // 4레이어: 가청 한계 이명 현상 (삐-) - 타격감 강화
        const ringOsc = audioCtx.createOscillator();
        const ringGain = audioCtx.createGain();
        ringOsc.type = 'sine';
        ringOsc.frequency.setValueAtTime(6000, t0);
        ringGain.gain.setValueAtTime(0.15, t0);
        ringGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.8);
        ringOsc.connect(ringGain); ringGain.connect(audioCtx.destination);
        ringOsc.start(t0); ringOsc.stop(t0 + 0.9);

        // 5레이어: 공간감 반사 (에코)
        [0.2, 0.4, 0.6].forEach((delay, i) => {
            const echoGain = audioCtx.createGain();
            echoGain.gain.setValueAtTime(1.0 - i * 0.3, t0 + delay);
            echoGain.gain.exponentialRampToValueAtTime(0.001, t0 + delay + 0.4);
            const echoSrc = audioCtx.createBufferSource();
            echoSrc.buffer = boomBuf; // 메인 붐을 재사용
            const echoLpf = audioCtx.createBiquadFilter();
            echoLpf.type = 'lowpass'; echoLpf.frequency.value = 100;
            echoSrc.connect(echoLpf); echoLpf.connect(echoGain); echoGain.connect(audioCtx.destination);
            echoSrc.start(t0 + delay);
        });
    }
}

// Game state
let score = 0;
let lives = 3;
let initialLives = 3; // Max retries
let gameOver = false;
let gameStarted = false;
let paddleX = (canvas.width - paddleWidth) / 2;
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
    paddleX = (canvas.width - paddleWidth) / 2;
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
    paddleX = Math.max(0, Math.min(canvas.width - paddleWidth, relativeX - paddleWidth / 2));
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
    const brickHeight = 18;

    bricks = [];
    for (let c = 0; c < BRICK_COLS; c++) {
        bricks[c] = [];
        for (let r = 0; r < BRICK_ROWS; r++) {
            bricks[c][r] = {
                x: 0, y: 0,
                status: 1,
                bomb: false,
                srcX: (c / BRICK_COLS),
                srcY: (r / BRICK_ROWS),
                srcW: (1 / BRICK_COLS),
                srcH: (1 / BRICK_ROWS),
                w: brickWidth,
                h: brickHeight
            };
        }
    }

    // 폽탄 랜덤 배치 (Fisher-Yates 셔플)
    const positions = [];
    for (let c = 0; c < BRICK_COLS; c++)
        for (let r = 0; r < BRICK_ROWS; r++)
            positions.push([c, r]);
    for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    for (let i = 0; i < BOMB_COUNT; i++) {
        const [bc, br] = positions[i];
        bricks[bc][br].bomb = true;
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
                b.x = brickX; b.y = brickY;
                b.w = brickWidth; b.h = brickHeight;

                ctx.save();
                if (sourceImage) {
                    ctx.drawImage(
                        sourceImage,
                        b.srcX * sourceImage.width, b.srcY * sourceImage.height,
                        b.srcW * sourceImage.width, b.srcH * sourceImage.height,
                        brickX, brickY, brickWidth, brickHeight
                    );
                } else {
                    ctx.fillStyle = b.bomb ? '#ff3e10' : '#ff3e81';
                    ctx.fillRect(brickX, brickY, brickWidth, brickHeight);
                }

                // 폭탄 그래픽: 유머러스 만화풍
                if (b.bomb) {
                    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 150);
                    const tick = Math.floor(Date.now() / 600) % 4;
                    const funnyEmoji = ['💣', '🧨', '💥', '😈'][tick];

                    // 1) 노란 경고색 배경
                    ctx.globalAlpha = 0.92;
                    const warnGrad = ctx.createLinearGradient(brickX, brickY, brickX + brickWidth, brickY + brickHeight);
                    warnGrad.addColorStop(0, '#1a0500');
                    warnGrad.addColorStop(0.5, `rgba(80, 10, 0, ${0.8 + pulse * 0.2})`);
                    warnGrad.addColorStop(1, '#1a0500');
                    ctx.fillStyle = warnGrad;
                    ctx.fillRect(brickX, brickY, brickWidth, brickHeight);

                    // 2) 만화풍 펀탄 테두리 (노란+빨간 교차)
                    ctx.globalAlpha = 1;
                    ctx.shadowBlur = 6 + pulse * 8;
                    ctx.shadowColor = `rgba(255, ${Math.floor(180 + pulse * 75)}, 0, 0.9)`;
                    ctx.strokeStyle = `rgba(255, ${Math.floor(200 + pulse * 55)}, 0, 1)`;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(brickX + 0.5, brickY + 0.5, brickWidth - 1, brickHeight - 1);

                    // 3) 폭탄 이모지 (로테이션 애니메이션 + 살짝 흐들림)
                    const fs = Math.min(brickWidth, brickHeight) * 0.92;
                    ctx.font = `${fs}px serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const wobbleX = Math.sin(Date.now() / 80) * 1.2;
                    const wobbleY = Math.cos(Date.now() / 100) * 0.8;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#ffcc00';
                    ctx.fillText(funnyEmoji, brickX + brickWidth / 2 + wobbleX, brickY + brickHeight / 2 + wobbleY + 1);
                    ctx.shadowBlur = 0;
                } else {
                    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(brickX, brickY, brickWidth, brickHeight);
                }
                ctx.restore();
            }
        }
    }
}

// ─── 폭탄 BFS 연쇄 폭발 ────────────────────────────────────────────────
function triggerExplosion(startC, startR) {
    // BFS: 폰탄 사슬된 위치에서 BFS로 연쇄
    const queue = [[startC, startR]];
    const visited = new Set();

    while (queue.length > 0) {
        const [ec, er] = queue.shift();
        const key = `${ec},${er}`;
        if (visited.has(key)) continue;
        visited.add(key);

        // 주변 6×6 파괴 (중심에서 -2 ~ +3 범위)
        for (let dc = -2; dc <= 3; dc++) {
            for (let dr = -2; dr <= 3; dr++) {
                if (dc === 0 && dr === 0) continue;
                const nc = ec + dc, nr = er + dr;
                if (nc < 0 || nc >= BRICK_COLS || nr < 0 || nr >= BRICK_ROWS) continue;
                const nb = bricks[nc][nr];
                if (nb.status !== 1) continue;

                nb.status = 0;
                score += 10;
                createParticles(nb);
                // 연쇄 폭발: 범위 내 폭탄도 터짐!
                if (nb.bomb) queue.push([nc, nr]);
            }
        }
    }
    updateHUD();
    // 클리어 체크
    if (score >= BRICK_ROWS * BRICK_COLS * 10) endGame(true);
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
    ctx.rect(paddleX, canvas.height - PADDLE_HEIGHT - 10, paddleWidth, PADDLE_HEIGHT);
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
                createParticles(b);

                if (b.bomb) {
                    // 폭탄! 폭발음 + 대형 파티클 추가
                    playSound('bomb-explosion');
                    // 화면 흐들림
                    const boomFlash = document.createElement('div');
                    boomFlash.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(255,120,0,0.35);pointer-events:none;transition:opacity 0.3s ease;';
                    document.body.appendChild(boomFlash);
                    setTimeout(() => { boomFlash.style.opacity = '0'; }, 60);
                    setTimeout(() => { boomFlash.remove(); }, 360);
                    // 연쇄 파괴
                    triggerExplosion(c, r);
                } else {
                    playSound('shatter');
                }

                // 충돌 방향 반사
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

                // 속도 점진적 증가
                const currentSpeed = Math.hypot(ballDX, ballDY);
                const targetSpeed = BALL_SPEED + (score / (BRICK_ROWS * BRICK_COLS * 10)) * 2;
                const scale = targetSpeed / currentSpeed;
                ballDX *= scale;
                ballDY *= scale;

                if (score >= BRICK_ROWS * BRICK_COLS * 10) {
                    endGame(true);
                }
                return;
            }
        }
    }
}

function updateHUD() {
    scoreDisplay.textContent = score.toString().padStart(4, '0');
    livesDisplay.textContent = `⭐${stage} ` + '❤️'.repeat(lives) + '🖤'.repeat(initialLives - lives);
}

function endGame(win) {
    gameOver = true;
    gameStarted = false;
    finalScoreDisplay.textContent = score;

    const hasLives = lives > 0;

    // ─── 패배 (공 놓침) + 라이프 남아있음 ───
    if (!win && hasLives) {
        const funnyFails = [
            `😤 아직 포기 안 해! (${lives}번 남음)`,
            `💢 이번엔 살려줬다 (${lives}번 남음)`,
            `🤬 다음엔 가만 안 둡! (${lives}번)`,
        ];
        resultTitle.textContent = funnyFails[Math.floor(Math.random() * funnyFails.length)];
        resultTitle.style.color = '#ff9f43';
        restartBtn.innerHTML = "🔄 다시 박살내기";
        restartBtn.style.display = "block";
        restartBtn.onclick = () => {
            gameOverOverlay.classList.remove('active');
            continueGame();
        };
        reselectBtn.style.display = "none";

        // ─── 스테이지 클리어! 다음 스테이지 OR 최종 승리 ───
    } else if (win && stage < MAX_STAGE) {
        const stageMessages = [
            `🌟 STAGE ${stage} 클리어!`,
            `🔥 ${stage}단계 박살 완료!`,
            `⚡ ${stage}단계 돌파!`,
        ];
        resultTitle.textContent = stageMessages[Math.floor(Math.random() * stageMessages.length)];
        resultTitle.style.color = '#ffd166';
        finalScoreDisplay.textContent = score;

        restartBtn.innerHTML = `🚀 ${stage + 1}단계 도전!`;
        restartBtn.style.display = "block";
        restartBtn.onclick = () => {
            gameOverOverlay.classList.remove('active');
            nextStage();
        };
        reselectBtn.style.display = "none";

        // ─── 최종 승리 or 최종 패배 ───
    } else {
        if (win) {
            resultTitle.textContent = '🌟👑 전 스테이지 완전 박살! 👑🌟';
            resultTitle.style.color = '#ffd166';
        } else {
            const loseMessages = [
                '😭 공이 세상 고단해',
                '🫠 손이 너무 느려...',
                '💀 오늘 운 없는 날',
            ];
            resultTitle.textContent = loseMessages[Math.floor(Math.random() * loseMessages.length)];
            resultTitle.style.color = '#ff3e81';
        }

        restartBtn.innerHTML = "🔄 처음부터 다시";
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
        if (ballX > paddleX && ballX < paddleX + paddleWidth &&
            ballY + ballDY * dt >= paddleTop && ballY <= paddleTop) {
            playSound('wall');

            const hitPos = ((ballX - paddleX) / paddleWidth) * 2 - 1;
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
    if (rightPressed && paddleX < canvas.width - paddleWidth) {
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
    paddleX = (canvas.width - paddleWidth) / 2;
    particles = [];
    flashEffects = [];
    lastFrameTime = 0;
    requestAnimationFrame(draw);
}

function nextStage() {
    stage++;
    paddleWidth = STAGE_PADDLES[Math.min(stage - 1, STAGE_PADDLES.length - 1)];
    gameOver = false;
    gameStarted = true;
    ballX = canvas.width / 2;
    ballY = canvas.height - 80;
    const launchAngle = (Math.random() - 0.5) * (Math.PI * 80 / 180);
    ballDX = BALL_SPEED * Math.sin(launchAngle);
    ballDY = -BALL_SPEED * Math.cos(launchAngle);
    paddleX = (canvas.width - paddleWidth) / 2;
    particles = [];
    flashEffects = [];
    lastFrameTime = 0;
    updateHUD();
    initBricks();
    requestAnimationFrame(draw);
}

function initGame() {
    stage = 1;
    paddleWidth = STAGE_PADDLES[0];
    score = 0;
    lives = 3;
    gameOver = false;
    gameStarted = true;
    ballX = canvas.width / 2;
    ballY = canvas.height - 80;
    const launchAngle = (Math.random() - 0.5) * (Math.PI * 80 / 180);
    ballDX = BALL_SPEED * Math.sin(launchAngle);
    ballDY = -BALL_SPEED * Math.cos(launchAngle);
    paddleX = (canvas.width - paddleWidth) / 2;
    particles = [];
    flashEffects = [];
    lastFrameTime = 0;
    updateHUD();
    initBricks();
    requestAnimationFrame(draw);
}
