// src/lib/utils/browser-imports.js
// This file provides browser-compatible imports

// For JSZip
export async function getJSZip() {
    try {
      // Try ESM import first
      const jszip = await import('jszip');
      // Return whatever form is available
      return jszip.default || jszip;
    } catch (e) {
      console.error('Error loading JSZip:', e);
      throw new Error('Failed to load JSZip');
    }
  }
  
  // Browser already has DOMParser
  export const DOMParser = window.DOMParser;