// 🌐 SOCKET (Render server)
const socket = io("https://music-sync-room.onrender.com");

// 🌐 PEER (with STUN/TURN → IMPORTANT)
const peer = new Peer({
    config: {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            {
                urls: "turn:openrelay.metered.ca:80",
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

// 🎯 STATE
let localStream;
let pendingUsers = [];
let connectedPeers = new Set();

let peerReady = false;
let pendingJoin = false;
let isMuted = false;
let isCallStarted = false;

// ==========================
// 📄 PAGE LOAD
// ==========================
document.addEventListener("DOMContentLoaded", () => {

    // 🌙 THEME
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
        document.body.classList.remove("dark");
    } else {
        document.body.classList.add("dark");
    }

    const btn = document.getElementById("themeBtn");
    btn.innerText = document.body.classList.contains("dark") ? "☀️" : "🌙";

    // UI
    document.getElementById("status").innerText = "👤 " + username;
    document.getElementById("roomDisplay").innerText =
        "📌 Room ID: " + roomId;

    if (username && roomId) {
        if (peerReady) {
            socket.emit("joinRoom", roomId, peer.id, username);
        } else {
            pendingJoin = true;
        }
    }
});

// ==========================
// 🔑 PEER READY
// ==========================
peer.on("open", (id) => {
    console.log("Peer connected:", id);
    peerReady = true;

    if (pendingJoin) {
        socket.emit("joinRoom", roomId, peer.id, username);
        pendingJoin = false;
    }
});

// ==========================
// 👑 OWNER
// ==========================
socket.on("roomOwner", (owner) => {
    document.getElementById("owner").innerText =
        "👑 Owner: " + owner;
});

// ==========================
// 👥 USERS
// ==========================
socket.on("existingUsers", (users) => {
    pendingUsers = users.filter(u => u.peerId !== peer.id);

    if (isCallStarted && localStream) {
        connectToAllUsers();
    }
});

socket.on("userJoined", (data) => {

    if (data.peerId === peer.id) return;

    pendingUsers.push(data);

    document.getElementById("status").innerHTML +=
        `<br>👤 ${data.username} joined`;

    if (isCallStarted && localStream) {
        connectToUser(data);
    }
});

socket.on("userLeft", (peerId) => {
    pendingUsers = pendingUsers.filter(u => u.peerId !== peerId);
    connectedPeers.delete(peerId);
});

// ==========================
// 🔊 AUDIO PLAY FUNCTION (FINAL FIX)
// ==========================
function playAudioStream(stream, id) {

    let audio = document.getElementById("audio_" + id);

    if (!audio) {
        audio = document.createElement("audio");
        audio.id = "audio_" + id;
        audio.autoplay = true;
        document.body.appendChild(audio);
    }

    audio.srcObject = stream;
    audio.muted = false;
    audio.volume = 1;

    audio.play().catch(() => {
        document.body.addEventListener("click", () => {
            audio.play();
        }, { once: true });
    });

    console.log("Playing audio from:", id);
}

// ==========================
// 📞 RECEIVE CALL
// ==========================
peer.on("call", async (call) => {

    if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });
    }

    call.answer(localStream);

    call.on("stream", (stream) => {
        playAudioStream(stream, call.peer);
    });
});

// ==========================
// 🎤 START VOICE
// ==========================
async function startCall() {

    if (isCallStarted) return;
    isCallStarted = true;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        console.log("Mic started ✅");

        localStream.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });

        connectToAllUsers();

    } catch (err) {
        alert("Microphone permission denied!");
    }
}

// ==========================
// 🔥 CONNECT USERS
// ==========================
function connectToAllUsers() {
    pendingUsers.forEach(user => {
        connectToUser(user);
    });
}

function connectToUser(user) {

    if (!localStream) return;

    if (connectedPeers.has(user.peerId)) return;
    connectedPeers.add(user.peerId);

    console.log("Calling:", user.peerId);

    const call = peer.call(user.peerId, localStream);

    call.on("stream", (stream) => {
        playAudioStream(stream, user.peerId);
    });
}

// ==========================
// 🔇 MUTE
// ==========================
function toggleMute() {
    if (!localStream) return;

    isMuted = !isMuted;

    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
    });

    document.getElementById("muteBtn").innerText =
        isMuted ? "🔊 Unmute" : "🔇 Mute";
}

// ==========================
// 🌙 DARK MODE
// ==========================
function toggleTheme() {
    document.body.classList.toggle("dark");

    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");

    const btn = document.getElementById("themeBtn");
    btn.innerText = isDark ? "☀️" : "🌙";
}

// ==========================
// 🎬 YOUTUBE
// ==========================
let player;
let playerReady = false;

window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('player', {
        events: {
            onReady: () => {
                playerReady = true;
                console.log("YouTube Ready ✅");
            }
        }
    });
};

function getVideoId(url) {
    try {
        const u = new URL(url);
        return u.searchParams.get("v") || u.pathname.slice(1);
    } catch {
        return null;
    }
}

function loadYouTube() {
    if (!playerReady) {
        alert("Player not ready yet!");
        return;
    }

    const id = getVideoId(document.getElementById("youtubeUrl").value);
    if (!id) return alert("Invalid URL");

    player.loadVideoById(id);
    socket.emit("loadVideo", id);
}

function playVideo() {
    if (!playerReady) return;
    player.playVideo();
    socket.emit("playVideo", player.getCurrentTime());
}

function pauseVideo() {
    if (!playerReady) return;
    player.pauseVideo();
    socket.emit("pauseVideo");
}

// ==========================
// 🔄 SYNC
// ==========================
socket.on("loadVideo", id => {
    if (playerReady) player.loadVideoById(id);
});

socket.on("playVideo", t => {
    if (playerReady) {
        player.seekTo(t);
        player.playVideo();
    }
});

socket.on("pauseVideo", () => {
    if (playerReady) player.pauseVideo();
});
