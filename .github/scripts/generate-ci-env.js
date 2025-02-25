const fs = require('fs');
const dotenv = require('dotenv');

// Load the .env file to get all variable names
dotenv.config();

// Generate dummy values for CI
const generateDummyEnv = () => {
  const envVars = {};
  
  // Process all environment variables
  Object.keys(process.env).forEach(key => {
    // Only process environment variables that appear to be application config
    if (key.startsWith('PUBLIC_') || 
        key.startsWith('PRIVATE_') || 
        key.startsWith('ONESIGNAL_') ||
        key === 'USER_AUTH_KEY' ||
        key === 'SUPABASE_PASS') {
      
      // Generate appropriate dummy values based on variable type
      if (key.includes('KEY') || key.includes('SECRET')) {
        envVars[key] = 'fake_' + key.toLowerCase();
      } else if (key.includes('URL')) {
        envVars[key] = 'https://fake.example.com';
      } else if (key.includes('VERSION')) {
        envVars[key] = '0.0.0';
      } else if (process.env[key].startsWith('{')) {
        // This appears to be JSON
        envVars[key] = '{"fake":"value"}';
      } else if (process.env[key].startsWith('[')) {
        // This appears to be an array
        envVars[key] = '[0,0,0]';
      } else {
        envVars[key] = 'fake_value';
      }
    }
  });
  
  return envVars;
};

// Output to GitHub Actions environment file
const ciEnv = generateDummyEnv();
const output = Object.entries(ciEnv)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

fs.writeFileSync(process.env.GITHUB_ENV || '.env.ci', output);
console.log('Generated dummy environment variables for CI');