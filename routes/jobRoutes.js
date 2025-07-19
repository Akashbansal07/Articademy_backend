const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Job = require('../models/Job');
const Analytics = require('../models/Analytics');
const { authenticateAdmin, requirePermission } = require('../middleware/auth');

// Middleware to track analytics for public routes
const trackAnalytics = async (req, res, next) => {
  try {
    await Analytics.recordWebsiteVisit(req);
    next();
  } catch (error) {
    console.error('Analytics tracking error:', error);
    next(); // Continue even if analytics fails
  }
};

// Helper function to check for duplicate hiring link
const checkDuplicateHiringLink = async (hiringLink, excludeJobId = null) => {
  const query = {
    hiringLink: hiringLink,
    status: 'active'
  };
  
  if (excludeJobId) {
    query._id = { $ne: excludeJobId };
  }
  
  const existingJob = await Job.findOne(query).select('companyName role location datePosted');
  return existingJob;
};

// GET /api/jobs - Get all active jobs with filters (Public)
router.get('/', trackAnalytics, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      role,
      location,
      experience,
      keywords,
      skills,
      sortBy = 'datePosted',
      sortOrder = 'desc'
    } = req.query;
    
    const filters = {};
    
    if (role) filters.role = role;
    if (location) filters.location = location;
    if (experience) filters.experience = experience;
    if (keywords) filters.keywords = keywords.split(',');
    if (skills) filters.skills = skills.split(',');
    
    // Public API only shows active jobs
    const jobs = await Job.getFilteredJobs(
      filters,
      parseInt(page),
      parseInt(limit),
      false // Don't include non-active jobs
    );
    
    const totalJobs = await Job.countDocuments({ status: 'active', isActive: true, ...filters });
    const totalPages = Math.ceil(totalJobs / limit);
    
    res.json({
      jobs,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalJobs,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ message: 'Error fetching jobs' });
  }
});

// GET /api/jobs/filters/options - Get filter options (Public)
router.get('/filters/options', async (req, res) => {
  try {
    const [roles, locations, companies] = await Promise.all([
      Job.distinct('role', { status: 'active', isActive: true }),
      Job.distinct('location', { status: 'active', isActive: true }),
      Job.distinct('companyName', { status: 'active', isActive: true })
    ]);
    
    const experienceOptions = ['0-1', '1-2', '2-3', '3+', '4+', '5+', '6+', 'intern', '2026 passout', '2025 passout', '2027 passout'];
    const employmentTypes = ['Full-Time', 'Part-Time', 'Contract', 'Internship', 'Freelance'];
    
    res.json({
      roles: roles.sort(),
      locations: locations.sort(),
      companies: companies.sort(),
      experienceOptions,
      employmentTypes
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ message: 'Error fetching filter options' });
  }
});

// GET /api/jobs/check-duplicate - Check for duplicate hiring link (Admin only)
router.post('/check-duplicate', authenticateAdmin, async (req, res) => {
  try {
    const { hiringLink, excludeJobId } = req.body;
    
    if (!hiringLink) {
      return res.status(400).json({ message: 'Hiring link is required' });
    }
    
    const existingJob = await checkDuplicateHiringLink(hiringLink, excludeJobId);
    
    if (existingJob) {
      res.json({
        isDuplicate: true,
        existingJob: {
          _id: existingJob._id,
          companyName: existingJob.companyName,
          role: existingJob.role,
          location: existingJob.location,
          datePosted: existingJob.datePosted
        }
      });
    } else {
      res.json({ isDuplicate: false });
    }
  } catch (error) {
    console.error('Error checking duplicate:', error);
    res.status(500).json({ message: 'Error checking duplicate hiring link' });
  }
});

