const cron = require('node-cron');
const Job = require('../models/Job');

// Function to process job status changes
const processJobStatusChanges = async () => {
  try {
    console.log('🔄 Processing automatic job status changes...');
    
    const result = await Job.processStatusChanges();
    
    console.log(`✅ Status changes completed:
      - Moved to dump: ${result.movedToDump} jobs
      - Moved to inactive: ${result.movedToInactive} jobs`);
  } catch (error) {
    console.error('❌ Error processing job status changes:', error);
  }
};

// Initialize cron job to run every day at midnight
const initializeJobStatusCron = () => {
  // Run every day at 00:00
  cron.schedule('0 0 * * *', processJobStatusChanges, {
    scheduled: true,
    timezone: "UTC" // Change to your preferred timezone
  });
  
  console.log('⏰ Job status cron job initialized - will run daily at midnight');
  
  // Also run once on startup to catch any pending changes
  processJobStatusChanges();
};

module.exports = {
  initializeJobStatusCron,
  processJobStatusChanges
};