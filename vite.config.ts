import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import svelteSVG from 'vite-plugin-svelte-svg';

export default defineConfig({
    plugins: [sveltekit(), svelteSVG({
        svgoConfig: {
            // SVGO configuration to optimize SVGs
            plugins: [
                {
                    name: 'preset-default',
                    params: {
                        overrides: {
                            // Disable plugins that might cause issues
                            cleanupIds: false,
                            removeViewBox: false,
                        }
                    }
                }
            ]
        },
        requireSuffix: false, // Set to true to only import files ending in .svg?component
    })],
    define: {
        'process.env.NODE_ENV': '"production"',
    },
    build: {
        // Disable gzip compression for Capacitor compatibility
        reportCompressedSize: false,
        rollupOptions: {
            output: {
                manualChunks: undefined, // This helps reduce file count
                assetFileNames: (assetInfo) => {
                    // Organize generated assets by type
                    const extType = assetInfo.name.split('.').at(1);
                    if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
                        return 'assets/images/[name]-[hash][extname]';
                    }
                    if (/woff|woff2|eot|ttf|otf/i.test(extType)) {
                        return 'assets/fonts/[name]-[hash][extname]';
                    }
                    return 'assets/[name]-[hash][extname]';
                },
                chunkFileNames: 'assets/js/[name]-[hash].js',
                entryFileNames: 'assets/js/[name]-[hash].js',
            }
        }
    },
    test: {
        include: ['src/**/*.{test,spec}.{js,ts}']
    }
});