const socket = io("https://music-sync-room.onrender.com");
const peer = new Peer();

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

// 📄 PAGE LOAD
document.addEventListener("DOMContentLoaded", () => {

    // 🌙 LOAD SAVED THEME OR DEFAULT DARK
    const savedTheme = localStorage.getItem("theme");

    if (savedTheme === "light") {
        document.body.classList.remove("dark");
    } else {
        document.body.classList.add("dark"); // default dark
    }

    const btn = document.getElementById("themeBtn");
    btn.innerText = document.body.classList.contains("dark") ? "☀️" : "🌙";

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

// 🔑 PEER READY
peer.on("open", () => {
    peerReady = true;

    if (pendingJoin) {
        socket.emit("joinRoom", roomId, peer.id, username);
        pendingJoin = false;
    }
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
peer.on("call", (call) => {

    if (!localStream) {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                localStream = stream;
                call.answer(localStream);
            });
    } else {
        call.answer(localStream);
    }

    call.on("stream", (stream) => {
        const audio = new Audio();
        audio.srcObject = stream;
        audio.play();
    });
});

// 🎤 START VOICE
async function startCall() {

    if (isCallStarted) return;
    isCallStarted = true;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        localStream.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });

        connectToAllUsers();

    } catch (err) {
        alert("Microphone permission denied!");
    }
}

// 🔥 CONNECT ALL USERS
function connectToAllUsers() {
    pendingUsers.forEach(user => {
        connectToUser(user);
    });
}

// 🔥 CONNECT SINGLE USER
function connectToUser(user) {

    if (connectedPeers.has(user.peerId)) return;
    connectedPeers.add(user.peerId);

    const call = peer.call(user.peerId, localStream);

    call.on("stream", (stream) => {
        const audio = new Audio();
        audio.srcObject = stream;
        audio.play();
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

// 🌙 DARK MODE (FINAL FIXED)
function toggleTheme() {
    document.body.classList.toggle("dark");

    const isDark = document.body.classList.contains("dark");

    localStorage.setItem("theme", isDark ? "dark" : "light");

    const btn = document.getElementById("themeBtn");
    btn.innerText = isDark ? "☀️" : "🌙";
}

// 🎬 YOUTUBE
let player;

window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('player');
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
    const id = getVideoId(document.getElementById("youtubeUrl").value);
    player.loadVideoById(id);
    socket.emit("loadVideo", id);
}

function playVideo() {
    player.playVideo();
    socket.emit("playVideo", player.getCurrentTime());
}

function pauseVideo() {
    player.pauseVideo();
    socket.emit("pauseVideo");
}

// 🔄 SYNC
socket.on("loadVideo", id => player.loadVideoById(id));
socket.on("playVideo", t => { player.seekTo(t); player.playVideo(); });
socket.on("pauseVideo", () => player.pauseVideo());
