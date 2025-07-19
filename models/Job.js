const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  companyName: {
    type: String,
    required: true,
    trim: true
  },
  companyLogo: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  location: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  experience: {
    type: String,
    required: true,
    enum: ['0-1', '1-2', '2-3', '3+', '4+', '5+', '6+', 'intern', '2026 passout', '2025 passout', '2027 passout'],
    index: true
  },
  description: {
    type: String,
    required: true
  },
  requiredDegree: {
    type: String,
    required: true
  },
  employmentType: {
    type: String,
    required: true,
    enum: ['Full-Time', 'Part-Time', 'Contract', 'Internship', 'Freelance'],
    default: 'Full-Time'
  },
  hiringLink: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Please enter a valid URL'
    }
  },
  estPackage: {
    type: String,
    default: ''
  },
  skills: {
    languages: [{
      type: String,
      trim: true
    }],
    technologies: [{
      type: String,
      trim: true
    }],
    frameworks: [{
      type: String,
      trim: true
    }],
    databases: [{
      type: String,
      trim: true
    }],
    tools: [{
      type: String,
      trim: true
    }],
    others: [{
      type: String,
      trim: true
    }]
  },
  keywords: [{
    type: String,
    trim: true
  }],
  datePosted: {
    type: Date,
    default: Date.now,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'dump', 'inactive'],
    default: 'active',
    index: true
  },
  movedToDumpAt: {
    type: Date,
    default: null
  },
  lastStatusChange: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    },
    lastViewedAt: {
      type: Date
    },
    lastClickedAt: {
      type: Date
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
jobSchema.index({ role: 1, location: 1, experience: 1 });
jobSchema.index({ keywords: 1 });
jobSchema.index({ datePosted: -1 });
jobSchema.index({ status: 1, datePosted: -1 });
jobSchema.index({ status: 1, movedToDumpAt: 1 });

// Virtual for formatted date
jobSchema.virtual('formattedDate').get(function() {
  return this.datePosted.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
});

// Virtual to check if job should be moved to dump (7 days old)
jobSchema.virtual('shouldMoveToDump').get(function() {
  if (this.status !== 'active') return false;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return this.datePosted < sevenDaysAgo;
});

// Virtual to check if job should be moved to inactive (30 days in dump)
jobSchema.virtual('shouldMoveToInactive').get(function() {
  if (this.status !== 'dump' || !this.movedToDumpAt) return false;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return this.movedToDumpAt < thirtyDaysAgo;
});

// Method to increment views
jobSchema.methods.incrementViews = function() {
  this.analytics.views += 1;
  this.analytics.lastViewedAt = new Date();
  return this.save();
};

// Method to increment clicks
jobSchema.methods.incrementClicks = function() {
  this.analytics.clicks += 1;
  this.analytics.lastClickedAt = new Date();
  return this.save();
};

// Method to move job to dump
jobSchema.methods.moveToDump = function() {
  this.status = 'dump';
  this.movedToDumpAt = new Date();
  this.lastStatusChange = new Date();
  return this.save();
};

// Method to move job to inactive
jobSchema.methods.moveToInactive = function() {
  this.status = 'inactive';
  this.isActive = false;
  this.lastStatusChange = new Date();
  return this.save();
};

// Method to reactivate job
jobSchema.methods.reactivate = function() {
  this.status = 'active';
  this.isActive = true;
  this.movedToDumpAt = null;
  this.lastStatusChange = new Date();
  this.datePosted = new Date(); // Reset the posting date
  return this.save();
};

// Static method to get jobs with filters (only active jobs for public)
jobSchema.statics.getFilteredJobs = function(filters, page = 1, limit = 10, includeNonActive = false) {
  const query = includeNonActive ? {} : { status: 'active', isActive: true };
  
  if (filters.role) {
    query.role = { $regex: filters.role, $options: 'i' };
  }
  
  if (filters.location) {
    query.location = { $regex: filters.location, $options: 'i' };
  }
  
  if (filters.experience) {
    query.experience = filters.experience;
  }
  
  if (filters.keywords) {
    query.$or = [
      { keywords: { $in: filters.keywords } },
      { role: { $regex: filters.keywords.join('|'), $options: 'i' } },
      { description: { $regex: filters.keywords.join('|'), $options: 'i' } }
    ];
  }
  
  if (filters.skills) {
    query.$or = [
      { 'skills.languages': { $in: filters.skills } },
      { 'skills.technologies': { $in: filters.skills } },
      { 'skills.frameworks': { $in: filters.skills } },
      { 'skills.databases': { $in: filters.skills } },
      { 'skills.tools': { $in: filters.skills } },
      { 'skills.others': { $in: filters.skills } }
    ];
  }
  
  const skip = (page - 1) * limit;
  
  return this.find(query)
    .sort({ datePosted: -1 })
    .skip(skip)
    .limit(limit)
    .populate('createdBy', 'username email');
};

// Static method to process automatic status changes
jobSchema.statics.processStatusChanges = async function() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  try {
    // Move active jobs older than 7 days to dump
    const jobsToMoveToDump = await this.updateMany(
      {
        status: 'active',
        datePosted: { $lt: sevenDaysAgo }
      },
      {
        $set: {
          status: 'dump',
          movedToDumpAt: new Date(),
          lastStatusChange: new Date()
        }
      }
    );
    
    // Move dump jobs older than 30 days to inactive
    const jobsToMoveToInactive = await this.updateMany(
      {
        status: 'dump',
        movedToDumpAt: { $lt: thirtyDaysAgo }
      },
      {
        $set: {
          status: 'inactive',
          isActive: false,
          lastStatusChange: new Date()
        }
      }
    );
    
    return {
      movedToDump: jobsToMoveToDump.modifiedCount,
      movedToInactive: jobsToMoveToInactive.modifiedCount
    };
  } catch (error) {
    console.error('Error processing status changes:', error);
    throw error;
  }
};

// Static method to get jobs by status for admin
jobSchema.statics.getJobsByStatus = function(status, page = 1, limit = 10) {
  const query = status === 'all' ? {} : { status };
  const skip = (page - 1) * limit;
  
  return this.find(query)
    .sort({ lastStatusChange: -1, datePosted: -1 })
    .skip(skip)
    .limit(limit)
    .populate('createdBy', 'username email');
};

module.exports = mongoose.model('Job', jobSchema);