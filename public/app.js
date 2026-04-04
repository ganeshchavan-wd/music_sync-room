window.addEventListener("click", () => {
    document.querySelectorAll("audio").forEach(a => {
        a.play().catch(() => {});
    });
});
// 🌐 SOCKET (Render backend)
const socket = io("https://music-sync-room.onrender.com");

// 🌐 PEER (STUN + TURN → REQUIRED FOR INTERNET)
const peer = new Peer(undefined, {
    host: "0.peerjs.com",
    secure: true,
    port: 443,
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

 if (localStream) {
    setTimeout(() => {
        connectToAllUser();
    }, 1000); // 🔥 delay ensures peer is ready
}
});

socket.on("userJoined", (data) => {

    if (data.peerId === peer.id) return;

    pendingUsers.push(data);

    document.getElementById("status").innerHTML +=
        `<br>👤 ${data.username} joined`;

    if (localStream) {
    setTimeout(() => {
        connectToAllUser();
    }, 1000); // 🔥 delay ensures peer is ready
}
});

socket.on("userLeft", (peerId) => {
    pendingUsers = pendingUsers.filter(u => u.peerId !== peerId);
    connectedPeers.delete(peerId);
});

// ==========================
// 🔊 AUDIO PLAY FIX
// ==========================
function playAudioStream(stream, id) {

    let audio = document.getElementById("audio_" + id);

    if (!audio) {
        audio = document.createElement("audio");
        audio.id = "audio_" + id;
       audio.autoplay = true;
audio.controls = true;   // 👈 ADD THIS
audio.volume = 1;
        audio.playsInline = true;
        document.body.appendChild(audio);
    }

    audio.srcObject = stream;

    audio.onloadedmetadata = () => {
        audio.play().catch(() => {
            console.log("User interaction required 🔊");
        });
    };

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

      if (peerReady) {
    connectToAllUsers();
} else {
    setTimeout(() => connectToAllUsers(), 1000);
}

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
// 🎬 YOUTUBE FINAL FIX
// ==========================

let player = null;
let playerReady = false;

// 🔥 WAIT UNTIL API LOADS
function waitForYT() {
    if (window.YT && window.YT.Player) {
        initPlayer();
    } else {
        setTimeout(waitForYT, 300);
    }
}

// 🔥 INIT PLAYER
function initPlayer() {
    player = new YT.Player('player', {
        height: '400',
        width: '100%',
        events: {
            onReady: () => {
                playerReady = true;
                console.log("YouTube Ready ✅");

                // enable buttons
                document.querySelectorAll(".yt-btn").forEach(btn => {
                    btn.disabled = false;
                });
            }
        }
    });
}

// 🔥 START WAITING
waitForYT();

function getVideoId(url) {
    try {
        const u = new URL(url);
        return u.searchParams.get("v") || u.pathname.slice(1);
    } catch {
        return null;
    }
}

// 🔥 LOAD VIDEO
function loadYouTube() {

    if (!playerReady) {
        alert("Player still loading... try again in 2 sec");
        return;
    }

    const id = getVideoId(document.getElementById("youtubeUrl").value);

    if (!id) {
        alert("Invalid YouTube link");
        return;
    }

    player.loadVideoById(id);
    socket.emit("loadVideo", id);
}

// 🔥 PLAY
function playVideo() {
    if (!playerReady) return;

    player.playVideo();
    socket.emit("playVideo", player.getCurrentTime());
}

// 🔥 PAUSE
function pauseVideo() {
    if (!playerReady) return;

    player.pauseVideo();
    socket.emit("pauseVideo");
}

// 🔥 SYNC FROM SERVER
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
