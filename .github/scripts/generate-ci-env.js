import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read .env file
const envPath = path.resolve(__dirname, '../../.env');
const envFile = fs.readFileSync(envPath, 'utf8');

// Parse .env file
const envVars = {};
envFile.split('\n').forEach(line => {
  // Skip empty lines and comments
  if (!line || line.startsWith('#')) return;
  
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    
    // Generate fake value based on variable type
    if (key.includes('KEY') || key.includes('SECRET')) {
      envVars[key] = 'fake_' + key.toLowerCase();
    } else if (key.includes('URL')) {
      envVars[key] = 'https://fake.example.com';
    } else if (key.includes('VERSION')) {
      envVars[key] = '0.0.0';
    } else if (value.startsWith('{')) {
      envVars[key] = '{"fake":"value"}';
    } else if (value.startsWith('[')) {
      envVars[key] = '[0,0,0,0]';
    } else {
      envVars[key] = 'fake_value';
    }
  }
});

// Write to GitHub environment file
const githubEnvPath = process.env.GITHUB_ENV;
if (githubEnvPath) {
  const output = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.appendFileSync(githubEnvPath, output + '\n');
  console.log('Added fake environment variables to GITHUB_ENV');
} else {
  console.log('GITHUB_ENV not set, would have added these variables:');
  console.log(envVars);
}