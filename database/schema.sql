CREATE DATABASE IF NOT EXISTS whatsapp_api;
USE whatsapp_api;

-- Table: users
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    refreshToken TEXT NULL,
    refreshTokenExpiresAt DATETIME NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table: message_jobs (for queue system)
CREATE TABLE IF NOT EXISTS message_jobs (
    id VARCHAR(255) PRIMARY KEY,
    messageId VARCHAR(255) NOT NULL UNIQUE,
    chatId VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    formattedNumber VARCHAR(50) NOT NULL,
    originalNumber VARCHAR(50) NOT NULL,
    priority ENUM('HIGH', 'NORMAL', 'LOW') DEFAULT 'NORMAL',
    status ENUM('waiting', 'active', 'completed', 'failed', 'delayed', 'paused') DEFAULT 'waiting',
    attempts INT DEFAULT 0,
    maxAttempts INT DEFAULT 5,
    nextRetry DATETIME DEFAULT CURRENT_TIMESTAMP,
    delay INT DEFAULT 0,
    progress INT DEFAULT 0,
    result JSON NULL,
    failedReason TEXT NULL,
    lastError TEXT NULL,
    processedAt DATETIME NULL,
    completedAt DATETIME NULL,
    failedAt DATETIME NULL,
    stalledAt DATETIME NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_message_jobs_messageId ON message_jobs(messageId);
CREATE INDEX idx_message_jobs_status_nextRetry ON message_jobs(status, nextRetry);
CREATE INDEX idx_message_jobs_priority_created ON message_jobs(priority, createdAt);
CREATE INDEX idx_message_jobs_attempts ON message_jobs(attempts, maxAttempts);
CREATE INDEX idx_message_jobs_number_status ON message_jobs(formattedNumber, status);
