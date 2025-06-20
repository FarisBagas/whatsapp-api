const EventEmitter = require('events');

class QueueProcessor extends EventEmitter {
  constructor(messageQueue, whatsappClient) {
    super();
    this.messageQueue = messageQueue;
    this.getWhatsAppClient = whatsappClient; // Function to get current client
    this.isProcessing = false;
    this.processingInterval = null;
    this.processIntervalMs = 10000; // Process every 10 seconds
    this.maxConcurrent = 3; // Max concurrent message sends
    this.currentlyProcessing = new Set();
  }

  // Start queue processing
  start() {
    if (this.processingInterval) return;
    
    console.log('🚀 Starting queue processor...');
    this.isProcessing = true;
    
    // Process immediately, then on interval
    this.processQueue();
    
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.processIntervalMs);
    
    // Clean old failed messages daily
    this.cleanupInterval = setInterval(() => {
      this.messageQueue.clearOldFailedMessages();
    }, 24 * 60 * 60 * 1000); // Daily cleanup
  }

  // Stop queue processing
  stop() {
    console.log('🛑 Stopping queue processor...');
    this.isProcessing = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Main queue processing logic
  async processQueue() {
    if (!this.isProcessing) return;
    
    const client = this.getWhatsAppClient();
    if (!client || !client.isReady) {
      // console.log('⏳ WhatsApp client not ready, skipping queue processing');
      return;
    }

    const readyMessages = this.messageQueue.getMessagesForRetry();
    if (readyMessages.length === 0) return;

    console.log(`📊 Processing ${readyMessages.length} messages from queue`);

    // Process messages with concurrency limit
    const processingPromises = [];
    let processed = 0;

    for (const message of readyMessages) {
      if (processed >= this.maxConcurrent) break;
      if (this.currentlyProcessing.has(message.messageId)) continue;

      this.currentlyProcessing.add(message.messageId);
      processed++;

      const promise = this.processMessage(message)
        .finally(() => {
          this.currentlyProcessing.delete(message.messageId);
        });

      processingPromises.push(promise);
    }

    // Wait for all concurrent processing to complete
    if (processingPromises.length > 0) {
      await Promise.allSettled(processingPromises);
    }
  }

  // Process individual message
  async processMessage(message) {
    const { messageId, chatId, message: text, formattedNumber } = message;
    
    try {
      console.log(`📤 Retrying message ${messageId} to ${formattedNumber} (attempt ${message.attempts + 1})`);
      
      const client = this.getWhatsAppClient();
      if (!client || !client.isReady) {
        throw new Error('WhatsApp client not ready');
      }

      // Validate contact before sending
      try {
        const contact = await client.getContactById(chatId);
        if (!contact.isWAContact) {
          throw new Error('Number not registered on WhatsApp');
        }
      } catch (contactError) {
        if (contactError.message.includes('not registered')) {
          // Permanent failure - don't retry
          this.messageQueue.markAsFailed(messageId, 'Number not registered on WhatsApp');
          this.emit('messageFailed', { messageId, reason: 'invalid_number', error: contactError.message });
          return;
        }
        throw contactError; // Re-throw for retry
      }

      // Send message
      const sentMessage = await client.sendMessage(chatId, text);
      
      // Success - remove from queue
      this.messageQueue.updateRetryInfo(messageId, true);
      
      console.log(`✅ Message ${messageId} sent successfully`);
      this.emit('messageSuccess', { 
        messageId, 
        sentMessageId: sentMessage.id._serialized, 
        to: formattedNumber 
      });

    } catch (error) {
      console.log(`❌ Failed to send message ${messageId}:`, error.message);
      
      // Determine if error is retryable
      const isRetryable = this.isRetryableError(error);
      
      if (isRetryable) {
        // Update retry info for next attempt
        this.messageQueue.updateRetryInfo(messageId, false, error.message);
        this.emit('messageRetry', { messageId, error: error.message, attempts: message.attempts + 1 });
      } else {
        // Permanent failure
        this.messageQueue.markAsFailed(messageId, error.message);
        this.emit('messageFailed', { messageId, reason: 'permanent_error', error: error.message });
      }
    }
  }

  // Determine if error is retryable
  isRetryableError(error) {
    const retryableErrors = [
      'Session closed',
      'Protocol error',
      'Target closed',
      'Navigation timeout',
      'net::ERR_',
      'WhatsApp client not ready',
      'Connection failed',
      'Timeout',
      'Network error'
    ];

    const nonRetryableErrors = [
      'not registered',
      'Invalid number',
      'Blocked',
      'Rate limited permanently'
    ];

    const errorMsg = error.message.toLowerCase();

    // Check non-retryable first
    for (const nonRetryable of nonRetryableErrors) {
      if (errorMsg.includes(nonRetryable.toLowerCase())) {
        return false;
      }
    }

    // Check retryable
    for (const retryable of retryableErrors) {
      if (errorMsg.includes(retryable.toLowerCase())) {
        return true;
      }
    }

    // Default to retryable for unknown errors
    return true;
  }

  // Get processor statistics
  getStats() {
    return {
      isProcessing: this.isProcessing,
      currentlyProcessing: this.currentlyProcessing.size,
      maxConcurrent: this.maxConcurrent,
      processInterval: this.processIntervalMs,
      queueStats: this.messageQueue.getStats()
    };
  }

  // Update processing configuration
  updateConfig(config) {
    if (config.processInterval) {
      this.processIntervalMs = config.processInterval;
      if (this.processingInterval) {
        this.stop();
        this.start();
      }
    }
    
    if (config.maxConcurrent) {
      this.maxConcurrent = config.maxConcurrent;
    }
    
    console.log('🔧 Queue processor config updated:', config);
  }
}

module.exports = QueueProcessor;