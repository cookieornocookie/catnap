export class ChatController {
  constructor(socket, currentUserId) {
    this.socket = socket;
    this.currentUserId = currentUserId;
    this.activeChatId = null;
    this.activeRecipientId = null;
  }

  openChat(chatId, recipientId, recipientName) {
    this.activeChatId = chatId;
    this.activeRecipientId = recipientId;

    // Render header
    document.getElementById('chat-recipient-name').innerText = recipientName;
    document.getElementById('chat-messages-container').innerHTML = '';
  }

  sendMessage(text) {
    if (!text.trim() || !this.activeChatId) return;

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    this.socket.emit('send_chat', {
      chatId: this.activeChatId,
      recipientId: this.activeRecipientId,
      text: text,
      id: messageId
    });

    this.appendMessage({
      id: messageId,
      senderId: this.currentUserId,
      text: text,
      savedBy: []
    });
  }

  appendMessage(msg) {
    const container = document.getElementById('chat-messages-container');
    const msgEl = document.createElement('div');
    const isSelf = msg.senderId === this.currentUserId;

    msgEl.className = `chat-bubble ${isSelf ? 'sent' : 'received'}`;
    msgEl.dataset.messageId = msg.id;

    if (msg.savedBy && msg.savedBy.length > 0) {
      msgEl.classList.add('saved');
    }

    msgEl.innerHTML = `<span class="message-text">${msg.text}</span>`;

    // Snapchat Tap to Save toggle
    msgEl.addEventListener('click', () => {
      this.socket.emit('toggle_save_message', {
        chatId: this.activeChatId,
        messageId: msg.id
      });
    });

    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
  }

  updateMessageSaveState(messageId, savedBy) {
    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!msgEl) return;

    if (savedBy && savedBy.length > 0) {
      msgEl.classList.add('saved');
    } else {
      msgEl.classList.remove('saved');
    }
  }

  closeChat() {
    if (this.activeChatId) {
      // Notify server user navigated away -> trigger purge of unsaved read messages
      this.socket.emit('leave_chat', { chatId: this.activeChatId });
      this.activeChatId = null;
      this.activeRecipientId = null;
    }
  }
}
