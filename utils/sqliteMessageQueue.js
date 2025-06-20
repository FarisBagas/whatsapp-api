const MessageJob = require('../models/MessageJob');
const { Op } = require('sequelize');

class SQLiteMessageQueue {
  constructor() {
    this.priorities = {
      HIGH: 'HIGH',
      NORMAL: 'NORMAL',
      LOW: 'LOW'
    };
    
    console.log('📊 SQLite Message Queue initialized');
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

      const messageId = options.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const nextRetry = new Date(Date.now() + delay);
      const status = delay > 0 ? 'delayed' : 'waiting';

      const job = await MessageJob.create({
        id: jobId,
        messageId,
        chatId,
        message,
        formattedNumber,
        originalNumber,
        priority,
        status,
        nextRetry,
        delay
      });

      console.log(`📥 Message queued: ${jobId} to ${formattedNumber} (priority: ${priority})`);
      
      return {
        jobId: job.id,
        messageId: job.messageId,
        status: job.status,
        priority: job.priority
      };

    } catch (error) {
      console.error('❌ Failed to add message to queue:', error.message);
      throw error;
    }
  }

  // Remove message from queue
  async removeMessage(jobId) {
    try {
      const deleted = await MessageJob.destroy({
        where: { id: jobId }
      });
      
      if (deleted) {
        console.log(`📤 Removed job ${jobId} from queue`);
      }
      
      return deleted > 0;
    } catch (error) {
      console.error('❌ Failed to remove message from queue:', error.message);
      return false;
    }
  }

  // Get queue statistics
  async getStats() {
    try {
      return await MessageJob.getStats();
    } catch (error) {
      console.error('❌ Failed to get queue stats:', error.message);
      return {
        waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0, total: 0
      };
    }
  }

  // Get jobs by status with pagination
  async getJobs(status = 'waiting', start = 0, end = 10) {
    try {
      const limit = end - start;
      const offset = start;

      const jobs = await MessageJob.findAll({
        where: { status },
        order: [
          ['priority', 'DESC'],
          ['createdAt', 'ASC']
        ],
        limit,
        offset
      });

      return jobs.map(job => ({
        id: job.id,
        data: {
          messageId: job.messageId,
          chatId: job.chatId,
          message: job.message,
          formattedNumber: job.formattedNumber,
          originalNumber: job.originalNumber
        },
        opts: {
          priority: job.priority,
          delay: job.delay
        },
        progress: job.progress,
        attempts: job.attempts,
        failedReason: job.failedReason,
        processedOn: job.processedAt,
        finishedOn: job.completedAt,
        timestamp: job.createdAt.getTime()
      }));

    } catch (error) {
      console.error('❌ Failed to get jobs:', error.message);
      return [];
    }
  }

  // Get jobs ready for processing
  async getJobsForProcessing(limit = 10) {
    try {
      return await MessageJob.getJobsForProcessing(limit);
    } catch (error) {
      console.error('❌ Failed to get jobs for processing:', error.message);
      return [];
    }
  }

  // Clean old jobs
  async cleanQueue(olderThanHours = 24) {
    try {
      const cleaned = await MessageJob.cleanOldJobs(olderThanHours);
      console.log(`🧹 Cleaned ${cleaned} old jobs from queue`);
      return cleaned;
    } catch (error) {
      console.error('❌ Failed to clean queue:', error.message);
      return 0;
    }
  }

  // Clear entire queue
  async clearQueue() {
    try {
      const cleared = await MessageJob.clearAll();
      console.log(`🧹 Cleared ${cleared} jobs from queue`);
      return cleared;
    } catch (error) {
      console.error('❌ Failed to clear queue:', error.message);
      return 0;
    }
  }

  // Pause queue
  async pauseQueue() {
    try {
      const [updated] = await MessageJob.pauseAll();
      console.log(`⏸️ Paused ${updated} jobs in queue`);
      return true;
    } catch (error) {
      console.error('❌ Failed to pause queue:', error.message);
      return false;
    }
  }

  // Resume queue
  async resumeQueue() {
    try {
      const [updated] = await MessageJob.resumeAll();
      console.log(`▶️ Resumed ${updated} jobs in queue`);
      return true;
    } catch (error) {
      console.error('❌ Failed to resume queue:', error.message);
      return false;
    }
  }

  // Get specific job
  async getJob(jobId) {
    try {
      const job = await MessageJob.findByPk(jobId);
      if (!job) return null;

      return {
        id: job.id,
        data: {
          messageId: job.messageId,
          chatId: job.chatId,
          message: job.message,
          formattedNumber: job.formattedNumber,
          originalNumber: job.originalNumber
        },
        opts: {
          priority: job.priority,
          delay: job.delay
        },
        progress: job.progress,
        attempts: job.attempts,
        failedReason: job.failedReason,
        processedOn: job.processedAt,
        finishedOn: job.completedAt,
        timestamp: job.createdAt.getTime()
      };
    } catch (error) {
      console.error('❌ Failed to get job:', error.message);
      return null;
    }
  }

  // Retry failed job
  async retryJob(jobId) {
    try {
      const job = await MessageJob.findByPk(jobId);
      if (!job) return false;

      if (job.status === 'failed' || job.status === 'paused') {
        job.status = 'waiting';
        job.nextRetry = new Date();
        job.lastError = null;
        await job.save();
        
        console.log(`🔄 Job ${jobId} marked for retry`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Failed to retry job:', error.message);
      return false;
    }
  }

  // Mark job as active
  async markJobAsActive(jobId) {
    try {
      const job = await MessageJob.findByPk(jobId);
      if (job) {
        await job.markAsActive();
        return job;
      }
      return null;
    } catch (error) {
      console.error('❌ Failed to mark job as active:', error.message);
      return null;
    }
  }

  // Mark job as completed
  async markJobAsCompleted(jobId, result = null) {
    try {
      const job = await MessageJob.findByPk(jobId);
      if (job) {
        await job.markAsCompleted(result);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Failed to mark job as completed:', error.message);
      return false;
    }
  }

  // Mark job as failed
  async markJobAsFailed(jobId, error = null) {
    try {
      const job = await MessageJob.findByPk(jobId);
      if (job) {
        if (job.canRetry()) {
          await job.incrementAttempts(error);
        } else {
          await job.markAsFailed(error);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Failed to mark job as failed:', error.message);
      return false;
    }
  }

  // Update job progress
  async updateJobProgress(jobId, progress) {
    try {
      const job = await MessageJob.findByPk(jobId);
      if (job) {
        await job.updateProgress(progress);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Failed to update job progress:', error.message);
      return false;
    }
  }

  // Check for stalled jobs and mark them for retry
  async handleStalledJobs(stalledTimeout = 300000) { // 5 minutes
    try {
      const stalledCutoff = new Date(Date.now() - stalledTimeout);
      
      const stalledJobs = await MessageJob.findAll({
        where: {
          status: 'active',
          processedAt: {
            [Op.lt]: stalledCutoff
          }
        }
      });

      for (const job of stalledJobs) {
        console.log(`⚠️ Detected stalled job: ${job.id}`);
        job.stalledAt = new Date();
        
        if (job.canRetry()) {
          await job.incrementAttempts('Job stalled - timeout exceeded');
          console.log(`🔄 Stalled job ${job.id} marked for retry`);
        } else {
          await job.markAsFailed('Job stalled - max attempts exceeded');
          console.log(`❌ Stalled job ${job.id} marked as failed`);
        }
      }

      return stalledJobs.length;
    } catch (error) {
      console.error('❌ Failed to handle stalled jobs:', error.message);
      return 0;
    }
  }
}

module.exports = SQLiteMessageQueue;