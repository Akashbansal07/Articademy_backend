// Create this file in your backend folder and run it once to migrate existing jobs
// Run with: node migrateJobs.js

const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined in environment variables');
  console.error('Please set MONGODB_URI in your .env file');
  process.exit(1);
}

async function migrateJobs() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB successfully');

    const Job = require('./models/Job');

    console.log('Starting job migration...');

    // Find all jobs without a status field
    const jobsWithoutStatus = await Job.find({ 
      $or: [
        { status: { $exists: false } },
        { status: null }
      ]
    });

    console.log(`Found ${jobsWithoutStatus.length} jobs without status field`);

    let migratedCount = 0;
    let errorCount = 0;

    for (const job of jobsWithoutStatus) {
      try {
        // Calculate job age
        const jobAge = Math.floor((new Date() - new Date(job.datePosted)) / (1000 * 60 * 60 * 24));
        
        let status = 'active';
        let movedToDumpAt = null;
        
        if (jobAge > 37) {
          // Job is older than 37 days (7 days active + 30 days dump), mark as inactive
          status = 'inactive';
          // Set movedToDumpAt to 30 days after datePosted
          movedToDumpAt = new Date(job.datePosted);
          movedToDumpAt.setDate(movedToDumpAt.getDate() + 7);
        } else if (jobAge > 7) {
          // Job is between 7-37 days old, move to dump
          status = 'dump';
          // Set movedToDumpAt to 7 days after datePosted
          movedToDumpAt = new Date(job.datePosted);
          movedToDumpAt.setDate(movedToDumpAt.getDate() + 7);
        }
        
        // Update the job
        await Job.updateOne(
          { _id: job._id },
          {
            $set: {
              status: status,
              movedToDumpAt: movedToDumpAt,
              lastStatusChange: new Date(),
              isActive: status === 'inactive' ? false : true
            }
          }
        );
        
        migratedCount++;
        console.log(`✅ Migrated job ${job.jobId} - ${job.role} (${job.companyName}) - Status: ${status}`);
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating job ${job._id}:`, error.message);
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total jobs found: ${jobsWithoutStatus.length}`);
    console.log(`Successfully migrated: ${migratedCount}`);
    console.log(`Errors: ${errorCount}`);

    // Get status counts after migration
    const statusCounts = await Job.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    console.log('\n=== Current Status Distribution ===');
    statusCounts.forEach(item => {
      console.log(`${item._id}: ${item.count} jobs`);
    });

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateJobs();