const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let roomUsers = {};
let roomOwners = {};

io.on("connection", socket => {

    socket.on("joinRoom", (room, peerId, username) => {

        socket.join(room);
        socket.room = room;
        socket.peerId = peerId;

        if (!roomUsers[room]) roomUsers[room] = [];

        if (!roomUsers[room].some(u => u.peerId === peerId)) {
            roomUsers[room].push({ peerId, username });
        }

        if (!roomOwners[room]) roomOwners[room] = username;

        socket.emit("roomOwner", roomOwners[room]);
        socket.emit("existingUsers", roomUsers[room]);

        socket.to(room).emit("userJoined", { peerId, username });
    });

    socket.on("disconnect", () => {
        const room = socket.room;
        const peerId = socket.peerId;

        if (!roomUsers[room]) return;

        roomUsers[room] =
            roomUsers[room].filter(u => u.peerId !== peerId);

        socket.to(room).emit("userLeft", peerId);
    });

    socket.on("loadVideo", id =>
        socket.to(socket.room).emit("loadVideo", id));

    socket.on("playVideo", t =>
        socket.to(socket.room).emit("playVideo", t));

    socket.on("pauseVideo", () =>
        socket.to(socket.room).emit("pauseVideo"));
});

http.listen(3000, () => console.log("Server running 🚀"));