// GET /api/jobs/admin/all - Get all jobs for admin with status filter (Admin only)
router.get('/admin/all', authenticateAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = 'all',
      sortBy = 'lastStatusChange',
      sortOrder = 'desc'
    } = req.query;
    
    const query = status === 'all' ? {} : { status };
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    
    const jobs = await Job.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'username email');
    
    const totalJobs = await Job.countDocuments(query);
    const totalPages = Math.ceil(totalJobs / limit);
    
    // Get status counts
    const statusCounts = await Job.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const counts = {
      active: 0,
      dump: 0,
      inactive: 0,
      total: totalJobs
    };
    
    statusCounts.forEach(item => {
      counts[item._id] = item.count;
    });
    
    res.json({
      jobs,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalJobs,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      statusCounts: counts
    });
  } catch (error) {
    console.error('Error fetching admin jobs:', error);
    res.status(500).json({ message: 'Error fetching jobs' });
  }
});

// GET /api/jobs/admin/dump - Get dump jobs for admin (Admin only)
router.get('/admin/dump', authenticateAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20
    } = req.query;
    
    const jobs = await Job.getJobsByStatus('dump', parseInt(page), parseInt(limit));
    const totalJobs = await Job.countDocuments({ status: 'dump' });
    const totalPages = Math.ceil(totalJobs / limit);
    
    res.json({
      jobs,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalJobs,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching dump jobs:', error);
    res.status(500).json({ message: 'Error fetching dump jobs' });
  }
});

// PUT /api/jobs/:id/status - Update job status (Admin only)
router.put('/:id/status', authenticateAdmin, requirePermission('canCreateJobs'), async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['active', 'dump', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be active, dump, or inactive' });
    }
    
    const job = await Job.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    // Handle status changes
    if (status === 'active') {
      await job.reactivate();
    } else if (status === 'dump') {
      await job.moveToDump();
    } else if (status === 'inactive') {
      await job.moveToInactive();
    }
    
    await job.populate('createdBy', 'username email');
    
    res.json({ 
      message: `Job status updated to ${status}`,
      job 
    });
  } catch (error) {
    console.error('Error updating job status:', error);
    res.status(500).json({ message: 'Error updating job status' });
  }
});

// POST /api/jobs/admin/process-status-changes - Manually trigger status changes (Admin only)
router.post('/admin/process-status-changes', authenticateAdmin, requirePermission('canCreateJobs'), async (req, res) => {
  try {
    const result = await Job.processStatusChanges();
    
    res.json({
      message: 'Status changes processed successfully',
      result
    });
  } catch (error) {
    console.error('Error processing status changes:', error);
    res.status(500).json({ message: 'Error processing status changes' });
  }
});

// GET /api/jobs/:id - Get single job (Public - only active jobs)
router.get('/:id', trackAnalytics, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).populate('createdBy', 'username');
    
    if (!job || job.status !== 'active' || !job.isActive) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    // Record job view
    await job.incrementViews();
    await Analytics.recordJobView(job._id);
    
    res.json(job);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ message: 'Error fetching job' });
  }
});

// POST /api/jobs/:id/click - Track job click (Public)
router.post('/:id/click', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    
    if (!job || job.status !== 'active' || !job.isActive) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    // Record job click
    await job.incrementClicks();
    await Analytics.recordJobClick(job._id);
    
    res.json({ message: 'Click recorded', hiringLink: job.hiringLink });
  } catch (error) {
    console.error('Error recording click:', error);
    res.status(500).json({ message: 'Error recording click' });
  }
});

