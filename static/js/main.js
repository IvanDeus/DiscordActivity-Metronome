// main.js
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let currentBPM = 90;
let isPlaying = false;
let metronomeIntervalId = null;
let userId = null;

function playClick() {
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
    // Clear any existing interval to prevent multiple metronomes playing
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
// Update the BPM level indicator position
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
        handleMove(e); // Update position immediately on start
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
                updateBPMLevelIndicator(); // Update visual position
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
    if (userId === null) {
        console.warn("User ID not available. Cannot save preferences.");
        return;
    }
    const formData = new URLSearchParams();
    formData.append('user_id', userId);
    formData.append('bpm', currentBPM);
    //console.log("Sending preferences:", formData.toString());
    if (navigator.sendBeacon) {
        const success = navigator.sendBeacon('update_user_prefs', formData);
        if (!success) {
            console.warn("Failed to send beacon");
        }
    } else {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'update_user_prefs', false);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.send(formData);
    }
}
// --- Load metr.html via AJAX ---
function loadMetronomeHTML(callback) {
    fetch('static/html/metr.html')
        .then(response => {
            if (!response.ok) throw new Error("Failed to load metr.html");
            return response.text();
        })
        .then(html => {
            const appContainer = document.getElementById('app');
            if (appContainer) {appContainer.innerHTML = html;}
            if (callback) callback();
        })
        .catch(err => {
            console.error("Error loading metr.html:", err);
            showErrorMessage("Failed to load app interface.");
        });
}
// --- DISCORD INIT FUNCTION ---
import { DiscordSDK } from "https://esm.sh/@discord/embedded-app-sdk@1.2.0";

// Replace this with your Discord Client ID
const DISCORD_CLIENT_ID = 'YOUR_DISCORD_CLIENT_ID';
let discordSdk;

async function setupDiscordSDK() {
    discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);
    await discordSdk.ready();

    // Authorize with Discord Client
    const { code } = await discordSdk.commands.authorize({
        client_id: DISCORD_CLIENT_ID,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'rpc.activities.write']
    });

    // Send code to backend to get access token
    const tokenResponse = await fetch('api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });

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
    let avatarUrl = "static/favicon.ico";
    if (auth.user.avatar) {
        avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${auth.user.avatar}.png`;
    }

    // Fetch user preferences from our backend
    const userPrefsResponse = await fetch(`api/user?user_id=${userId}`);
    let prefsData = {};
    if (userPrefsResponse.ok) {
        prefsData = await userPrefsResponse.json();
    }

    // Load HTML and setup UI
    loadMetronomeHTML(() => {
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
        const loader = document.getElementById('loader');
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
    console.error('Init failed:', error);
    showErrorMessage("Failed to initialize Discord Activity. Make sure you are running inside Discord.");
});
