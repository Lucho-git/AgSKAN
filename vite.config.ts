import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import svg from '@poppanator/sveltekit-svg';

export default defineConfig({
    plugins: [
        sveltekit(),
        svg({
            includePaths: ['./src/lib/assets/'],
            svgoOptions: {
                plugins: [
                    {
                        name: 'preset-default',
                        params: {
                            overrides: {
                                cleanupIds: false,
                                removeViewBox: false,
                            }
                        }
                    }
                ]
            },
            type: 'component'
        })
    ],
    // Proper environment definition
    define: {
        // Define the NODE_ENV
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),

        // Safely define WebSocket token
        'import.meta.env.VITE_WS_TOKEN': JSON.stringify(process.env.VITE_WS_TOKEN || 'development'),

        // Define any other environment variables you need
        ...Object.fromEntries(
            Object.entries(process.env)
                .filter(([key]) => key.startsWith('VITE_'))
                .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])
        )
    },
    optimizeDeps: {
        include: [
            '@supabase/supabase-js',
            '@supabase/postgrest-js',
            '@supabase/gotrue-js',
            'mapbox-gl',
            'fast-deep-equal',
            '@turf/line-overlap',
            '@turf/meta',
            '@turf/helpers',
            'jszip'
        ],
        esbuildOptions: {
            define: {
                global: 'globalThis'
            },
            preserveSymlinks: true
        }
    },
    resolve: {
        mainFields: ['browser', 'module', 'main'],
        dedupe: ['mapbox-gl', 'fast-deep-equal'],
        alias: {
            'fast-deep-equal': 'fast-deep-equal/index.js'
        }
    },
    build: {
        commonjsOptions: {
            transformMixedEsModules: true,
            include: [/node_modules/],
            defaultIsModuleExports: 'auto'
        },
        reportCompressedSize: false,
        rollupOptions: {
            onwarn(warning, warn) {
                if (warning.code === 'MIXED_EXPORTS') return;
                warn(warning);
            },
            output: {
                manualChunks: undefined,
                // Using your old working path structure
                assetFileNames: (assetInfo) => {
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