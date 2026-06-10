// main.js Metronome
let audioContext = null;
let currentBPM = 90;
let isPlaying = false;
let metronomeIntervalId = null;
let userId = null;

function initAudioContext() {
    if (!audioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioContext = new AudioContextClass();
        } else {
            console.warn("Web Audio API not supported in this browser.");
        }
    }
}

function playClick() {
    initAudioContext();
    if (!audioContext) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    osc.type = 'square';
    osc.frequency.value = 800;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.1, now + 0.001);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.02);
}

function startMetronome() {
    // Clear any existing interval 
    if (metronomeIntervalId) {
        clearInterval(metronomeIntervalId);
    }
    const interval = 60000 / currentBPM;
    playClick();
    metronomeIntervalId = setInterval(() => {
        if (isPlaying) playClick();
    }, interval);
}

function stopMetronome() {
    if (metronomeIntervalId) {
        clearInterval(metronomeIntervalId);
        metronomeIntervalId = null;
    }
}

function updateBPMDisplay() {
    const display = document.getElementById('bpm-display');
    if (display) {
        const paddedBPM = currentBPM.toString().padStart(3, '0');
        display.textContent = `BPM: ${paddedBPM}`;
    }
}
// Function to handle touch/drag on the BPM line
function updateBPMLevelIndicator() {
    const bpmLevel = document.querySelector('.bpm-level');
    if (bpmLevel) {
        const percentage = ((currentBPM - 24) / (320 - 24)) * 100;
        bpmLevel.style.width = `${percentage}%`;
    }
}
// Update the setupBPMTouchControl function:
function setupBPMTouchControl() {
    const bpmControl = document.querySelector('.bpm-control');
    if (!bpmControl) return;

    let isDragging = false;
    const minBPM = 24;
    const maxBPM = 320;

    function calculateBPMFromPosition(clientX) {
        const rect = bpmControl.getBoundingClientRect();
        const position = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return Math.round(minBPM + (maxBPM - minBPM) * position);
    }

    function handleStart(e) {
        isDragging = true;
        handleMove(e);
        e.preventDefault();
    }

    function handleMove(e) {
        if (!isDragging) return;
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        if (clientX) {
            const newBPM = calculateBPMFromPosition(clientX);
            if (newBPM !== currentBPM) {
                currentBPM = newBPM;
                updateBPMDisplay();
                updateBPMLevelIndicator();
                if (isPlaying) {
                    startMetronome();
                }
            }
        }
        e.preventDefault();
    }

    function handleEnd() {
        if (isDragging) {
            isDragging = false;
            sendUserPrefs();
        }
    }

    bpmControl.addEventListener('mousedown', handleStart);
    bpmControl.addEventListener('touchstart', handleStart);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);
}

// Send user preferences to the server
function sendUserPrefs() {
    if (userId === null) return;
    
    const formData = new URLSearchParams();
    formData.append('user_id', userId);
    formData.append('bpm', currentBPM);

    if (navigator.sendBeacon) {
        navigator.sendBeacon('update_user_prefs', formData);
    } else {
        // Async fetch fallback (non-blocking)
        fetch('update_user_prefs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        }).catch(err => console.warn('Failed to save prefs:', err));
    }
}

// --- DISCORD INIT FUNCTION ---
import { DiscordSDK } from "/static/js/discord-sdk.js";

// Grab DISCORD_CLIENT_ID from the window object (injected in load.html)
const DISCORD_CLIENT_ID = window.DISCORD_CLIENT_ID;
let discordSdk;

async function setupDiscordSDK() {
    const loader = document.getElementById('loader');
    
    loader.innerText = "Step 1: Constructor...";
    discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);
    
loader.innerText = "Step 2: Waiting for SDK ready...";
const readyTimeout = setTimeout(() => {
    if (!discordSdk) {
        throw new Error("SDK ready timeout. Not running in Discord?");
    }
}, 2000);

await discordSdk.ready();
clearTimeout(readyTimeout);
    
    loader.innerText = "Step 3: Authorizing...";
    // Authorize with Discord Client
    const { code } = await discordSdk.commands.authorize({
        client_id: DISCORD_CLIENT_ID,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'email']
    });

    loader.innerText = "Step 4: Fetching token from backend...";
    // Send code to backend to get access token
    const tokenResponse = await fetch('api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });

    loader.innerText = "Step 5: Parsing token...";
    if (!tokenResponse.ok) {
        throw new Error("Failed to get token from backend");
    }

    const { access_token } = await tokenResponse.json();

    // Authenticate with Discord client
    const auth = await discordSdk.commands.authenticate({
        access_token
    });

    if (auth == null) {
        throw new Error("Authenticate command failed");
    }

    userId = auth.user.id;
    const globalName = auth.user.global_name || auth.user.username;
    let avatarUrl = "/static/favicon.ico";
    if (auth.user.avatar) {
        avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${auth.user.avatar}.png`;
    }

    // Fetch user preferences from our backend
    const userPrefsResponse = await fetch(`api/user?user_id=${userId}`);
    let prefsData = {};
    if (userPrefsResponse.ok) {
        prefsData = await userPrefsResponse.json();
    }

    // Setup UI and reveal the app
    const appContainer = document.getElementById('app');
    if (appContainer) {
        appContainer.style.display = 'block';
    }

    currentBPM = prefsData.bpm || 90;
    updateBPMDisplay();
    updateBPMLevelIndicator();

    const profilePic = document.getElementById('profile-pic');
    if (profilePic) {
        profilePic.style.backgroundImage = `url('${avatarUrl}')`;
    }

    const profileNameElement = document.getElementById("profile-name");
    if (profileNameElement) {
       profileNameElement.innerText = `[ ${globalName} ]`;
    }

    setupButtonHandlers();
    setupBPMTouchControl();

    // Hide loader
    if (loader) {
        loader.style.transition = 'opacity 0.5s ease-out';
        loader.style.opacity = '0';
        setTimeout(() => loader.remove(), 500);
    }

    // --- Save preferences ---
    setInterval(sendUserPrefs, 53000); // Every 53 seconds
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            sendUserPrefs();
        }
    });
}

function showErrorMessage(message) {
    document.body.innerHTML = `<div class="error-message">${message}</div>`;
}

function setupButtonHandlers() {
    document.getElementById('tempo-up').onclick = () => {
        if (currentBPM < 320) {
            currentBPM += 4;
            if (isPlaying) {
                startMetronome();
            }
            updateBPMDisplay();
            sendUserPrefs();
        }
    };
    document.getElementById('tempo-down').onclick = () => {
        if (currentBPM > 24) {
            currentBPM -= 4;
            if (isPlaying) {
                startMetronome();
            }
            updateBPMDisplay();
            sendUserPrefs();
        }
    };

    const playMetrButton = document.getElementById('playmetr');
    if (playMetrButton) {
        playMetrButton.onclick = () => {
            if (isPlaying) {
                stopMetronome();
                playMetrButton.textContent = 'Start Metronome';
                isPlaying = false;
            } else {
                isPlaying = true;
                sendUserPrefs();
                startMetronome();
                playMetrButton.textContent = 'Stop Metronome';
            }
        };
    }
}

// Disable context menu
document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
}, false);

// Start SDK
setupDiscordSDK().catch(error => {
    console.error('Discord SDK Init Failed:', error);
    const errorMsg = error?.message || error?.code || JSON.stringify(error);
    showErrorMessage(`Init failed: ${errorMsg}. Check browser console for details.`);
});
