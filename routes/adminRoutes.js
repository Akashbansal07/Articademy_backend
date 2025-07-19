const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const { generateToken, authenticateAdmin, requireMainAdmin, requirePermission } = require('../middleware/auth');

// POST /api/admin/login - Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    if (!admin.isActive) {
      return res.status(401).json({ message: 'Account is deactivated' });
    }
    
    const isValidPassword = await admin.comparePassword(password);
    
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Update last login
    await admin.updateLastLogin();
    
    const token = generateToken(admin._id);
    
    res.json({
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    
    if (error.message === 'Account is temporarily locked') {
      return res.status(423).json({ message: 'Account is temporarily locked due to multiple failed login attempts' });
    }
    
    res.status(500).json({ message: 'Login failed' });
  }
});

// POST /api/admin/register - Create new admin (Main admin only)
router.post('/register', authenticateAdmin, requireMainAdmin, async (req, res) => {
  try {
    const { username, email, password, permissions } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }
    
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });
    
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin with this email or username already exists' });
    }
    
    const newAdmin = new Admin({
      username,
      email: email.toLowerCase(),
      password,
      createdBy: req.admin._id,
      permissions: permissions || {
        canCreateJobs: true,
        canDeleteJobs: true,
        canViewAnalytics: true,
        canManageAdmins: false
      }
    });
    
    await newAdmin.save();
    
    const adminResponse = await Admin.findById(newAdmin._id)
      .select('-password')
      .populate('createdBy', 'username email');
    
    res.status(201).json({
      message: 'Admin created successfully',
      admin: adminResponse
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation error', errors });
    }
    
    res.status(500).json({ message: 'Error creating admin' });
  }
});

// GET /api/admin/profile - Get admin profile
router.get('/profile', authenticateAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id)
      .select('-password')
      .populate('createdBy', 'username email');
    
    res.json(admin);
  } catch (error) {
    console.error('Error fetching admin profile:', error);
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// PUT /api/admin/profile - Update admin profile
router.put('/profile', authenticateAdmin, async (req, res) => {
  try {
    const { username, email, currentPassword, newPassword } = req.body;
    
    const admin = await Admin.findById(req.admin._id);
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    
    // Update basic info
    if (username) admin.username = username;
    if (email) admin.email = email.toLowerCase();
    
    // Update password if provided
    if (currentPassword && newPassword) {
      const isValidPassword = await admin.comparePassword(currentPassword);
      
      if (!isValidPassword) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters long' });
      }
      
      admin.password = newPassword;
    }
    
    await admin.save();
    
    const updatedAdmin = await Admin.findById(admin._id)
      .select('-password')
      .populate('createdBy', 'username email');
    
    res.json({
      message: 'Profile updated successfully',
      admin: updatedAdmin
    });
  } catch (error) {
    console.error('Error updating admin profile:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation error', errors });
    }
    
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// GET /api/admin/all - Get all admins (Main admin only)
router.get('/all', authenticateAdmin, requireMainAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    
    const admins = await Admin.find()
      .select('-password')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'username email');
    
    const totalAdmins = await Admin.countDocuments();
    const totalPages = Math.ceil(totalAdmins / limit);
    
    res.json({
      admins,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalAdmins,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ message: 'Error fetching admins' });
  }
});

// PUT /api/admin/:id/permissions - Update admin permissions (Main admin only)
router.put('/:id/permissions', authenticateAdmin, requireMainAdmin, async (req, res) => {
  try {
    const { permissions } = req.body;
    
    if (!permissions) {
      return res.status(400).json({ message: 'Permissions are required' });
    }
    
    const admin = await Admin.findById(req.params.id);
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    
    if (admin.role === 'main_admin') {
      return res.status(400).json({ message: 'Cannot modify main admin permissions' });
    }
    
    admin.permissions = { ...admin.permissions, ...permissions };
    await admin.save();
    
    const updatedAdmin = await Admin.findById(admin._id)
      .select('-password')
      .populate('createdBy', 'username email');
    
    res.json({
      message: 'Permissions updated successfully',
      admin: updatedAdmin
    });
  } catch (error) {
    console.error('Error updating admin permissions:', error);
    res.status(500).json({ message: 'Error updating permissions' });
  }
});

// PUT /api/admin/:id/status - Update admin status (Main admin only)
router.put('/:id/status', authenticateAdmin, requireMainAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean' });
    }
    
    const admin = await Admin.findById(req.params.id);
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    
    if (admin.role === 'main_admin') {
      return res.status(400).json({ message: 'Cannot deactivate main admin' });
    }
    
    admin.isActive = isActive;
    await admin.save();
    
    const updatedAdmin = await Admin.findById(admin._id)
      .select('-password')
      .populate('createdBy', 'username email');
    
    res.json({
      message: `Admin ${isActive ? 'activated' : 'deactivated'} successfully`,
      admin: updatedAdmin
    });
  } catch (error) {
    console.error('Error updating admin status:', error);
    res.status(500).json({ message: 'Error updating admin status' });
  }
});

// DELETE /api/admin/:id - Delete admin (Main admin only)
router.delete('/:id', authenticateAdmin, requireMainAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    
    if (admin.role === 'main_admin') {
      return res.status(400).json({ message: 'Cannot delete main admin' });
    }
    
    await Admin.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({ message: 'Error deleting admin' });
  }
});

// POST /api/admin/create-main-admin - Create main admin (Only if none exists)
router.post('/create-main-admin', async (req, res) => {
  try {
    const { username, email, password, secretKey } = req.body;
    
    // Check secret key (you should set this in your environment variables)
    const MAIN_ADMIN_SECRET = process.env.MAIN_ADMIN_SECRET || 'your-super-secret-main-admin-key';
    
    if (secretKey !== MAIN_ADMIN_SECRET) {
      return res.status(401).json({ message: 'Invalid secret key' });
    }
    
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }
    
    const mainAdmin = await Admin.createMainAdmin({
      username,
      email: email.toLowerCase(),
      password
    });
    
    res.status(201).json({
      message: 'Main admin created successfully',
      admin: {
        id: mainAdmin._id,
        username: mainAdmin.username,
        email: mainAdmin.email,
        role: mainAdmin.role
      }
    });
  } catch (error) {
    console.error('Error creating main admin:', error);
    
    if (error.message === 'Main admin already exists') {
      return res.status(400).json({ message: 'Main admin already exists' });
    }
    
    res.status(500).json({ message: 'Error creating main admin' });
  }
});

module.exports = router;