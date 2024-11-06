const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = process.env.PORT || 3000;
const activeCallMap = new Map(); // 활성 통화 추적
// 로깅 유틸리티
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

// 연결된 사용자 관리
const connectedUsers = new Map();

io.on("connection", (socket) => {
  logger.info("CONNECTION", `New socket connected - Socket ID: ${socket.id}`);

  // 사용자 등록
  socket.on("register", (userId) => {
    logger.info("REGISTER", `User registration request`, {
      userId,
      socketId: socket.id,
    });

    connectedUsers.set(userId, socket.id);
    socket.userId = userId;

    // 현재 접속한 사용자 목록 전송
    const userList = Array.from(connectedUsers.keys());
    logger.info("USER_LIST", `Broadcasting updated user list`, { userList });
    io.emit("userList", userList);
  });

  // 통화 요청
  socket.on("call-request", (data) => {
    logger.info("CALL_REQUEST", `Call request received`, {
      from: socket.userId,
      to: data.targetUserId,
    });

    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (targetSocketId) {
      logger.info("CALL_REQUEST", `Forwarding call request to target`, {
        targetSocketId,
        callerId: socket.userId,
      });

      io.to(targetSocketId).emit("call-received", {
        callerId: socket.userId,
        callerSocketId: socket.id,
      });
    } else {
      logger.error("CALL_REQUEST", `Target user not found`, {
        targetUserId: data.targetUserId,
      });
    }
  });

  // 통화 수락
  socket.on("call-accepted", (data) => {
    logger.info("CALL_ACCEPT", `Call accepted`, {
      accepterId: socket.userId,
      callerId: data.callerId,
    });
    const callKey = `${data.callerId}-${socket.userId}`;
    activeCallMap.set(callKey, true);
    const callerSocketId = connectedUsers.get(data.callerId);
    if (callerSocketId) {
      logger.info("CALL_ACCEPT", `Notifying caller of acceptance`, {
        callerSocketId,
        accepterId: socket.userId,
      });

      io.to(callerSocketId).emit("call-accepted", {
        accepterId: socket.userId,
        accepterSocketId: socket.id,
      });
    } else {
      logger.error("CALL_ACCEPT", `Caller not found`, {
        callerId: data.callerId,
      });
    }
  });

  // WebRTC Offer 전달
  socket.on("offer", (data) => {
    logger.info("OFFER", `WebRTC offer received`, {
      from: socket.userId,
      to: data.targetUserId,
      offerLength: data.offer.length,
    });

    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (targetSocketId) {
      logger.info("OFFER", `Forwarding offer to target`, {
        targetSocketId,
      });

      io.to(targetSocketId).emit("offer", {
        offer: data.offer,
        callerId: socket.userId,
      });
    } else {
      logger.error("OFFER", `Target user not found for offer`, {
        targetUserId: data.targetUserId,
      });
    }
  });

  // WebRTC Answer 전달
  socket.on("answer", (data) => {
    logger.info("ANSWER", `WebRTC answer received`, {
      from: socket.userId,
      to: data.targetUserId,
      answerLength: data.answer.length,
    });

    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (targetSocketId) {
      logger.info("ANSWER", `Forwarding answer to target`, {
        targetSocketId,
      });

      io.to(targetSocketId).emit("answer", {
        answer: data.answer,
        answererId: socket.userId,
      });
    } else {
      logger.error("ANSWER", `Target user not found for answer`, {
        targetUserId: data.targetUserId,
      });
    }
  });

  // ICE candidate 전달
  socket.on("ice-candidate", (data) => {
    logger.info("ICE_CANDIDATE", `ICE candidate received`, {
      from: socket.userId,
      to: data.targetUserId,
      candidateLength: data.candidate.length,
    });

    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (targetSocketId) {
      logger.info("ICE_CANDIDATE", `Forwarding ICE candidate to target`, {
        targetSocketId,
      });

      io.to(targetSocketId).emit("ice-candidate", {
        candidate: data.candidate,
        senderId: socket.userId,
      });
    } else {
      logger.error("ICE_CANDIDATE", `Target user not found for ICE candidate`, {
        targetUserId: data.targetUserId,
      });
    }
  });

  // 통화 종료
  socket.on("end-call", (data) => {
    const callKey = `${data.from}-${data.to}`;

    // 이미 종료된 통화인지 확인
    if (!activeCallMap.has(callKey)) {
      // logger.info("Call already ended or not active", { callKey });
      return;
    }

    // 통화 종료 처리
    activeCallMap.delete(callKey);

    logger.info("CALL_END", `Call end request received`, {
      from: data.from,
      to: data.to,
    });

    const targetSocketId = connectedUsers.get(data.targetUserId);
    if (targetSocketId) {
      logger.info("CALL_END", `Notifying target of call end`, {
        targetSocketId,
      });
      io.to(targetSocketId).emit("call-ended", {
        enderId: socket.userId,
      });
    }
  });

  // 연결 해제
  socket.on("disconnect", () => {
    logger.info("DISCONNECT", `Socket disconnected`, {
      userId: socket.userId,
      socketId: socket.id,
    });

    if (socket.userId) {
      connectedUsers.delete(socket.userId);

      const userList = Array.from(connectedUsers.keys());
      logger.info(
        "USER_LIST",
        `Broadcasting updated user list after disconnect`,
        {
          userList,
          disconnectedUser: socket.userId,
        }
      );

      io.emit("userList", userList);
      io.emit("user-disconnected", socket.userId);
    }
  });

  // 에러 처리
  socket.on("error", (error) => {
    logger.error("SOCKET_ERROR", `Socket error occurred`, error);
  });
});

// 서버 시작
http.listen(PORT, () => {
  logger.info("SERVER_START", `Signaling server running on port ${PORT}`, {
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

// 예기치 않은 에러 처리
process.on("uncaughtException", (error) => {
  logger.error("UNCAUGHT_EXCEPTION", `Uncaught exception occurred`, error);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("UNHANDLED_REJECTION", `Unhandled rejection occurred`, {
    reason,
    promise,
  });
});
