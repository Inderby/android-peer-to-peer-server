// server.js
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = process.env.PORT || 3000;

// 연결된 사용자 관리
const connectedUsers = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // 사용자 등록
  socket.on("register", (userId) => {
    console.log("User registered:", userId);
    connectedUsers.set(userId, socket.id);
    socket.userId = userId;

    // 현재 접속한 사용자 목록 전송
    io.emit("userList", Array.from(connectedUsers.keys()));
  });

  // 통화 요청
  socket.on("call-request", (data) => {
    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call-received", {
        callerId: socket.userId,
        callerSocketId: socket.id,
      });
    }
  });

  // 통화 수락
  socket.on("call-accepted", (data) => {
    const callerSocketId = connectedUsers.get(data.callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit("call-accepted", {
        accepterId: socket.userId,
        accepterSocketId: socket.id,
      });
    }
  });

  // 통화 거절
  socket.on("call-rejected", (data) => {
    const callerSocketId = connectedUsers.get(data.callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit("call-rejected", {
        rejecterId: socket.userId,
      });
    }
  });

  // WebRTC Offer 전달
  socket.on("offer", (data) => {
    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("offer", {
        offer: data.offer,
        callerId: socket.userId,
      });
    }
  });

  // WebRTC Answer 전달
  socket.on("answer", (data) => {
    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("answer", {
        answer: data.answer,
        answererId: socket.userId,
      });
    }
  });

  // ICE candidate 전달
  socket.on("ice-candidate", (data) => {
    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("ice-candidate", {
        candidate: data.candidate,
        senderId: socket.userId,
      });
    }
  });

  // 통화 종료
  socket.on("end-call", (data) => {
    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call-ended", {
        enderId: socket.userId,
      });
    }
  });

  // 연결 해제
  socket.on("disconnect", () => {
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
      io.emit("userList", Array.from(connectedUsers.keys()));
      io.emit("user-disconnected", socket.userId);
    }
    console.log("User disconnected:", socket.id);
  });
});

// 서버 시작
http.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
