const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = process.env.PORT || 3000;

const logger = {
  info: (event, message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] [INFO] [${event}] ${message}`,
      data ? JSON.stringify(data) : ""
    );
  },
  error: (event, message, error = null) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] [${event}] ${message}`, error || "");
  },
};

const connectedUsers = new Map(); // userId -> socketId
const activeCallMap = new Map(); // callId -> { caller, callee }

io.on("connection", (socket) => {
  logger.info("CONNECTION", "New socket connected", {
    socketId: socket.id,
  });

  socket.on("register", (userId) => {
    logger.info("REGISTER", "User registration request", {
      userId,
      socketId: socket.id,
    });

    socket.userId = userId;
    connectedUsers.set(userId, socket.id);
    io.emit("userList", Array.from(connectedUsers.keys()));
  });

  socket.on("call-request", (data) => {
    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (!targetSocketId) return;

    const callId = `${socket.userId}-${data.targetUserId}`;
    activeCallMap.set(callId, {
      caller: socket.userId,
      callee: data.targetUserId,
    });

    logger.info("CALL_REQUEST", "Call request initiated", {
      from: socket.userId,
      to: data.targetUserId,
    });

    io.to(targetSocketId).emit("call-received", {
      callerId: socket.userId,
    });
  });

  socket.on("call-accepted", (data) => {
    const callId = `${data.callerId}-${socket.userId}`;
    if (!activeCallMap.has(callId)) return;

    const callerSocketId = connectedUsers.get(data.callerId);

    logger.info("CALL_ACCEPT", "Call accepted", {
      accepterId: socket.userId,
      callerId: data.callerId,
    });

    if (callerSocketId) {
      io.to(callerSocketId).emit("call-accepted", {
        accepterId: socket.userId,
      });
    }
  });

  socket.on("offer", (data) => {
    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (!targetSocketId) return;

    logger.info("OFFER", "Forwarding WebRTC offer", {
      from: socket.userId,
      to: data.targetUserId,
    });

    io.to(targetSocketId).emit("offer", {
      offer: data.offer,
      callerId: socket.userId,
    });
  });

  socket.on("answer", (data) => {
    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (!targetSocketId) return;

    logger.info("ANSWER", "Forwarding WebRTC answer", {
      from: socket.userId,
      to: data.targetUserId,
    });

    io.to(targetSocketId).emit("answer", {
      answer: data.answer,
      answererId: socket.userId,
    });
  });

  socket.on("ice-candidate", (data) => {
    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (!targetSocketId) return;

    logger.info("ICE_CANDIDATE", "Forwarding ICE candidate", {
      from: socket.userId,
      to: data.targetUserId,
    });

    io.to(targetSocketId).emit("ice-candidate", {
      candidate: data.candidate,
      senderId: socket.userId,
    });
  });

  socket.on("end-call", (data) => {
    const targetSocketId = connectedUsers.get(data.targetUserId);

    const callId1 = `${socket.userId}-${data.targetUserId}`;
    const callId2 = `${data.targetUserId}-${socket.userId}`;

    activeCallMap.delete(callId1);
    activeCallMap.delete(callId2);

    if (targetSocketId) {
      logger.info("CALL_END", "Call ended", {
        from: socket.userId,
        to: data.targetUserId,
      });

      io.to(targetSocketId).emit("call-ended", {
        enderId: socket.userId,
      });
    }
  });

  socket.on("disconnect", () => {
    if (!socket.userId) return;

    logger.info("DISCONNECT", "User disconnected", {
      userId: socket.userId,
    });

    // 진행 중인 통화 정리
    for (const [callId, call] of activeCallMap.entries()) {
      if (call.caller === socket.userId || call.callee === socket.userId) {
        const otherUserId =
          call.caller === socket.userId ? call.callee : call.caller;
        const otherSocketId = connectedUsers.get(otherUserId);

        if (otherSocketId) {
          io.to(otherSocketId).emit("call-ended", {
            enderId: socket.userId,
          });
        }

        activeCallMap.delete(callId);
      }
    }

    connectedUsers.delete(socket.userId);
    io.emit("userList", Array.from(connectedUsers.keys()));
    io.emit("user-disconnected", socket.userId);
  });
});

http.on("error", (error) => {
  logger.error("SERVER_ERROR", "Server error occurred", error);
});

process.on("uncaughtException", (error) => {
  logger.error("UNCAUGHT_EXCEPTION", "Uncaught exception occurred", error);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("UNHANDLED_REJECTION", "Unhandled rejection occurred", {
    reason,
    promise,
  });
});

http.listen(PORT, () => {
  logger.info("SERVER_START", `Server is running on port ${PORT}`, {
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});
