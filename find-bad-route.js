const express = require('express');

// Test each route file individually by mounting them
function testRouteFile(filePath, mountPath) {
  try {
    const app = express();
    const routes = require(filePath);
    
    console.log(`Testing ${filePath} on ${mountPath}...`);
    app.use(mountPath, routes);
    
    // Try to get route info
    const server = app.listen(0, () => {
      console.log(`✅ ${filePath} - No route errors`);
      server.close();
    });
    
    return true;
  } catch (error) {
    console.error(`❌ ${filePath} - Route error:`, error.message);
    return false;
  }
}

// Test each route file
console.log('Testing route files for malformed patterns...\n');

testRouteFile('./routes/jobRoutes.js', '/api/jobs');
testRouteFile('./routes/adminRoutes.js', '/api/admin');
testRouteFile('./routes/analyticsRoutes.js', '/api/analytics');

console.log('\nDone testing individual route files.');
