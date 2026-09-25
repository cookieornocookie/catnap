require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const pushService = require('./push');
const tempStorage = require('./temp-storage');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e7 // Allow up to 10MB payload size for snap photo binary transfers
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, '../client')));

// Initialize Web Push configuration
pushService.initWebPush();

// --- REST API ENDPOINTS ---

// Save iOS Web Push subscription for a user
app.post('/api/save-subscription', (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription) {
    return res.status(400).json({ error: 'userId and subscription required' });
  }

  tempStorage.saveSubscription(userId, subscription);
  res.status(201).json({ status: 'success', message: 'Push subscription saved.' });
});

// Trigger push notification test
app.post('/api/test-push', async (req, res) => {
  const { userId } = req.body;
  const user = tempStorage.getUser(userId);

  if (!user || !user.pushSubscription) {
    return res.status(404).json({ error: 'User push subscription not found.' });
  }

  const result = await pushService.sendNotification(user.pushSubscription, {
    title: 'Snapchat',
    body: 'Notifications are working on your iPad PWA!',
    url: '/'
  });

  res.json({ success: !!result });
});

// Post a new snap via HTTP fallback
app.post('/api/snaps', (req, res) => {
  const { senderId, recipientId, mediaUrl, duration } = req.body;
  const snapId = `snap_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  const snap = tempStorage.createSnap({ snapId, senderId, recipientId, mediaUrl, duration });

  // Check if recipient has push subscription
  const recipient = tempStorage.getUser(recipientId);
  if (recipient && recipient.pushSubscription) {
    const sender = tempStorage.getUser(senderId);
    pushService.sendNotification(recipient.pushSubscription, {
      title: sender ? sender.username : 'New Snap!',
      body: 'Sent you a Snap. Tap to view!',
      url: '/chat'
    });
  }

  res.status(201).json({ success: true, snapId });
});

// --- SOCKET.IO REAL-TIME EPHEMERAL LOGIC ---

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // User Authentication / Registration
  socket.on('user_connect', ({ userId, username }) => {
    socket.userId = userId;
    socket.username = username;
    socket.join(userId);

    tempStorage.registerUser(userId, username, socket.id);
    console.log(`[User] ${username} (${userId}) joined socket channel.`);
  });

  // Sending a Snap
  socket.on('send_snap', async (data) => {
    const { recipientId, mediaUrl, duration } = data;
    const snapId = `snap_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    const snap = tempStorage.createSnap({
      snapId,
      senderId: socket.userId,
      recipientId,
      mediaUrl,
      duration
    });

    // Notify recipient if connected via socket
    io.to(recipientId).emit('receive_snap', {
      snapId: snap.snapId,
      senderId: socket.userId,
      senderName: socket.username,
      duration: snap.duration
    });

    // Also send Web Push Notification if available
    const recipient = tempStorage.getUser(recipientId);
    if (recipient && recipient.pushSubscription) {
      await pushService.sendNotification(recipient.pushSubscription, {
        title: socket.username || 'New Snap',
        body: '📷 Sent you a Snap!',
        url: '/chat'
      });
    }
  });

  // Requesting Snap Media to View
  socket.on('open_snap', ({ snapId }) => {
    const snap = tempStorage.getSnap(snapId);
    if (snap) {
      socket.emit('snap_payload', snap);
      snap.viewed = true;
    } else {
      socket.emit('snap_error', { message: 'Snap expired or deleted.' });
    }
  });

  // Client confirms snap timer ended -> Destroy snap permanently
  socket.on('destroy_snap', ({ snapId }) => {
    const deleted = tempStorage.deleteSnap(snapId);
    if (deleted) {
      socket.emit('snap_destroyed', { snapId });
    }
  });

  // Sending Real-Time Chat Message
  socket.on('send_chat', async ({ chatId, recipientId, text, id }) => {
    const message = {
      id: id || `msg_${Date.now()}`,
      senderId: socket.userId,
      senderName: socket.username,
      text
    };

    tempStorage.saveMessage(chatId, message);

    // Relay to room
    io.to(recipientId).emit('receive_chat', { chatId, message });

    // Send iOS Push Notification
    const recipient = tempStorage.getUser(recipientId);
    if (recipient && recipient.pushSubscription) {
      await pushService.sendNotification(recipient.pushSubscription, {
        title: socket.username || 'New Message',
        body: text,
        url: '/chat'
      });
    }
  });

  // Toggle Save Chat Message
  socket.on('toggle_save_message', ({ chatId, messageId }) => {
    const updatedMessage = tempStorage.toggleSaveMessage(chatId, messageId, socket.userId);
    if (updatedMessage) {
      io.to(chatId).emit('message_save_updated', { chatId, messageId, savedBy: updatedMessage.savedBy });
    }
  });

  // User exits chat view -> Purge unsaved read messages
  socket.on('leave_chat', ({ chatId }) => {
    tempStorage.purgeUnsavedMessages(chatId);
    io.to(chatId).emit('chat_purged', { chatId });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Snapchat PWA Server running on port ${PORT}`);
  console.log(`Local Access: http://localhost:${PORT}`);
  console.log(`=================================`);
});
