const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

console.log('Сервер запущен');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Разрешить все источники (для разработки)
    methods: ['GET', 'POST'],
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
    next(new Error('Не указано имя пользователя'));
  }
});

// Обработка подключений
io.on('connection', (socket) => {
  console.log('Новое соединение:', socket.id);

  // Отправляем текущий список лобби новому клиенту сразу после подключения
  socket.emit('initialLobbies', Array.from(lobbies.values()));

  // Создание лобби
  socket.on('createLobby', (data) => {
    const { lobbyName, creatorName } = data;
    const lobbyId = `lobby-${Date.now()}`;
    const createdAt = new Date().toLocaleTimeString(); // Время создания лобби

    lobbies.set(lobbyId, {
      id: lobbyId,
      name: lobbyName,
      creator: creatorName,
      players: [{ id: socket.id, name: creatorName }], // Добавляем имя создателя
      createdAt, // Время создания
    });

    socket.join(lobbyId); // Присоединяем сокет к комнате лобби
    io.emit('updateLobbies', Array.from(lobbies.values())); // Обновляем список лобби для всех
  });

  // Присоединение к лобби
  socket.on('joinLobby', (data) => {
    const { lobbyId } = data;

    if (lobbies.has(lobbyId)) {
      const lobby = lobbies.get(lobbyId);
      lobby.players.push({ id: socket.id, name: socket.handshake.auth.name }); // Добавляем имя пользователя
      socket.join(lobbyId);

      // Уведомляем всех в лобби о новом игроке
      io.to(lobbyId).emit('playerJoined', { playerId: socket.id, lobby });
      io.emit('updateLobbies', Array.from(lobbies.values())); // Обновляем список лобби
    } else {
      socket.emit('lobbyError', { message: 'Лобби не найдено' });
    }
  });

  // Обработка нажатий кнопок
  socket.on('keyPressed', (data) => {
    const { key, name, x, y } = data;
    const lobbyId = Array.from(socket.rooms).find(room => room !== socket.id); // Находим лобби, в котором находится пользователь

    if (lobbyId) {
      // Отправляем информацию о нажатой кнопке всем пользователям в лобби
      io.to(lobbyId).emit('keyPressedInLobby', { name, key, x, y });
      console.log(`Пользователь ${name} нажал кнопку ${key} в лобби ${lobbyId}`);
    }
  });

  // Обработка запроса на обновление списка лобби
  socket.on('requestLobbies', () => {
    socket.emit('updateLobbies', Array.from(lobbies.values()));
  });

  // Отключение клиента
  socket.on('disconnect', () => {
    console.log('Соединение закрыто:', socket.id);

    // Удаляем игрока из лобби, но лобби не удаляется
    lobbies.forEach((lobby) => {
      lobby.players = lobby.players.filter((player) => player.id !== socket.id);
    });

    io.emit('updateLobbies', Array.from(lobbies.values())); // Обновляем список лобби
  });
});

// Запуск сервера
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
//