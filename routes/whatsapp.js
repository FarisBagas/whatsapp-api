const express = require('express');
const verifyToken = require('../middleware/auth');
const { getQRCode, getStatus, sendMessage, resetSession, qrString, isReady, getMessageQueue, getQueueProcessor } = require('../controllers/whatsappController');

const router = express.Router();

router.get('/qr', verifyToken, getQRCode);
router.get('/qr-page', verifyToken, (req, res) => {
  if (isReady) {
    return res.send(`
      <html>
        <body style="text-align:center; font-family:Arial;">
          <h2>WhatsApp sudah terhubung!</h2>
          <p>Status: Connected</p>
        </body>
      </html>
    `);
  }
  
  if (!qrString) {
    return res.send(`
      <html>
        <body style="text-align:center; font-family:Arial;">
          <h2>QR Code belum tersedia</h2>
          <p>Mohon tunggu...</p>
          <script>setTimeout(() => location.reload(), 3000);</script>
        </body>
      </html>
    `);
  }
  
  res.send(`
    <html>
      <body style="text-align:center; font-family:Arial; padding:20px;">
        <h2>Scan QR Code dengan WhatsApp</h2>
        <img src="${qrString}" alt="WhatsApp QR Code" style="width:200px; height:200px; border:1px solid #ccc; border-radius:8px;">
        <p>Scan dengan kamera WhatsApp di ponsel Anda</p>
        <script>setTimeout(() => location.reload(), 10000);</script>
      </body>
    </html>
  `);
});
router.get('/status', verifyToken, getStatus);
router.get('/retry-queue', verifyToken, async (req, res) => {
  const messageQueue = getMessageQueue();
  
  if (!messageQueue) {
    return res.json({
      queueSize: 0,
      messages: [],
      stats: { total: 0, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }
    });
  }
  
  try {
    const { status = 'waiting', start = 0, end = 10 } = req.query;
    
    const [jobs, stats] = await Promise.all([
      messageQueue.getJobs(status, parseInt(start), parseInt(end)),
      messageQueue.getStats()
    ]);
    
    // Format jobs for response
    const formattedJobs = jobs.map(job => ({
      jobId: job.id,
      messageId: job.data.messageId,
      number: job.data.formattedNumber,
      message: job.data.message.substring(0, 100) + (job.data.message.length > 100 ? '...' : ''),
      status: status,
      attempts: job.attempts,
      progress: job.progress,
      timestamp: new Date(job.timestamp).toISOString(),
      processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      failedReason: job.failedReason
    }));
    
    res.json({
      queueSize: stats.total,
      waiting: stats.waiting,
      active: stats.active,
      completed: stats.completed,
      failed: stats.failed,
      delayed: stats.delayed,
      messages: formattedJobs,
      stats: stats
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      queueSize: 0,
      messages: []
    });
  }
});

// Queue management endpoints
router.post('/queue/clear', verifyToken, async (req, res) => {
  const messageQueue = getMessageQueue();
  
  if (!messageQueue) {
    return res.json({ success: true, cleared: 0, message: 'No queue to clear' });
  }
  
  try {
    const success = await messageQueue.clearQueue();
    res.json({ 
      success: success, 
      message: success ? 'Queue cleared successfully' : 'Failed to clear queue'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to clear queue',
      error: error.message 
    });
  }
});

router.post('/queue/clean', verifyToken, async (req, res) => {
  const messageQueue = getMessageQueue();
  
  if (!messageQueue) {
    return res.json({ success: true, cleaned: 0, message: 'No queue to clean' });
  }
  
  try {
    const { grace = 24 * 60 * 60 * 1000 } = req.body; // 24 hours default
    const cleaned = await messageQueue.cleanQueue(grace);
    res.json({ 
      success: true, 
      cleaned: cleaned,
      message: `Cleaned ${cleaned} old jobs from queue`
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to clean queue',
      error: error.message 
    });
  }
});

router.post('/queue/pause', verifyToken, async (req, res) => {
  const messageQueue = getMessageQueue();
  
  if (!messageQueue) {
    return res.status(400).json({ 
      success: false, 
      message: 'Queue not initialized' 
    });
  }
  
  try {
    const success = await messageQueue.pauseQueue();
    res.json({ 
      success: success,
      message: success ? 'Queue paused' : 'Failed to pause queue'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to pause queue',
      error: error.message 
    });
  }
});

router.post('/queue/resume', verifyToken, async (req, res) => {
  const messageQueue = getMessageQueue();
  
  if (!messageQueue) {
    return res.status(400).json({ 
      success: false, 
      message: 'Queue not initialized' 
    });
  }
  
  try {
    const success = await messageQueue.resumeQueue();
    res.json({ 
      success: success,
      message: success ? 'Queue resumed' : 'Failed to resume queue'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to resume queue',
      error: error.message 
    });
  }
});

router.post('/queue/retry/:jobId', verifyToken, async (req, res) => {
  const messageQueue = getMessageQueue();
  const { jobId } = req.params;
  
  if (!messageQueue) {
    return res.status(400).json({ 
      success: false, 
      message: 'Queue not initialized' 
    });
  }
  
  try {
    const success = await messageQueue.retryJob(jobId);
    res.json({ 
      success: success,
      message: success ? `Job ${jobId} marked for retry` : `Job ${jobId} not found or cannot be retried`
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retry job',
      error: error.message 
    });
  }
});

router.get('/queue/job/:jobId', verifyToken, async (req, res) => {
  const messageQueue = getMessageQueue();
  const { jobId } = req.params;
  
  if (!messageQueue) {
    return res.status(400).json({ 
      success: false, 
      message: 'Queue not initialized' 
    });
  }
  
  try {
    const job = await messageQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ 
        success: false, 
        message: 'Job not found' 
      });
    }
    
    res.json({ 
      success: true,
      job: job
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get job',
      error: error.message 
    });
  }
});

router.post('/queue/config', verifyToken, async (req, res) => {
  const queueProcessor = getQueueProcessor();
  
  if (!queueProcessor) {
    return res.status(400).json({ 
      success: false, 
      message: 'Queue processor not initialized' 
    });
  }
  
  try {    const { concurrency, processInterval, stalledTimeout } = req.body;
    const config = {};
    
    if (concurrency && concurrency >= 1 && concurrency <= 10) {
      config.maxConcurrent = concurrency;
    }
    
    if (processInterval && processInterval >= 2000) {
      config.processInterval = processInterval;
    }
    
    if (stalledTimeout && stalledTimeout >= 60000) {
      config.stalledTimeout = stalledTimeout;
    }
    
    if (Object.keys(config).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid configuration. concurrency (1-10), processInterval (>=2000ms), stalledTimeout (>=60000ms)'
      });
    }
    
    const success = queueProcessor.updateConfig(config);
    
    res.json({ 
      success: success, 
      message: success ? 'Configuration updated' : 'Failed to update configuration',
      config: config
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update configuration',
      error: error.message 
    });
  }
});
router.post('/send-message', verifyToken, sendMessage);
router.post('/reset-session', verifyToken, resetSession);

module.exports = router;
