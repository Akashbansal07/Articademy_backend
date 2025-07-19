const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Generate JWT token
const generateToken = (adminId) => {
  return jwt.sign({ adminId }, JWT_SECRET, { expiresIn: '24h' });
};

// Middleware to authenticate admin
const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findById(decoded.adminId).select('-password');
    
    if (!admin) {
      return res.status(401).json({ message: 'Invalid token. Admin not found.' });
    }
    
    if (!admin.isActive) {
      return res.status(401).json({ message: 'Account is deactivated.' });
    }
    
    if (admin.isLocked) {
      return res.status(401).json({ message: 'Account is temporarily locked.' });
    }
    
    req.admin = admin;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired.' });
    }
    res.status(500).json({ message: 'Server error during authentication.' });
  }
};

// Middleware to check if admin is main admin
const requireMainAdmin = async (req, res, next) => {
  try {
    if (req.admin.role !== 'main_admin') {
      return res.status(403).json({ message: 'Access denied. Main admin privileges required.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error during authorization.' });
  }
};

// Middleware to check specific permissions
const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (req.admin.role === 'main_admin') {
        return next(); // Main admin has all permissions
      }
      
      if (!req.admin.permissions || !req.admin.permissions[permission]) {
        return res.status(403).json({ 
          message: `Access denied. ${permission} permission required.` 
        });
      }
      
      next();
    } catch (error) {
      res.status(500).json({ message: 'Server error during permission check.' });
    }
  };
};

module.exports = {
  generateToken,
  authenticateAdmin,
  requireMainAdmin,
  requirePermission
};