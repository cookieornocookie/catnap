/**
 * In-memory state store for temporary, ephemeral data
 */
class TempStorage {
  constructor() {
    this.users = new Map();         // userId -> { userId, username, socketId, pushSubscription }
    this.messages = new Map();      // chatId -> Array of { id, senderId, text, savedBy: [], opened: bool }
    this.snaps = new Map();         // snapid -> { snapId, senderId, recipientId, mediaUrl, duration, viewed }
    this.stories = new Map();       // storyId -> { storyId, userId, mediaUrl, timestamp, expiresAt }
  }

  // --- USER MANAGEMENT ---
  registerUser(userId, username, socketId) {
    const existing = this.users.get(userId) || {};
    this.users.set(userId, {
      ...existing,
      userId,
      username,
      socketId,
      lastActive: Date.now()
    });
  }

  saveSubscription(userId, subscription) {
    const user = this.users.get(userId);
    if (user) {
      user.pushSubscription = subscription;
      this.users.set(userId, user);
    }
  }

  getUser(userId) {
    return this.users.get(userId);
  }

  // --- EPHEMERAL CHAT LOGIC ---
  saveMessage(chatId, message) {
    if (!this.messages.has(chatId)) {
      this.messages.set(chatId, []);
    }
    const chat = this.messages.get(chatId);
    chat.push({
      ...message,
      savedBy: [],
      timestamp: Date.now()
    });
  }

  toggleSaveMessage(chatId, messageId, userId) {
    const chat = this.messages.get(chatId);
    if (!chat) return false;

    const msg = chat.find(m => m.id === messageId);
    if (!msg) return false;

    const index = msg.savedBy.indexOf(userId);
    if (index === -1) {
      msg.savedBy.push(userId);
    } else {
      msg.savedBy.splice(index, 1);
    }
    return msg;
  }

  purgeUnsavedMessages(chatId) {
    const chat = this.messages.get(chatId);
    if (!chat) return;

    // Retain only messages that have been explicitly saved by at least one user
    const remaining = chat.filter(m => m.savedBy && m.savedBy.length > 0);
    this.messages.set(chatId, remaining);
  }

  // --- EPHEMERAL SNAP LOGIC ---
  createSnap(snapData) {
    const { snapId, senderId, recipientId, mediaUrl, duration = 10 } = snapData;
    const snap = {
      snapId,
      senderId,
      recipientId,
      mediaUrl,
      duration,
      viewed: false,
      createdAt: Date.now()
    };

    this.snaps.set(snapId, snap);

    // Auto-delete safety timeout: purge after 24h if unopened
    setTimeout(() => {
      if (this.snaps.has(snapId)) {
        console.log(`[Ephemeral] Auto-purging unread snap ${snapId} after timeout.`);
        this.snaps.delete(snapId);
      }
    }, 24 * 60 * 60 * 1000);

    return snap;
  }

  getSnap(snapId) {
    return this.snaps.get(snapId);
  }

  deleteSnap(snapId) {
    if (this.snaps.has(snapId)) {
      this.snaps.delete(snapId);
      console.log(`[Ephemeral] Snap ${snapId} destroyed from server memory.`);
      return true;
    }
    return false;
  }

  // --- STORIES LOGIC ---
  addStory(userId, mediaUrl, duration = 24) {
    const storyId = `story_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const expiresAt = Date.now() + (duration * 60 * 60 * 1000);

    const story = { storyId, userId, mediaUrl, createdAt: Date.now(), expiresAt };
    this.stories.set(storyId, story);

    // Schedule auto-purge after duration
    setTimeout(() => {
      this.stories.delete(storyId);
      console.log(`[Story] Story ${storyId} expired and purged.`);
    }, duration * 60 * 60 * 1000);

    return story;
  }

  getActiveStories() {
    const now = Date.now();
    return Array.from(this.stories.values()).filter(story => story.expiresAt > now);
  }
}

module.exports = new TempStorage();
