const fs = require('fs');
const path = require('path');

class MessageQueue {
  constructor() {
    this.queueFile = path.join(__dirname, '..', 'data', 'message-queue.json');
    this.queue = new Map();
    this.processing = false;
    this.maxRetries = 5;
    this.baseDelay = 1000; // 1 second
    this.maxDelay = 300000; // 5 minutes
    
    // Ensure data directory exists
    this.ensureDataDirectory();
    
    // Load queue from file on startup
    this.loadQueue();
  }

  ensureDataDirectory() {
    const dataDir = path.dirname(this.queueFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  // Load queue from persistent storage
  loadQueue() {
    try {
      if (fs.existsSync(this.queueFile)) {
        const data = fs.readFileSync(this.queueFile, 'utf8');
        const queueData = JSON.parse(data);
        
        for (const [messageId, messageData] of Object.entries(queueData)) {
          this.queue.set(messageId, messageData);
        }
        
        console.log(`📊 Loaded ${this.queue.size} messages from persistent queue`);
      }
    } catch (error) {
      console.error('❌ Failed to load message queue:', error.message);
    }
  }

  // Save queue to persistent storage
  saveQueue() {
    try {
      const queueData = Object.fromEntries(this.queue);
      fs.writeFileSync(this.queueFile, JSON.stringify(queueData, null, 2));
    } catch (error) {
      console.error('❌ Failed to save message queue:', error.message);
    }
  }

  // Add message to queue
  addMessage(messageId, messageData) {
    const queueItem = {
      ...messageData,
      messageId,
      attempts: 0,
      nextRetry: Date.now(),
      status: 'pending',
      createdAt: Date.now()
    };
    
    this.queue.set(messageId, queueItem);
    this.saveQueue();
    
    console.log(`📥 Added message to queue: ${messageId}`);
    return queueItem;
  }

  // Remove message from queue
  removeMessage(messageId) {
    const removed = this.queue.delete(messageId);
    if (removed) {
      this.saveQueue();
      console.log(`📤 Removed message from queue: ${messageId}`);
    }
    return removed;
  }

  // Mark message as failed permanently
  markAsFailed(messageId, error) {
    const message = this.queue.get(messageId);
    if (message) {
      message.status = 'failed';
      message.lastError = error;
      message.failedAt = Date.now();
      this.saveQueue();
      console.log(`❌ Marked message as failed: ${messageId}`);
    }
  }

  // Calculate next retry delay using exponential backoff
  calculateBackoffDelay(attempts) {
    const delay = Math.min(
      this.baseDelay * Math.pow(2, attempts),
      this.maxDelay
    );
    
    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.max(1000, delay + jitter); // Minimum 1 second
  }

  // Get messages ready for retry
  getMessagesForRetry() {
    const now = Date.now();
    const readyMessages = [];
    
    for (const [messageId, message] of this.queue) {
      if (message.status === 'pending' && 
          message.nextRetry <= now && 
          message.attempts < this.maxRetries) {
        readyMessages.push({ messageId, ...message });
      }
    }
    
    return readyMessages.sort((a, b) => a.nextRetry - b.nextRetry);
  }

  // Update message retry info
  updateRetryInfo(messageId, success = false, error = null) {
    const message = this.queue.get(messageId);
    if (!message) return;

    message.attempts += 1;
    message.lastAttempt = Date.now();

    if (success) {
      // Remove successful messages
      this.removeMessage(messageId);
      return;
    }

    // Update for retry
    if (message.attempts >= this.maxRetries) {
      this.markAsFailed(messageId, error || 'Max retries exceeded');
    } else {
      const backoffDelay = this.calculateBackoffDelay(message.attempts);
      message.nextRetry = Date.now() + backoffDelay;
      message.lastError = error;
      message.status = 'pending';
      
      console.log(`🔄 Message ${messageId} will retry in ${Math.round(backoffDelay/1000)}s (attempt ${message.attempts}/${this.maxRetries})`);
    }
    
    this.saveQueue();
  }

  // Get queue statistics
  getStats() {
    const stats = {
      total: this.queue.size,
      pending: 0,
      failed: 0,
      processing: this.processing,
      oldestMessage: null,
      newestMessage: null
    };

    let oldest = Infinity;
    let newest = 0;

    for (const message of this.queue.values()) {
      if (message.status === 'pending') stats.pending++;
      if (message.status === 'failed') stats.failed++;
      
      if (message.createdAt < oldest) oldest = message.createdAt;
      if (message.createdAt > newest) newest = message.createdAt;
    }

    if (oldest !== Infinity) stats.oldestMessage = new Date(oldest).toISOString();
    if (newest !== 0) stats.newestMessage = new Date(newest).toISOString();

    return stats;
  }

  // Clear failed messages older than specified time
  clearOldFailedMessages(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
    const cutoff = Date.now() - maxAge;
    let cleared = 0;

    for (const [messageId, message] of this.queue) {
      if (message.status === 'failed' && message.failedAt < cutoff) {
        this.queue.delete(messageId);
        cleared++;
      }
    }

    if (cleared > 0) {
      this.saveQueue();
      console.log(`🧹 Cleared ${cleared} old failed messages`);
    }

    return cleared;
  }

  // Get all messages (for admin view)
  getAllMessages() {
    return Array.from(this.queue.entries()).map(([messageId, data]) => ({
      messageId,
      ...data
    }));
  }

  // Clear entire queue
  clearQueue() {
    const size = this.queue.size;
    this.queue.clear();
    this.saveQueue();
    console.log(`🧹 Cleared entire queue (${size} messages)`);
    return size;
  }
}

module.exports = MessageQueue;