const EventEmitter = require('events');

class BullQueueProcessor extends EventEmitter {
  constructor(bullQueue, whatsappClient) {
    super();
    this.bullQueue = bullQueue;
    this.getWhatsAppClient = whatsappClient; // Function to get current client
    this.isProcessing = false;
    this.concurrency = 3; // Number of concurrent jobs
    
    this.setupProcessor();
  }

  // Setup Bull queue processor
  setupProcessor() {
    const queue = this.bullQueue.getQueue();
    
    // Process jobs with specified concurrency
    queue.process('send-message', this.concurrency, async (job) => {
      return await this.processMessage(job);
    });

    // Listen to queue events
    queue.on('completed', (job, result) => {
      console.log(`✅ Message ${job.data.messageId} sent successfully`);
      this.emit('messageSuccess', {
        messageId: job.data.messageId,
        jobId: job.id,
        to: job.data.formattedNumber,
        result: result
      });
    });

    queue.on('failed', (job, err) => {
      console.log(`❌ Message ${job.data.messageId} failed: ${err.message}`);
      this.emit('messageFailed', {
        messageId: job.data.messageId,
        jobId: job.id,
        to: job.data.formattedNumber,
        error: err.message,
        attempts: job.attemptsMade
      });
    });

    queue.on('stalled', (job) => {
      console.log(`⚠️ Message ${job.data.messageId} stalled, will retry`);
      this.emit('messageStalled', {
        messageId: job.data.messageId,
        jobId: job.id,
        to: job.data.formattedNumber
      });
    });

    console.log('🚀 Bull queue processor initialized');
  }

  // Process individual message job
  async processMessage(job) {
    const { chatId, message, formattedNumber, messageId } = job.data;
    
    try {
      // Update job progress
      await job.progress(10);
      
      console.log(`📤 Processing message ${messageId} to ${formattedNumber} (attempt ${job.attemptsMade + 1})`);
      
      const client = this.getWhatsAppClient();
      if (!client || !client.isReady) {
        throw new Error('WhatsApp client not ready');
      }

      await job.progress(30);

      // Validate contact before sending
      let contact;
      try {
        contact = await client.getContactById(chatId);
        if (!contact.isWAContact) {
          // Mark as permanent failure - don't retry
          const error = new Error('Number not registered on WhatsApp');
          error.permanent = true;
          throw error;
        }
      } catch (contactError) {
        if (contactError.message.includes('not registered') || 
            contactError.message.includes('invalid')) {
          // Permanent failure
          const error = new Error('Number not registered on WhatsApp');
          error.permanent = true;
          throw error;
        }
        throw contactError; // Re-throw for retry
      }

      await job.progress(60);

      // Send message
      const sentMessage = await client.sendMessage(chatId, message);
      
      await job.progress(100);

      // Return success result
      return {
        success: true,
        messageId: messageId,
        sentMessageId: sentMessage.id._serialized,
        to: formattedNumber,
        timestamp: Date.now()
      };

    } catch (error) {
      // Determine if error should be retried
      if (error.permanent) {
        // Don't retry permanent errors
        throw error;
      }

      if (this.isRetryableError(error)) {
        console.log(`⚠️ Retryable error for message ${messageId}: ${error.message}`);
        throw error; // Bull will handle retry with exponential backoff
      } else {
        // Permanent error - don't retry
        const permanentError = new Error(error.message);
        permanentError.permanent = true;
        throw permanentError;
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
      'Network error',
      'disconnected',
      'ETIMEDOUT',
      'ECONNRESET'
    ];

    const nonRetryableErrors = [
      'not registered',
      'Invalid number',
      'Blocked',
      'Rate limited permanently',
      'invalid wid'
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

  // Start processing (queue auto-starts, this is for compatibility)
  start() {
    this.isProcessing = true;
    console.log('🚀 Bull queue processor started');
    this.emit('started');
  }

  // Stop processing
  async stop() {
    this.isProcessing = false;
    const queue = this.bullQueue.getQueue();
    
    try {
      await queue.pause();
      console.log('🛑 Bull queue processor stopped');
      this.emit('stopped');
    } catch (error) {
      console.error('❌ Failed to stop queue processor:', error.message);
    }
  }

  // Resume processing
  async resume() {
    this.isProcessing = true;
    const queue = this.bullQueue.getQueue();
    
    try {
      await queue.resume();
      console.log('▶️ Bull queue processor resumed');
      this.emit('resumed');
    } catch (error) {
      console.error('❌ Failed to resume queue processor:', error.message);
    }
  }

  // Update concurrency
  async updateConcurrency(newConcurrency) {
    if (newConcurrency >= 1 && newConcurrency <= 10) {
      this.concurrency = newConcurrency;
      
      // Note: Bull doesn't support dynamic concurrency update
      // Would need to recreate processor, but that's complex
      console.log(`🔧 Concurrency updated to ${newConcurrency} (requires restart to take effect)`);
      
      this.emit('configUpdated', { concurrency: newConcurrency });
      return true;
    }
    return false;
  }

  // Get processor statistics
  async getStats() {
    const queueStats = await this.bullQueue.getStats();
    
    return {
      isProcessing: this.isProcessing,
      concurrency: this.concurrency,
      queueStats: queueStats
    };
  }

  // Manual trigger for processing (Bull auto-processes, this is for compatibility)
  async processQueue() {
    // Bull processes automatically, but we can trigger a health check
    console.log('📊 Bull queue is auto-processing. Checking health...');
    
    const stats = await this.getStats();
    console.log('📊 Queue stats:', stats.queueStats);
    
    return stats;
  }

  // Update configuration
  updateConfig(config) {
    let updated = false;
    
    if (config.concurrency) {
      this.updateConcurrency(config.concurrency);
      updated = true;
    }
    
    if (updated) {
      console.log('🔧 Bull queue processor config updated:', config);
      this.emit('configUpdated', config);
    }
    
    return updated;
  }

  // Close processor
  async close() {
    await this.stop();
    await this.bullQueue.close();
    console.log('🔌 Bull queue processor closed');
  }
}

module.exports = BullQueueProcessor;