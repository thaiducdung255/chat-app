const WS = require('ws');
const { v4: uuidv4 } = require('uuid');
const User = require('./models.user');
const Message = require('./models.message');

class WebSocket {
  constructor() {
    this.clients = [];
    this.port = process.env.WS_PORT || 3000;
    this.instance = new WS.Server({ port: this.port });
    process.stdout.write(`WSS is online on port ${this.port}\n`);

    this.instance.on('connection', (ws) => {
      const currentConnection = ws;
      currentConnection.roomIds = [];
      currentConnection.userId = null;
      currentConnection.email = null;

      try {
        ws.on('message', (message) => {
          const parsedMessage = JSON.parse(message);
          if (!parsedMessage || !parsedMessage.data || !parsedMessage.cmd) {
            return ws.send(JSON.stringify({ message: 'empty body is forbidden', success: false }));
          }

          if (!currentConnection.userId && parsedMessage.cmd !== 'login') {
            return ws.send(JSON.stringify({ message: 'login required', success: false }));
          }

          switch (parsedMessage.cmd) {
            case 'login':
              this.handleLogin(ws, parsedMessage);
              break;

            case 'get-msg':
              this.handleGetMessage(ws, parsedMessage);
              break;

            case 'send-msg':
              this.handleSendMessage(ws, parsedMessage);
              break;

            case 'join-room-req':
              this.handleJoinRoomRequest(ws, parsedMessage);
              break;

            case 'join-room-res':
              this.handleJoinRoomResponse(ws, parsedMessage);
              break;

            case 'create-room':
              this.handleCreateRoom(ws, parsedMessage);
              break;

            case 'leave-room':
              this.handleLeaveRoom(ws, parsedMessage);
              break;

            default:
              throw new Error('invalid command detected: ', parsedMessage.cmd);
          }
          return true;
        });
      } catch (error) {
        return false;
      }
      return true;
    });
  }

  async handleLogin(ws, parsedMessage) {
    const currentClient = ws;
    const { email, password } = parsedMessage.data;
    const user = await User.findOne({ email, password });

    if (!user) {
      const message = JSON.stringify({
        message: 'login failed',
        success: false,
      });

      currentClient.send(message);
      return currentClient.close();
    }

    // eslint-disable-next-line no-underscore-dangle
    currentClient.userId = user._id;
    currentClient.email = email;
    currentClient.roomIds = user.roomIds;

    const message = JSON.stringify({
      message: 'login success',
      success: true,
      data: {
        userId: currentClient.userId,
        email,
        roomIds: user.roomIds,
      },
    });

    this.clients.push(currentClient);
    return currentClient.send(message);
  }

  async handleSendMessage(currentClient, parsedMessage) {
    const { content, roomId } = parsedMessage.data;

    if (!currentClient.roomIds.includes(roomId)) {
      return currentClient.send(JSON.stringify({
        message: `you are not allowed to send message to room ${roomId}`,
        success: false,
      }));
    }

    const receivers = this.clients.filter((client) => client.roomIds.includes(roomId));

    receivers.forEach((client) => {
      client.send(JSON.stringify({
        message: 'send-msg',
        success: true,
        data: {
          from: {
            email: currentClient.email,
            userId: currentClient.userId,
          },
          content,
          timestamp: new Date().toISOString(),
        },
      }));
    });

    return new Message({
      roomId,
      from: {
        email: currentClient.email,
        userId: currentClient.userId,
      },
      content,
    }).save();
  }

  // eslint-disable-next-line class-methods-use-this
  async handleCreateRoom(currentClient) {
    const roomId = uuidv4();
    currentClient.roomIds.push(roomId);
    await User.updateOne({ _id: currentClient.userId }, { $push: { roomIds: roomId } });

    currentClient.send(JSON.stringify({
      message: 'create-room',
      success: true,
      data: {
        roomId,
        timestamp: new Date().toISOString(),
      },
    }));
  }

  // eslint-disable-next-line class-methods-use-this
  async handleGetMessage(currentClient, parsedMessage) {
    const { roomId } = parsedMessage.data;

    if (!currentClient.roomIds.includes(roomId)) {
      return currentClient.send(JSON.stringify({
        message: 'get-msg',
        data: {
          roomId,
        },
        success: false,
      }));
    }

    const { email } = currentClient;

    const messages = await Message.find({
      roomId,
    });

    return currentClient.send(JSON.stringify({
      message: 'get-message',
      success: true,
      data: {
        roomId,
        messages,
        timestamp: new Date().toISOString(),
      },
    }));
  }

  // eslint-disable-next-line class-methods-use-this
  async handleLeaveRoom(currentClient, parsedMessage) {
    const { roomId } = parsedMessage.data;

    for (let roomIndex = 0; roomIndex < currentClient.roomIds.length; roomIndex += 1) {
      const currentRoomId = currentClient.roomIds[roomIndex];

      if (currentRoomId === roomId) {
        currentClient.roomIds.splice(roomIndex, 1);
        break;
      }
    }

    await User.updateOne({ _id: currentClient.userId }, { $pull: { roomIds: roomId } });

    currentClient.send(JSON.stringify({
      message: 'leave-room',
      success: true,
      data: {
        roomId,
        timestamp: new Date().toISOString(),
      },
    }));
  }

  handleJoinRoomRequest(currentConnection, parsedMessage) {
    const { roomId } = parsedMessage.data;

    const joinRoomRequestMessage = {
      message: 'join-room-req',
      success: false,
      data: {
        from: currentConnection.email,
        userId: currentConnection.userId,
        roomId,
        timestamp: new Date().toISOString(),
      },
    };

    const approvers = this.clients.filter((client) => client.roomIds.includes(roomId));
    approvers.forEach((client) => client.send(JSON.stringify(joinRoomRequestMessage)));

    currentConnection.send(JSON.stringify({
      message: 'join-room-request',
      success: true,
    }));
  }

  async handleJoinRoomResponse(currentConnection, parsedMessage) {
    const { roomId, requestAccepted, userId } = parsedMessage.data;

    if (!requestAccepted) return;

    const approver = {
      email: currentConnection.email,
      userId: currentConnection.userId,
    };

    const requestUser = this.clients.filter((client) => client.userId === userId);
    if (!requestUser.length || requestUser[0].roomIds.includes(roomId)) return;
    requestUser[0].roomIds.push(roomId);
    await User.updateOne({ _id: userId }, { $push: { roomIds: roomId } });

    currentConnection.send(JSON.stringify({
      message: 'join-room-res',
      success: true,
      data: {
        requestUserId: userId,
        requestRoomId: roomId,
      },
    }));

    requestUser[0].send(JSON.stringify({
      message: 'join-room-res',
      success: true,
      data: {
        approver,
        roomId,
      },
    }));
  }
}

module.exports = WebSocket;
