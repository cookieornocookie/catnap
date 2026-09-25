import { PushManager } from './pwa-push.js';
import { CameraController } from './camera.js';
import { ChatController } from './chat.js';
import { StoryViewer } from './stories.js';
import { playSound } from './utils.js';

// Configuration VAPID Key (Match with server .env)
const PUBLIC_VAPID_KEY = 'YOUR_GENERATED_PUBLIC_VAPID_KEY';

class SnapchatApp {
  constructor() {
    // Session state
    this.userId = localStorage.getItem('snap_user_id') || `user_${Math.random().toString(36).substr(2, 6)}`;
    this.username = localStorage.getItem('snap_username') || `Friend_${this.userId.slice(-4)}`;
    localStorage.setItem('snap_user_id', this.userId);
    localStorage.setItem('snap_username', this.username);

    // Initialize Socket.io connection
    this.socket = io();

    // Module Controllers
    this.pushManager = new PushManager(this.userId, PUBLIC_VAPID_KEY);
    this.camera = new CameraController(
      document.getElementById('camera-feed'),
      document.getElementById('snap-canvas'),
      document.getElementById('drawing-canvas')
    );
    this.chat = new ChatController(this.socket, this.userId);
    this.stories = new StoryViewer(this.socket);

    this.activeSnapTimer = null;
    this.init();
  }

  async init() {
    // 1. Connect Socket
    this.socket.emit('user_connect', { userId: this.userId, username: this.username });

    // 2. Initialize PWA Push
    await this.pushManager.init();

    // 3. Start Camera
    await this.camera.startCamera();

    // 4. Attach Navigation & UI Listeners
    this.setupEventListeners();
    this.setupSocketListeners();
  }

  setupEventListeners() {
    // Navigation Tabs
    document.getElementById('nav-camera').addEventListener('click', () => this.switchTab('camera'));
    document.getElementById('nav-chat').addEventListener('click', () => this.switchTab('chat'));
    document.getElementById('nav-stories').addEventListener('click', () => this.switchTab('stories'));

    // Capture Shutter Button
    document.getElementById('shutter-btn').addEventListener('click', () => {
      const snapData = this.camera.captureSnap();
      this.openSnapSendModal(snapData);
    });

    // Push Notification Banner Button
    document.getElementById('enable-push-btn').addEventListener('click', async () => {
      await this.pushManager.subscribeUser();
    });

    // Snap View Modal Close / Tap Handler
    document.getElementById('snap-viewer-modal').addEventListener('click', () => {
      this.closeActiveSnap();
    });
  }

  setupSocketListeners() {
    // Receive Realtime Snap Notification
    this.socket.on('receive_snap', (snapInfo) => {
      playSound('notification');
      this.addSnapToFeed(snapInfo);
    });

    // Receive Snap Payload Data
    this.socket.on('snap_payload', (snap) => {
      this.displaySnapInViewer(snap);
    });

    // Receive Chat Message
    this.socket.on('receive_chat', ({ chatId, message }) => {
      if (this.chat.activeChatId === chatId) {
        this.chat.appendMessage(message);
      } else {
        playSound('notification');
      }
    });

    // Chat Message Save Update
    this.socket.on('message_save_updated', ({ messageId, savedBy }) => {
      this.chat.updateMessageSaveState(messageId, savedBy);
    });
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(`page-${tabName}`).classList.add('active');
    document.getElementById(`nav-${tabName}`).classList.add('active');

    if (tabName !== 'chat') {
      this.chat.closeChat();
    }
  }

  openSnapSendModal(snapData) {
    const recipientId = prompt('Enter recipient User ID:');
    if (!recipientId) return;

    this.socket.emit('send_snap', {
      recipientId,
      mediaUrl: snapData.mediaUrl,
      duration: snapData.duration
    });

    alert('Snap Sent!');
    this.camera.clearDrawing();
  }

  addSnapToFeed(snapInfo) {
    const feed = document.getElementById('chat-feed-list');
    const item = document.createElement('div');
    item.className = 'chat-feed-item unread';
    item.innerHTML = `
      <div class="snap-icon red-square"></div>
      <div class="feed-info">
        <span class="user-name">${snapInfo.senderName}</span>
        <span class="status-text">New Snap • Tap to view</span>
      </div>
    `;

    item.addEventListener('click', () => {
      this.socket.emit('open_snap', { snapId: snapInfo.snapId });
      item.classList.remove('unread');
      item.querySelector('.status-text').innerText = 'Opened';
    });

    feed.prepend(item);
  }

  displaySnapInViewer(snap) {
    const modal = document.getElementById('snap-viewer-modal');
    const img = document.getElementById('snap-viewer-img');
    const countdownEl = document.getElementById('snap-countdown-timer');

    img.src = snap.mediaUrl;
    modal.classList.add('active');

    let timeLeft = snap.duration;
    countdownEl.innerText = timeLeft;

    // Start countdown timer
    this.activeSnapTimer = setInterval(() => {
      timeLeft--;
      countdownEl.innerText = timeLeft;

      if (timeLeft <= 0) {
        this.closeActiveSnap(snap.snapId);
      }
    }, 1000);

    this.currentViewingSnapId = snap.snapId;
  }

  closeActiveSnap(snapId = this.currentViewingSnapId) {
    clearInterval(this.activeSnapTimer);
    const modal = document.getElementById('snap-viewer-modal');
    modal.classList.remove('active');

    if (snapId) {
      // Send destroy signal to server to purge from memory immediately
      this.socket.emit('destroy_snap', { snapId });
      this.currentViewingSnapId = null;
    }
  }
}

// Bootstrap Application on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new SnapchatApp();
});
