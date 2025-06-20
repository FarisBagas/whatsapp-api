const Bull = require('bull');
const Redis = require('ioredis');

class BullMessageQueue {
  constructor() {
    // Redis connection config
    this.redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB || 0,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true
    };

    // Initialize Bull queue for WhatsApp messages
    this.messageQueue = new Bull('whatsapp-messages', {
      redis: this.redisConfig,
      defaultJobOptions: {
        removeOnComplete: 10, // Keep last 10 completed jobs
        removeOnFail: 50,     // Keep last 50 failed jobs for debugging
        attempts: 5,          // Max retry attempts
        backoff: {
          type: 'exponential',
          delay: 2000         // Start with 2 seconds
        }
      }
    });

    // Priority levels for different message types
    this.priorities = {
      HIGH: 10,     // Urgent messages
      NORMAL: 5,    // Regular messages
      LOW: 1        // Bulk messages
    };

    this.setupEventListeners();
    console.log('📊 Bull Queue System initialized');
  }

  // Setup event listeners for queue monitoring
  setupEventListeners() {
    this.messageQueue.on('ready', () => {
      console.log('✅ Bull queue connected to Redis');
    });

    this.messageQueue.on('error', (error) => {
      console.error('❌ Bull queue error:', error.message);
    });

    this.messageQueue.on('waiting', (jobId) => {
      console.log(`⏳ Job ${jobId} is waiting`);
    });

    this.messageQueue.on('active', (job, jobPromise) => {
      console.log(`🔄 Job ${job.id} started processing`);
    });

    this.messageQueue.on('completed', (job, result) => {
      console.log(`✅ Job ${job.id} completed successfully`);
    });

    this.messageQueue.on('failed', (job, err) => {
      console.log(`❌ Job ${job.id} failed: ${err.message}`);
    });

    this.messageQueue.on('stalled', (job) => {
      console.log(`⚠️ Job ${job.id} stalled and will be retried`);
    });
  }

  // Add message to queue
  async addMessage(messageData, options = {}) {
    try {
      const {
        chatId,
        message,
        formattedNumber,
        originalNumber,
        priority = 'NORMAL',
        delay = 0
      } = messageData;

      const jobData = {
        chatId,
        message,
        formattedNumber,
        originalNumber,
        timestamp: Date.now(),
        messageId: options.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      const jobOptions = {
        priority: this.priorities[priority] || this.priorities.NORMAL,
        delay: delay,
        jobId: jobData.messageId, // Use messageId as jobId for tracking
        ...options.jobOptions
      };

      const job = await this.messageQueue.add('send-message', jobData, jobOptions);
      
      console.log(`📥 Message queued: ${job.id} to ${formattedNumber}`);
      return {
        jobId: job.id,
        messageId: jobData.messageId,
        status: 'queued',
        priority: priority
      };

    } catch (error) {
      console.error('❌ Failed to add message to queue:', error.message);
      throw error;
    }
  }

  // Remove message from queue
  async removeMessage(jobId) {
    try {
      const job = await this.messageQueue.getJob(jobId);
      if (job) {
        await job.remove();
        console.log(`📤 Removed job ${jobId} from queue`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Failed to remove message from queue:', error.message);
      return false;
    }
  }

  // Get queue statistics
  async getStats() {
    try {
      const waiting = await this.messageQueue.getWaiting();
      const active = await this.messageQueue.getActive();
      const completed = await this.messageQueue.getCompleted();
      const failed = await this.messageQueue.getFailed();
      const delayed = await this.messageQueue.getDelayed();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        total: waiting.length + active.length + completed.length + failed.length + delayed.length
      };
    } catch (error) {
      console.error('❌ Failed to get queue stats:', error.message);
      return {
        waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, total: 0
      };
    }
  }

  // Get jobs by status
  async getJobs(status = 'waiting', start = 0, end = 10) {
    try {
      let jobs = [];
      
      switch (status) {
        case 'waiting':
          jobs = await this.messageQueue.getWaiting(start, end);
          break;
        case 'active':
          jobs = await this.messageQueue.getActive(start, end);
          break;
        case 'completed':
          jobs = await this.messageQueue.getCompleted(start, end);
          break;
        case 'failed':
          jobs = await this.messageQueue.getFailed(start, end);
          break;
        case 'delayed':
          jobs = await this.messageQueue.getDelayed(start, end);
          break;
        default:
          jobs = await this.messageQueue.getJobs([status], start, end);
      }

      return jobs.map(job => ({
        id: job.id,
        data: job.data,
        opts: job.opts,
        progress: job.progress(),
        attempts: job.attemptsMade,
        failedReason: job.failedReason,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        timestamp: job.timestamp
      }));

    } catch (error) {
      console.error('❌ Failed to get jobs:', error.message);
      return [];
    }
  }

  // Clean old jobs
  async cleanQueue(grace = 24 * 60 * 60 * 1000) { // 24 hours default
    try {
      const cleaned = await this.messageQueue.clean(grace, 'completed');
      const cleanedFailed = await this.messageQueue.clean(grace, 'failed');
      
      console.log(`🧹 Cleaned ${cleaned.length} completed and ${cleanedFailed.length} failed jobs`);
      return cleaned.length + cleanedFailed.length;
    } catch (error) {
      console.error('❌ Failed to clean queue:', error.message);
      return 0;
    }
  }

  // Clear entire queue
  async clearQueue() {
    try {
      await this.messageQueue.empty();
      console.log('🧹 Queue cleared');
      return true;
    } catch (error) {
      console.error('❌ Failed to clear queue:', error.message);
      return false;
    }
  }

  // Pause/Resume queue
  async pauseQueue() {
    try {
      await this.messageQueue.pause();
      console.log('⏸️ Queue paused');
      return true;
    } catch (error) {
      console.error('❌ Failed to pause queue:', error.message);
      return false;
    }
  }

  async resumeQueue() {
    try {
      await this.messageQueue.resume();
      console.log('▶️ Queue resumed');
      return true;
    } catch (error) {
      console.error('❌ Failed to resume queue:', error.message);
      return false;
    }
  }

  // Get specific job
  async getJob(jobId) {
    try {
      const job = await this.messageQueue.getJob(jobId);
      if (!job) return null;

      return {
        id: job.id,
        data: job.data,
        opts: job.opts,
        progress: job.progress(),
        attempts: job.attemptsMade,
        failedReason: job.failedReason,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        timestamp: job.timestamp
      };
    } catch (error) {
      console.error('❌ Failed to get job:', error.message);
      return null;
    }
  }

  // Retry failed job
  async retryJob(jobId) {
    try {
      const job = await this.messageQueue.getJob(jobId);
      if (job) {
        await job.retry();
        console.log(`🔄 Job ${jobId} marked for retry`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Failed to retry job:', error.message);
      return false;
    }
  }

  // Close queue connection
  async close() {
    try {
      await this.messageQueue.close();
      console.log('🔌 Bull queue connection closed');
    } catch (error) {
      console.error('❌ Failed to close queue:', error.message);
    }
  }

  // Get the Bull queue instance (for advanced operations)
  getQueue() {
    return this.messageQueue;
  }
}

module.exports = BullMessageQueue;