const express = require('express');
const router = express.Router();
const Analytics = require('../models/Analytics');
const Job = require('../models/Job');
const { authenticateAdmin, requirePermission } = require('../middleware/auth');

// GET /api/analytics/dashboard - Get dashboard analytics
router.get('/dashboard', authenticateAdmin, requirePermission('canViewAnalytics'), async (req, res) => {
  try {
    const { days = 7 } = req.query;
    
    const analytics = await Analytics.getDashboardAnalytics(parseInt(days));
    
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching dashboard analytics:', error);
    res.status(500).json({ message: 'Error fetching dashboard analytics' });
  }
});

// GET /api/analytics/jobs - Get job analytics
router.get('/jobs', authenticateAdmin, requirePermission('canViewAnalytics'), async (req, res) => {
  try {
    const { days = 7, limit = 10 } = req.query;
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Get analytics for the date range
    const analytics = await Analytics.getAnalyticsForDateRange(startDate, endDate);
    
    // Aggregate job views and clicks
    const jobStats = {};
    
    analytics.forEach(dayAnalytics => {
      dayAnalytics.jobViews.forEach(jobView => {
        if (jobView.jobId && jobView.jobId._id) {
          const jobId = jobView.jobId._id.toString();
          if (!jobStats[jobId]) {
            jobStats[jobId] = {
              jobId: jobView.jobId._id,
              companyName: jobView.jobId.companyName || 'Unknown Company',
              role: jobView.jobId.role || 'Unknown Role',
              views: 0,
              clicks: 0
            };
          }
          jobStats[jobId].views += jobView.count;
        }
      });
      
      dayAnalytics.jobClicks.forEach(jobClick => {
        if (jobClick.jobId && jobClick.jobId._id) {
          const jobId = jobClick.jobId._id.toString();
          if (!jobStats[jobId]) {
            jobStats[jobId] = {
              jobId: jobClick.jobId._id,
              companyName: jobClick.jobId.companyName || 'Unknown Company',
              role: jobClick.jobId.role || 'Unknown Role',
              views: 0,
              clicks: 0
            };
          }
          jobStats[jobId].clicks += jobClick.count;
        }
      });
    });
    
    // Convert to array and sort by views
    const jobAnalytics = Object.values(jobStats)
      .map(job => ({
        ...job,
        conversionRate: job.views > 0 ? (job.clicks / job.views * 100).toFixed(2) : 0
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, parseInt(limit));
    
    res.json(jobAnalytics);
  } catch (error) {
    console.error('Error fetching job analytics:', error);
    res.status(500).json({ message: 'Error fetching job analytics' });
  }
});

// GET /api/analytics/jobs/:id - Get specific job analytics
router.get('/jobs/:id', authenticateAdmin, requirePermission('canViewAnalytics'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const analytics = await Analytics.getAnalyticsForDateRange(startDate, endDate);
    
    const dailyStats = analytics.map(dayAnalytics => {
      const jobView = dayAnalytics.jobViews.find(view => 
        view.jobId && view.jobId._id && view.jobId._id.toString() === req.params.id
      );
      const jobClick = dayAnalytics.jobClicks.find(click => 
        click.jobId && click.jobId._id && click.jobId._id.toString() === req.params.id
      );
      
      return {
        date: dayAnalytics.date,
        views: jobView ? jobView.count : 0,
        clicks: jobClick ? jobClick.count : 0
      };
    });
    
    const totalViews = dailyStats.reduce((sum, day) => sum + day.views, 0);
    const totalClicks = dailyStats.reduce((sum, day) => sum + day.clicks, 0);
    
    res.json({
      job: {
        id: job._id,
        companyName: job.companyName,
        role: job.role,
        location: job.location,
        datePosted: job.datePosted
      },
      analytics: {
        totalViews,
        totalClicks,
        conversionRate: totalViews > 0 ? (totalClicks / totalViews * 100).toFixed(2) : 0,
        dailyStats
      }
    });
  } catch (error) {
    console.error('Error fetching job analytics:', error);
    res.status(500).json({ message: 'Error fetching job analytics' });
  }
});

// GET /api/analytics/companies - Get company analytics
router.get('/companies', authenticateAdmin, requirePermission('canViewAnalytics'), async (req, res) => {
  try {
    const { days = 7, limit = 10 } = req.query;
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const analytics = await Analytics.getAnalyticsForDateRange(startDate, endDate);
    
    const companyStats = {};
    
    analytics.forEach(dayAnalytics => {
      dayAnalytics.jobViews.forEach(jobView => {
        if (jobView.jobId && jobView.jobId.companyName) {
          const company = jobView.jobId.companyName;
          if (!companyStats[company]) {
            companyStats[company] = { views: 0, clicks: 0 };
          }
          companyStats[company].views += jobView.count;
        }
      });
      
      dayAnalytics.jobClicks.forEach(jobClick => {
        if (jobClick.jobId && jobClick.jobId.companyName) {
          const company = jobClick.jobId.companyName;
          if (!companyStats[company]) {
            companyStats[company] = { views: 0, clicks: 0 };
          }
          companyStats[company].clicks += jobClick.count;
        }
      });
    });
    
    const companyAnalytics = Object.entries(companyStats)
      .map(([company, stats]) => ({
        company,
        views: stats.views,
        clicks: stats.clicks,
        conversionRate: stats.views > 0 ? (stats.clicks / stats.views * 100).toFixed(2) : 0
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, parseInt(limit));
    
    res.json(companyAnalytics);
  } catch (error) {
    console.error('Error fetching company analytics:', error);
    res.status(500).json({ message: 'Error fetching company analytics' });
  }
});

// GET /api/analytics/trends - Get trending data
router.get('/trends', authenticateAdmin, requirePermission('canViewAnalytics'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const analytics = await Analytics.getAnalyticsForDateRange(startDate, endDate);
    
    const trends = analytics.map(dayAnalytics => ({
      date: dayAnalytics.date,
      websiteVisits: dayAnalytics.websiteVisits,
      uniqueVisitors: dayAnalytics.uniqueVisitors.length,
      totalJobViews: dayAnalytics.jobViews.reduce((sum, view) => sum + view.count, 0),
      totalJobClicks: dayAnalytics.jobClicks.reduce((sum, click) => sum + click.count, 0),
      deviceInfo: dayAnalytics.deviceInfo,
      browserInfo: dayAnalytics.browserInfo
    }));
    
    // Calculate growth rates
    const totalVisits = trends.reduce((sum, day) => sum + day.websiteVisits, 0);
    const totalUniqueVisitors = trends.reduce((sum, day) => sum + day.uniqueVisitors, 0);
    const totalJobViews = trends.reduce((sum, day) => sum + day.totalJobViews, 0);
    const totalJobClicks = trends.reduce((sum, day) => sum + day.totalJobClicks, 0);
    
    // Calculate averages
    const avgDailyVisits = trends.length > 0 ? totalVisits / trends.length : 0;
    const avgDailyUniqueVisitors = trends.length > 0 ? totalUniqueVisitors / trends.length : 0;
    const avgDailyJobViews = trends.length > 0 ? totalJobViews / trends.length : 0;
    const avgDailyJobClicks = trends.length > 0 ? totalJobClicks / trends.length : 0;
    
    res.json({
      trends,
      summary: {
        totalVisits,
        totalUniqueVisitors,
        totalJobViews,
        totalJobClicks,
        avgDailyVisits: Math.round(avgDailyVisits),
        avgDailyUniqueVisitors: Math.round(avgDailyUniqueVisitors),
        avgDailyJobViews: Math.round(avgDailyJobViews),
        avgDailyJobClicks: Math.round(avgDailyJobClicks),
        conversionRate: totalJobViews > 0 ? (totalJobClicks / totalJobViews * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ message: 'Error fetching trends' });
  }
});

// GET /api/analytics/export - Export analytics data
router.get('/export', authenticateAdmin, requirePermission('canViewAnalytics'), async (req, res) => {
  try {
    const { days = 30, format = 'json' } = req.query;
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const analytics = await Analytics.getAnalyticsForDateRange(startDate, endDate);
    
    const exportData = {
      dateRange: {
        start: startDate,
        end: endDate
      },
      analytics: analytics.map(dayAnalytics => ({
        date: dayAnalytics.date,
        websiteVisits: dayAnalytics.websiteVisits,
        uniqueVisitors: dayAnalytics.uniqueVisitors.length,
        jobViews: dayAnalytics.jobViews.map(view => ({
          jobId: view.jobId ? view.jobId._id : null,
          companyName: view.jobId ? view.jobId.companyName : 'Unknown',
          role: view.jobId ? view.jobId.role : 'Unknown',
          views: view.count
        })),
        jobClicks: dayAnalytics.jobClicks.map(click => ({
          jobId: click.jobId ? click.jobId._id : null,
          companyName: click.jobId ? click.jobId.companyName : 'Unknown',
          role: click.jobId ? click.jobId.role : 'Unknown',
          clicks: click.count
        })),
        deviceInfo: dayAnalytics.deviceInfo,
        browserInfo: dayAnalytics.browserInfo
      }))
    };
    
    if (format === 'csv') {
      // Convert to CSV format
      const csvData = analytics.map(day => ({
        date: day.date.toISOString().split('T')[0],
        websiteVisits: day.websiteVisits,
        uniqueVisitors: day.uniqueVisitors.length,
        totalJobViews: day.jobViews.reduce((sum, view) => sum + view.count, 0),
        totalJobClicks: day.jobClicks.reduce((sum, click) => sum + click.count, 0),
        desktopUsers: day.deviceInfo.desktop,
        mobileUsers: day.deviceInfo.mobile,
        tabletUsers: day.deviceInfo.tablet
      }));
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv');
      
      const csv = [
        Object.keys(csvData[0]).join(','),
        ...csvData.map(row => Object.values(row).join(','))
      ].join('\n');
      
      res.send(csv);
    } else {
      res.json(exportData);
    }
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({ message: 'Error exporting analytics' });
  }
});

module.exports = router;