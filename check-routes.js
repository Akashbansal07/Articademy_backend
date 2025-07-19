const express = require('express');
const app = express();

// Test each route file individually
console.log('Testing route files...\n');

// Test job routes
console.log('1. Testing jobRoutes.js...');
try {
  const jobRoutes = require('./routes/jobRoutes');
  app.use('/api/jobs', jobRoutes);
  console.log('✅ jobRoutes.js loaded successfully');
} catch (error) {
  console.error('❌ Error in jobRoutes.js:', error.message);
  console.error('Stack:', error.stack);
}

// Test admin routes
console.log('\n2. Testing adminRoutes.js...');
try {
  const adminRoutes = require('./routes/adminRoutes');
  app.use('/api/admin', adminRoutes);
  console.log('✅ adminRoutes.js loaded successfully');
} catch (error) {
  console.error('❌ Error in adminRoutes.js:', error.message);
  console.error('Stack:', error.stack);
}

// Test analytics routes
console.log('\n3. Testing analyticsRoutes.js...');
try {
  const analyticsRoutes = require('./routes/analyticsRoutes');
  app.use('/api/analytics', analyticsRoutes);
  console.log('✅ analyticsRoutes.js loaded successfully');
} catch (error) {
  console.error('❌ Error in analyticsRoutes.js:', error.message);
  console.error('Stack:', error.stack);
}

// Test middleware
console.log('\n4. Testing middleware/auth.js...');
try {
  const auth = require('./middleware/auth');
  console.log('✅ auth middleware loaded successfully');
} catch (error) {
  console.error('❌ Error in auth middleware:', error.message);
  console.error('Stack:', error.stack);
}

// Test models
console.log('\n5. Testing models...');
try {
  const Job = require('./models/Job');
  console.log('✅ Job model loaded successfully');
} catch (error) {
  console.error('❌ Error in Job model:', error.message);
}

try {
  const Admin = require('./models/Admin');
  console.log('✅ Admin model loaded successfully');
} catch (error) {
  console.error('❌ Error in Admin model:', error.message);
}

try {
  const Analytics = require('./models/Analytics');
  console.log('✅ Analytics model loaded successfully');
} catch (error) {
  console.error('❌ Error in Analytics model:', error.message);
}

// List all routes
console.log('\n6. Listing all registered routes...');
function listRoutes(router, prefix = '') {
  if (router.stack) {
    router.stack.forEach((layer) => {
      if (layer.route) {
        // Regular route
        const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
        console.log(`  ${methods} ${prefix}${layer.route.path}`);
      } else if (layer.name === 'router') {
        // Nested router
        const newPrefix = prefix + layer.regexp.source.replace(/^\^\\?\//, '').replace(/\$.*$/, '');
        listRoutes(layer.handle, newPrefix);
      }
    });
  }
}

try {
  listRoutes(app._router);
  console.log('\n✅ Route listing completed');
} catch (error) {
  console.error('❌ Error listing routes:', error.message);
}

console.log('\n🔍 Route checking completed!');
console.log('If you see any errors above, those files need to be fixed.');
console.log('If no errors, the issue might be in server.js or package dependencies.');

// Test starting the server
console.log('\n7. Testing server startup...');
try {
  const server = app.listen(5001, () => {
    console.log('✅ Test server started successfully on port 5001');
    server.close(() => {
      console.log('✅ Test server closed successfully');
      process.exit(0);
    });
  });
} catch (error) {
  console.error('❌ Error starting test server:', error.message);
  process.exit(1);
}