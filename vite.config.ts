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
    // Add this section for the WebSocket token
    define: {
        '__WS_TOKEN__': JSON.stringify(process.env.VITE_WS_TOKEN || 'development')
    },
    // Your existing configuration...
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
                assetFileNames: (assetInfo) => {
                    const extType = assetInfo.name.split('.').at(1);
                    if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
                        return '_app/immutable/assets/[name].[hash][extname]';
                    }
                    if (/woff|woff2|eot|ttf|otf/i.test(extType)) {
                        return '_app/immutable/assets/[name].[hash][extname]';
                    }
                    return '_app/immutable/assets/[name].[hash][extname]';
                },
                chunkFileNames: '_app/immutable/chunks/[name].[hash].js',
                entryFileNames: '_app/immutable/entry/[name].[hash].js',
            }
        }
    },
    test: {
        include: ['src/**/*.{test,spec}.{js,ts}']
    }
});