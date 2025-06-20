const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MessageJob = sequelize.define('MessageJob', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  messageId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    index: true
  },
  chatId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  formattedNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    index: true
  },
  originalNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  priority: {
    type: DataTypes.ENUM('HIGH', 'NORMAL', 'LOW'),
    defaultValue: 'NORMAL',
    index: true
  },
  status: {
    type: DataTypes.ENUM('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
    defaultValue: 'waiting',
    index: true
  },
  attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  maxAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 5
  },
  nextRetry: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    index: true
  },
  delay: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  progress: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 100
    }
  },
  result: {
    type: DataTypes.JSON,
    allowNull: true
  },
  failedReason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  lastError: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  failedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  stalledAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'message_jobs',
  indexes: [
    {
      fields: ['status', 'nextRetry']
    },
    {
      fields: ['priority', 'createdAt']
    },
    {
      fields: ['attempts', 'maxAttempts']
    },
    {
      fields: ['formattedNumber', 'status']
    }
  ]
});

// Instance methods
MessageJob.prototype.canRetry = function() {
  return this.attempts < this.maxAttempts && 
         this.status !== 'completed' && 
         this.status !== 'failed';
};

MessageJob.prototype.markAsActive = async function() {
  this.status = 'active';
  this.processedAt = new Date();
  await this.save();
};

MessageJob.prototype.markAsCompleted = async function(result = null) {
  this.status = 'completed';
  this.progress = 100;
  this.completedAt = new Date();
  this.result = result;
  await this.save();
};

MessageJob.prototype.markAsFailed = async function(error = null) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.failedReason = error;
  this.lastError = error;
  await this.save();
};

MessageJob.prototype.incrementAttempts = async function(error = null) {
  this.attempts += 1;
  this.lastError = error;
  
  if (this.attempts >= this.maxAttempts) {
    await this.markAsFailed(error);
  } else {
    // Calculate exponential backoff
    const baseDelay = 2000; // 2 seconds
    const maxDelay = 300000; // 5 minutes
    const delay = Math.min(baseDelay * Math.pow(2, this.attempts - 1), maxDelay);
    
    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    const finalDelay = Math.max(1000, delay + jitter);
    
    this.nextRetry = new Date(Date.now() + finalDelay);
    this.status = 'waiting';
    await this.save();
  }
};

MessageJob.prototype.updateProgress = async function(progress) {
  this.progress = Math.max(0, Math.min(100, progress));
  await this.save();
};

// Static methods
MessageJob.getJobsForProcessing = async function(limit = 10) {
  return await MessageJob.findAll({
    where: {
      status: 'waiting',
      nextRetry: {
        [sequelize.Sequelize.Op.lte]: new Date()
      }
    },
    order: [
      ['priority', 'DESC'],
      ['createdAt', 'ASC']
    ],
    limit: limit
  });
};

MessageJob.getStats = async function() {
  const stats = await MessageJob.findAll({
    attributes: [
      'status',
      [sequelize.fn('COUNT', '*'), 'count']
    ],
    group: ['status'],
    raw: true
  });

  const result = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    paused: 0,
    total: 0
  };

  stats.forEach(stat => {
    result[stat.status] = parseInt(stat.count);
    result.total += parseInt(stat.count);
  });

  return result;
};

MessageJob.cleanOldJobs = async function(olderThanHours = 24) {
  const cutoffDate = new Date(Date.now() - (olderThanHours * 60 * 60 * 1000));
  
  const deletedCompleted = await MessageJob.destroy({
    where: {
      status: 'completed',
      completedAt: {
        [sequelize.Sequelize.Op.lt]: cutoffDate
      }
    }
  });

  const deletedFailed = await MessageJob.destroy({
    where: {
      status: 'failed',
      failedAt: {
        [sequelize.Sequelize.Op.lt]: cutoffDate
      }
    }
  });

  return deletedCompleted + deletedFailed;
};

MessageJob.pauseAll = async function() {
  return await MessageJob.update(
    { status: 'paused' },
    { 
      where: { 
        status: { [sequelize.Sequelize.Op.in]: ['waiting', 'delayed'] }
      } 
    }
  );
};

MessageJob.resumeAll = async function() {
  return await MessageJob.update(
    { status: 'waiting' },
    { where: { status: 'paused' } }
  );
};

MessageJob.clearAll = async function() {
  return await MessageJob.destroy({
    where: {
      status: { [sequelize.Sequelize.Op.ne]: 'active' }
    }
  });
};

module.exports = MessageJob;