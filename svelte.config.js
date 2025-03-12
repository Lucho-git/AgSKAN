import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/kit/vite';
import * as child_process from 'node:child_process';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    kit: {
        adapter: adapter({
            // Static adapter options
            pages: 'build',         // Output folder for pages
            assets: 'build',        // Output folder for assets
            fallback: 'index.html', // Fallback for SPA navigation
            precompress: true,      // Enable precompression for better performance
            strict: false           // Set to true to error if a page can't be prerendered
        }),
        
        // Prerendering configuration
        prerender: {
            concurrency: 10,          // Number of pages to prerender simultaneously
            crawl: true,              // Automatically crawl your app for pages to prerender
            entries: ['*'],           // Paths to prerender - '*' means all pages
            handleHttpError: ({ path, referrer, message }) => {
                // Custom error handler during prerendering
                console.warn(`Prerendering error for ${path} (referred from ${referrer}): ${message}`);
                
                // Return false to fail the build when prerendering fails
                // Return true to ignore the error and continue
                return true;
            },
            handleMissingId: ({ path, id, referrer }) => {
                // Handle missing IDs during prerendering
                console.warn(`Missing ID: ${id} for ${path} (referred from ${referrer})`);
                return true; // Continue despite the error
            }
        },
        
        version: {
            name: child_process.execSync('git rev-parse HEAD').toString().trim(),
            pollInterval: 600000
        }
    },
    preprocess: vitePreprocess()
};

export default config;