// POST /api/jobs - Create new job (Admin only)
router.post('/', authenticateAdmin, requirePermission('canCreateJobs'), async (req, res) => {
  try {
    const jobData = {
      ...req.body,
      jobId: uuidv4(),
      createdBy: req.admin._id,
      status: 'active' // New jobs start as active
    };
    
    // Validate required fields
    const requiredFields = ['companyName', 'role', 'location', 'experience', 'description', 'requiredDegree', 'hiringLink'];
    for (const field of requiredFields) {
      if (!jobData[field]) {
        return res.status(400).json({ message: `${field} is required` });
      }
    }
    
    // Check for duplicate hiring link in active jobs
    const existingJob = await checkDuplicateHiringLink(jobData.hiringLink);
    if (existingJob) {
      return res.status(400).json({ 
        message: 'A job with this hiring link already exists in active jobs',
        existingJob: {
          _id: existingJob._id,
          companyName: existingJob.companyName,
          role: existingJob.role,
          location: existingJob.location,
          datePosted: existingJob.datePosted
        }
      });
    }
    
    const job = new Job(jobData);
    await job.save();
    
    await job.populate('createdBy', 'username email');
    
    res.status(201).json({ message: 'Job created successfully', job });
  } catch (error) {
    console.error('Error creating job:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation error', errors });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Job with this ID already exists' });
    }
    
    res.status(500).json({ message: 'Error creating job' });
  }
});

// POST /api/jobs/bulk - Create jobs from JSON (Admin only)
router.post('/bulk', authenticateAdmin, requirePermission('canCreateJobs'), async (req, res) => {
  try {
    const { jobs } = req.body;
    
    if (!Array.isArray(jobs)) {
      return res.status(400).json({ message: 'Jobs must be an array' });
    }
    
    const createdJobs = [];
    const errors = [];
    const duplicates = [];
    
    for (let i = 0; i < jobs.length; i++) {
      try {
        // Check for duplicate hiring link
        const existingJob = await checkDuplicateHiringLink(jobs[i].hiringLink);
        if (existingJob) {
          duplicates.push({
            index: i,
            jobData: jobs[i],
            existingJob: {
              _id: existingJob._id,
              companyName: existingJob.companyName,
              role: existingJob.role,
              location: existingJob.location,
              datePosted: existingJob.datePosted
            }
          });
          continue; // Skip this job
        }
        
        const jobData = {
          ...jobs[i],
          jobId: jobs[i].jobId || uuidv4(),
          createdBy: req.admin._id,
          status: 'active'
        };
        
        const job = new Job(jobData);
        await job.save();
        await job.populate('createdBy', 'username email');
        createdJobs.push(job);
      } catch (error) {
        errors.push({ index: i, error: error.message });
      }
    }
    
    const response = {
      message: `${createdJobs.length} jobs created successfully`,
      createdJobs,
      summary: {
        total: jobs.length,
        created: createdJobs.length,
        duplicates: duplicates.length,
        errors: errors.length
      }
    };
    
    if (duplicates.length > 0) {
      response.duplicates = duplicates;
    }
    
    if (errors.length > 0) {
      response.errors = errors;
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error creating bulk jobs:', error);
    res.status(500).json({ message: 'Error creating jobs' });
  }
});

// PUT /api/jobs/:id - Update job (Admin only)
router.put('/:id', authenticateAdmin, requirePermission('canCreateJobs'), async (req, res) => {
  try {
    // If hiring link is being updated, check for duplicates
    if (req.body.hiringLink) {
      const existingJob = await checkDuplicateHiringLink(req.body.hiringLink, req.params.id);
      if (existingJob) {
        return res.status(400).json({ 
          message: 'A job with this hiring link already exists in active jobs',
          existingJob: {
            _id: existingJob._id,
            companyName: existingJob.companyName,
            role: existingJob.role,
            location: existingJob.location,
            datePosted: existingJob.datePosted
          }
        });
      }
    }
    
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('createdBy', 'username email');
    
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    res.json({ message: 'Job updated successfully', job });
  } catch (error) {
    console.error('Error updating job:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation error', errors });
    }
    
    res.status(500).json({ message: 'Error updating job' });
  }
});

// DELETE /api/jobs/:id - Delete job (Admin only)
router.delete('/:id', authenticateAdmin, requirePermission('canDeleteJobs'), async (req, res) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ message: 'Error deleting job' });
  }
});

module.exports = router;