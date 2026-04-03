const socket = io("https://music-sync-room.onrender.com", {
    transports: ["websocket"],
    reconnection: true
});

// ✅ FINAL FIX: STUN + TURN (IMPORTANT)
const peer = new Peer(undefined, {
    config: {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            {
                urls: "turn:openrelay.metered.ca:80",
                username: "openrelayproject",
                credential: "openrelayproject"
            },
            {
                urls: "turn:openrelay.metered.ca:443",
                username: "openrelayproject",
                credential: "openrelayproject"
            }
        ]
    }
});

// 🌐 URL DATA
const params = new URLSearchParams(window.location.search);
let username = params.get("name");
let roomId = params.get("room");

// fallback
if (!username) username = "Guest_" + Math.floor(Math.random() * 1000);
if (!roomId) roomId = Math.random().toString(36).substring(2, 7);

// 🎯 STATE
let localStream;
let pendingUsers = [];
let connectedPeers = new Set();

let isMuted = false;
let isCallStarted = false;

// 📄 PAGE LOAD
document.addEventListener("DOMContentLoaded", () => {

    const savedTheme = localStorage.getItem("theme");
    document.body.classList.toggle("dark", savedTheme !== "light");

    const btn = document.getElementById("themeBtn");
    btn.innerText = document.body.classList.contains("dark") ? "☀️" : "🌙";

    document.getElementById("status").innerText = "👤 " + username;
    document.getElementById("roomDisplay").innerText = "📌 Room ID: " + roomId;
});

// 🔑 PEER READY
peer.on("open", (id) => {
    console.log("Peer connected:", id);
    socket.emit("joinRoom", roomId, id, username);
});

// 👑 OWNER
socket.on("roomOwner", (owner) => {
    document.getElementById("owner").innerText =
        "👑 Owner: " + owner;
});

// 👥 EXISTING USERS
socket.on("existingUsers", (users) => {
    pendingUsers = users.filter(u => u.peerId !== peer.id);

    if (isCallStarted && localStream) {
        connectToAllUsers();
    }
});

// 👤 USER JOINED
socket.on("userJoined", (data) => {

    if (data.peerId === peer.id) return;

    pendingUsers.push(data);

    document.getElementById("status").innerHTML +=
        `<br>👤 ${data.username} joined`;

    if (isCallStarted && localStream) {
        connectToUser(data);
    }
});

// 👤 USER LEFT
socket.on("userLeft", (peerId) => {
    pendingUsers = pendingUsers.filter(u => u.peerId !== peerId);
    connectedPeers.delete(peerId);
});

// 🎤 RECEIVE CALL
peer.on("call", async (call) => {

    if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
    }

    call.answer(localStream);

    call.on("stream", (stream) => {

        const audio = document.createElement("audio");
        audio.srcObject = stream;
        audio.autoplay = true;

        document.body.appendChild(audio);

        audio.play().catch(() => {
            document.body.addEventListener("click", () => {
                audio.play();
            }, { once: true });
        });
    });
});

// 🎤 START VOICE
async function startCall() {

    if (isCallStarted) return;
    isCallStarted = true;

    try {
        // unlock audio
        const unlock = new Audio();
        unlock.play().catch(() => {});

        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        localStream.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });

        console.log("Mic started ✅");

        connectToAllUsers();

    } catch (err) {
        console.error(err);
        alert("Microphone permission denied!");
    }
}

// 🔥 CONNECT ALL USERS
function connectToAllUsers() {
    pendingUsers.forEach(user => connectToUser(user));
}

// 🔥 CONNECT SINGLE USER
function connectToUser(user) {

    if (!localStream) return;

    if (connectedPeers.has(user.peerId)) return;
    connectedPeers.add(user.peerId);

    console.log("Calling:", user.peerId);

    const call = peer.call(user.peerId, localStream);

    call.on("stream", (stream) => {

        const audio = document.createElement("audio");
        audio.srcObject = stream;
        audio.autoplay = true;

        document.body.appendChild(audio);

        audio.play().catch(() => {
            document.body.addEventListener("click", () => {
                audio.play();
            }, { once: true });
        });
    });
}

// 🔇 MUTE
function toggleMute() {
    if (!localStream) return;

    isMuted = !isMuted;

    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
    });

    document.getElementById("muteBtn").innerText =
        isMuted ? "🔊 Unmute" : "🔇 Mute";
}

// 🌙 DARK MODE
function toggleTheme() {
    document.body.classList.toggle("dark");

    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");

    const btn = document.getElementById("themeBtn");
    btn.innerText = isDark ? "☀️" : "🌙";
}

// =======================
// 🎬 YOUTUBE
// =======================

let player;

// wait for API
function waitForYT() {
    return new Promise(resolve => {
        const check = setInterval(() => {
            if (window.YT && window.YT.Player) {
                clearInterval(check);
                resolve();
            }
        }, 100);
    });
}

// init
(async function () {
    await waitForYT();

    player = new YT.Player('player', {
        height: '400',
        width: '800'
    });

    console.log("YouTube Ready ✅");
})();

// get id
function getVideoId(url) {
    try {
        const u = new URL(url);
        return u.searchParams.get("v") || u.pathname.slice(1);
    } catch {
        return null;
    }
}

// load
function loadYouTube() {

    if (!player) {
        alert("Wait 2 seconds...");
        return;
    }

    const id = getVideoId(document.getElementById("youtubeUrl").value);

    if (!id) {
        alert("Invalid URL");
        return;
    }

    player.loadVideoById(id);
    socket.emit("loadVideo", id);
}

// play
function playVideo() {
    if (!player) return;

    player.playVideo();
    socket.emit("playVideo", player.getCurrentTime());
}

// pause
function pauseVideo() {
    if (!player) return;

    player.pauseVideo();
    socket.emit("pauseVideo");
}

// sync
socket.on("loadVideo", id => player && player.loadVideoById(id));

socket.on("playVideo", t => {
    if (!player) return;
    player.seekTo(t);
    player.playVideo();
});

socket.on("pauseVideo", () => player && player.pauseVideo());
