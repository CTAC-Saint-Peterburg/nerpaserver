const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

console.log("Сервер запущен");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Разрешить все источники (для разработки)
    methods: ["GET", "POST"],
  },
});

// Хранилище для лобби
const lobbies = new Map();

// Авторизация при подключении
io.use((socket, next) => {
  const name = socket.handshake.auth.name;
  if (name) {
    socket.handshake.auth.name = name;
    next();
  } else {
    next(new Error("Не указано имя пользователя"));
  }
});

// Обработка подключений
io.on("connection", (socket) => {
  console.log("Новое соединение:", socket.id);

  // Отправляем текущий список лобби новому клиенту сразу после подключения
  socket.emit("initialLobbies", Array.from(lobbies.values()));

  // Создание лобби
  socket.on("createLobby", (data) => {
    const { lobbyName, creatorName } = data;
    const lobbyId = `lobby-${Date.now()}`;
    const createdAt = new Date().toLocaleTimeString(); // Время создания лобби

    lobbies.set(lobbyId, {
      id: lobbyId,
      name: lobbyName,
      creator: creatorName,
      players: [{ id: socket.id, name: creatorName, x: 0, y: 0 }], // Добавляем имя создателя и начальные координаты
      createdAt, // Время создания
    });

    socket.join(lobbyId); // Присоединяем сокет к комнате лобби
    io.emit("updateLobbies", Array.from(lobbies.values())); // Обновляем список лобби для всех
  });

  // Присоединение к лобби
  socket.on("joinLobby", (data) => {
    const { lobbyId } = data;
    const playerName = socket.handshake.auth.name; // Получаем имя игрока из аутентификации

    if (lobbies.has(lobbyId)) {
      const lobby = lobbies.get(lobbyId);
      lobby.players.push({ id: socket.id, name: playerName, x: 0, y: 0 });
      socket.join(lobbyId);

      // Уведомляем всех в лобби о новом игроке
      io.to(lobbyId).emit("playerJoined", { playerId: socket.id, lobby });

      // Уведомляем других игроков о присоединении нового игрока
      socket.to(lobbyId).emit("joinAlert", {
        text: `Игрок ${playerName} присоединился к игре!`,
        playerName: playerName,
      });

      io.emit("updateLobbies", Array.from(lobbies.values()));
    } else {
      socket.emit("lobbyError", { message: "Лобби не найдено" });
    }
  });

  // Обработка нажатий кнопок
  socket.on("keyPressed", (data) => {
    const { key, name, x, y, animationState } = data;
    const lobbyId = Array.from(socket.rooms).find((room) => room !== socket.id); // Находим лобби, в котором находится пользователь

    if (lobbyId) {
      const lobby = lobbies.get(lobbyId);
      const playersInLobby = lobby.players; // Получаем массив игроков в лобби

      // Обновляем позицию игрока
      const player = playersInLobby.find((p) => p.name === name);
      if (player) {
        player.x = x;
        player.y = y;
        player.animationState = animationState;
      }

      // Отправляем информацию о нажатой кнопке и массив игроков всем пользователям в лобби
      io.to(lobbyId).emit("keyPressedInLobby", {
        name,
        key,
        x,
        y,
        animationState,
        players: playersInLobby, // Добавляем массив игроков
      });

      console.log(
        `Пользователь ${name} нажал кнопку ${key} в лобби ${lobbyId}`
      );
    }
  });

  // Отключение клиента
  socket.on("disconnect", () => {
    console.log("Соединение закрыто:", socket.id);

    // Удаляем игрока из лобби, но лобби не удаляется
    lobbies.forEach((lobby) => {
      lobby.players = lobby.players.filter((player) => player.id !== socket.id);
    });

    io.emit("updateLobbies", Array.from(lobbies.values())); // Обновляем список лобби
  });
});

// Запуск сервера
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
