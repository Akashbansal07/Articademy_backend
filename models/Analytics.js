const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    index: true
  },
  websiteVisits: {
    type: Number,
    default: 0
  },
  uniqueVisitors: [{
    ip: String,
    userAgent: String,
    timestamp: Date
  }],
  jobViews: [{
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true
    },
    count: {
      type: Number,
      default: 0
    }
  }],
  jobClicks: [{
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true
    },
    count: {
      type: Number,
      default: 0
    }
  }],
  topSearchKeywords: [{
    keyword: String,
    count: Number
  }],
  topCompanies: [{
    company: String,
    views: Number,
    clicks: Number
  }],
  deviceInfo: {
    desktop: { type: Number, default: 0 },
    mobile: { type: Number, default: 0 },
    tablet: { type: Number, default: 0 }
  },
  browserInfo: {
    chrome: { type: Number, default: 0 },
    firefox: { type: Number, default: 0 },
    safari: { type: Number, default: 0 },
    edge: { type: Number, default: 0 },
    others: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Compound index for better query performance
analyticsSchema.index({ date: 1, 'jobViews.jobId': 1 });
analyticsSchema.index({ date: 1, 'jobClicks.jobId': 1 });

// Static method to record website visit
analyticsSchema.statics.recordWebsiteVisit = async function(req) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || '';
  
  let analytics = await this.findOne({ date: today });
  
  if (!analytics) {
    analytics = new this({ date: today });
  }
  
  // Check if this is a unique visitor
  const existingVisitor = analytics.uniqueVisitors.find(
    visitor => visitor.ip === ip && visitor.userAgent === userAgent
  );
  
  if (!existingVisitor) {
    analytics.uniqueVisitors.push({
      ip,
      userAgent,
      timestamp: new Date()
    });
  }
  
  analytics.websiteVisits += 1;
  
  // Update device info
  if (userAgent.includes('Mobile')) {
    analytics.deviceInfo.mobile += 1;
  } else if (userAgent.includes('Tablet')) {
    analytics.deviceInfo.tablet += 1;
  } else {
    analytics.deviceInfo.desktop += 1;
  }
  
  // Update browser info
  if (userAgent.includes('Chrome')) {
    analytics.browserInfo.chrome += 1;
  } else if (userAgent.includes('Firefox')) {
    analytics.browserInfo.firefox += 1;
  } else if (userAgent.includes('Safari')) {
    analytics.browserInfo.safari += 1;
  } else if (userAgent.includes('Edge')) {
    analytics.browserInfo.edge += 1;
  } else {
    analytics.browserInfo.others += 1;
  }
  
  return analytics.save();
};

// Static method to record job view
analyticsSchema.statics.recordJobView = async function(jobId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let analytics = await this.findOne({ date: today });
  
  if (!analytics) {
    analytics = new this({ date: today });
  }
  
  const existingJobView = analytics.jobViews.find(
    view => view.jobId.toString() === jobId.toString()
  );
  
  if (existingJobView) {
    existingJobView.count += 1;
  } else {
    analytics.jobViews.push({ jobId, count: 1 });
  }
  
  return analytics.save();
};

// Static method to record job click
analyticsSchema.statics.recordJobClick = async function(jobId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let analytics = await this.findOne({ date: today });
  
  if (!analytics) {
    analytics = new this({ date: today });
  }
  
  const existingJobClick = analytics.jobClicks.find(
    click => click.jobId.toString() === jobId.toString()
  );
  
  if (existingJobClick) {
    existingJobClick.count += 1;
  } else {
    analytics.jobClicks.push({ jobId, count: 1 });
  }
  
  return analytics.save();
};

// Static method to get analytics for date range with proper population
analyticsSchema.statics.getAnalyticsForDateRange = async function(startDate, endDate) {
  return this.find({
    date: {
      $gte: startDate,
      $lte: endDate
    }
  })
  .populate({
    path: 'jobViews.jobId',
    select: 'companyName role location datePosted status',
    match: { status: { $ne: null } } // Only populate jobs that still exist
  })
  .populate({
    path: 'jobClicks.jobId',
    select: 'companyName role location datePosted status',
    match: { status: { $ne: null } } // Only populate jobs that still exist
  })
  .lean(); // Use lean for better performance
};

// Static method to get dashboard analytics
analyticsSchema.statics.getDashboardAnalytics = async function(days = 7) {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  
  const analytics = await this.getAnalyticsForDateRange(startDate, endDate);
  
  // Calculate totals
  const totalVisits = analytics.reduce((sum, day) => sum + day.websiteVisits, 0);
  const totalUniqueVisitors = analytics.reduce((sum, day) => sum + day.uniqueVisitors.length, 0);
  const totalJobViews = analytics.reduce((sum, day) => 
    sum + day.jobViews.reduce((viewSum, view) => viewSum + view.count, 0), 0
  );
  const totalJobClicks = analytics.reduce((sum, day) => 
    sum + day.jobClicks.reduce((clickSum, click) => clickSum + click.count, 0), 0
  );
  
  return {
    totalVisits,
    totalUniqueVisitors,
    totalJobViews,
    totalJobClicks,
    dailyAnalytics: analytics,
    conversionRate: totalJobViews > 0 ? (totalJobClicks / totalJobViews * 100).toFixed(2) : 0
  };
};

module.exports = mongoose.model('Analytics', analyticsSchema);