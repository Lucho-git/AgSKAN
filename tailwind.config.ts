import type { Config } from "tailwindcss"
import { fontFamily } from "tailwindcss/defaultTheme";

const config: Config = {
    darkMode: ["class"],
    content: ["./src/**/*.{html,js,svelte,ts}"],
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1500",
            },
        },
        extend: {
            colors: {
                border: "var(--base-200)",
                input: "var(--base-200)",
                ring: "var(--primary)",
                background: "var(--base-100)",
                foreground: "var(--base-content)",
                primary: {
                    DEFAULT: "#17a34a",
                    foreground: "#fefbf6",
                },
                secondary: {
                    DEFAULT: "#F7DB5C",
                    foreground: "#232322",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
                    foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
                },
                accent: {
                    DEFAULT: "#D95D39",
                    foreground: "#fefbf6",
                },
                muted: {
                    DEFAULT: "var(--base-200)",
                    foreground: "var(--base-content)",
                },
                popover: {
                    DEFAULT: "var(--base-200)",
                    foreground: "var(--base-content)",
                },
                card: {
                    DEFAULT: "var(--base-200)",
                    foreground: "var(--base-content)",
                },
                // Custom brand color
                "brand": "oklch(var(--brand) / <alpha-value>)",
                "brand-content": "oklch(var(--brand-content) / <alpha-value>)",
                // High contrast black/white text
                "contrast": "oklch(var(--contrast) / <alpha-value>)",
                "contrast-content": "oklch(var(--contrast-content) / <alpha-value>)",
                // Custom hover color: yellow in light, black in dark
                "hover": "oklch(var(--hover) / <alpha-value>)",
                "hover-content": "oklch(var(--hover-content) / <alpha-value>)",
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            fontFamily: {
                sans: ["Montserrat", "Inter", "ui-sans-serif", "system-ui", "sans-serif"], // Remove ...fontFamily.sans
                montserrat: ["Montserrat", "ui-sans-serif", "system-ui", "sans-serif"],
                inter: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
                archivo: ['Montserrat', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'], // Fix this naming
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
                'border-beam': 'border-beam calc(var(--duration)*1s) infinite linear',
                'image-glow': 'image-glow 4100ms 600ms ease-out forwards',
                'fade-in': 'fade-in 1000ms var(--animation-delay, 0ms) ease forwards',
                'fade-up': 'fade-up 1000ms var(--animation-delay, 0ms) ease forwards',
                shimmer: "shimmer 8s infinite",
                marquee: 'marquee var(--duration) infinite linear',
                'marquee-vertical': 'marquee-vertical var(--duration) linear infinite',
                "spin-around": "spin-around calc(var(--speed) * 2) infinite linear",
                magicslide: "magicslide var(--speed) ease-in-out infinite alternate",
                "gradient": "gradient 8s linear infinite",
            },
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-accordion-content-height)' }
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: '0' }
                },
                'border-beam': {
                    '100%': {
                        'offset-distance': '100%'
                    }
                },
                'image-glow': {
                    '0%': {
                        opacity: '0',
                        'animation-timing-function': 'cubic-bezier(0.74, 0.25, 0.76, 1)'
                    },
                    '10%': {
                        opacity: '0.7',
                        'animation-timing-function': 'cubic-bezier(0.12, 0.01, 0.08, 0.99)'
                    },
                    '100%': {
                        opacity: '0.4'
                    }
                },
                'fade-in': {
                    from: { opacity: '0', transform: 'translateY(-10px)' },
                    to: { opacity: '1', transform: 'none' }
                },
                'fade-up': {
                    from: { opacity: '0', transform: 'translateY(20px)' },
                    to: { opacity: '1', transform: 'none' }
                },
                shimmer: {
                    "0%, 90%, 100%": {
                        "background-position": "calc(-100% - var(--shimmer-width)) 0",
                    },
                    "30%, 60%": {
                        "background-position": "calc(100% + var(--shimmer-width)) 0",
                    },
                },
                marquee: {
                    from: { transform: 'translateX(0)' },
                    to: { transform: 'translateX(calc(-100% - var(--gap)))' }
                },
                'marquee-vertical': {
                    from: { transform: 'translateY(0)' },
                    to: { transform: 'translateY(calc(-100% - var(--gap)))' }
                },
                "shine-pulse": {
                    "0%": {
                        "background-position": "0% 0%",
                    },
                    "50%": {
                        "background-position": "100% 100%",
                    },
                    to: {
                        "background-position": "0% 0%",
                    },
                },
                "spin-around": {
                    "0%": {
                        transform: "translateZ(0) rotate(0)",
                    },
                    "15%, 35%": {
                        transform: "translateZ(0) rotate(90deg)",
                    },
                    "65%, 85%": {
                        transform: "translateZ(0) rotate(270deg)",
                    },
                    "100%": {
                        transform: "translateZ(0) rotate(360deg)",
                    },
                },
                magicslide: {
                    to: {
                        transform: "translate(calc(100cqw - 100%), 0)",
                    },
                },
                gradient: {
                    to: {
                        "background-position": "200% center",
                    },
                },
            }
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
        require('tailwindcss-animate'),
        require("daisyui")
    ],
    daisyui: {
        themes: [
            {
                skantheme: {
                    "primary": "#17a34a",           // #17a34a
                    "primary-content": "#fefbf6",   // #fefbf6
                    "secondary": "#F7DB5C",         // #F7DB5C
                    "secondary-content": "#232322", // #232322
                    "accent": "#fde68a",            // #fde68a
                    "accent-content": "#fefbf6",    // #fefbf6
                    "neutral": "#102030",           // #102030
                    "neutral-content": "#fefbf6",   // #fefbf6
                    "base-100": "#ffffff",          // #ffffff
                    "base-200": "#f1f5f9",          // #f1f5f9
                    "base-300": "#cbd5e1",          // #cbd5e1
                    "base-content": "#232322",      // #232322 (dark for light mode)
                    "info": "#3b82f6",              // #3b82f6
                    "success": "#22c55e",           // #22c55e
                    "warning": "#f59e0b",           // #f59e0b
                    "error": "#ef4444",             // #ef4444
                    "--gradient-start": "var(--base-200)",
                    "--gradient-end": "var(--base-100)",
                    "focus": "#FF00FF",             // #FF00FF
                    "focus-content": "#FFFFFF",     // #FFFFFF
                    "--radius": "0.5rem",
                    "--border": "var(--base-200)",
                    "--input": "var(--base-200)",
                    "--ring": "var(--primary)",
                    // Brand color: yellow in light mode
                    "--brand": "91% 0.15 85",        // #F7DB5C
                    "--brand-content": "14% 0.01 85", // #232322
                    // High contrast: white with dark content in light mode
                    "--contrast": "100% 0 0",        // #ffffff (white)
                    "--contrast-content": "14% 0.01 85", // #232322 (dark)
                    // Hover color: yellow in light mode
                    "--hover": "91% 0.15 85",        // #F7DB5C (yellow)
                    "--hover-content": "14% 0.01 85", // #232322 (dark)
                },
            },
            {
                skanthemedark: {
                    "primary": "#17a34a",           // #17a34a
                    "primary-content": "#fefbf6",   // #fefbf6
                    "secondary": "#F7DB5C",         // #F7DB5C
                    "secondary-content": "#232322", // #232322
                    "accent": "#D95D39",            // #D95D39
                    "accent-content": "#fefbf6",    // #fefbf6
                    "neutral": "#f9e58a",           // #f9e58a
                    "neutral-content": "#232322",   // #232322
                    "base-100": "#121212",          // #121212
                    "base-200": "#1E1E1E",          // #1E1E1E
                    "base-300": "#374151",          // #374151
                    "base-content": "#F7DB5C",      // #F7DB5C (yellow for dark mode)
                    "info": "#93c5fd",              // #93c5fd
                    "success": "#a7f3d0",           // #a7f3d0
                    "warning": "#fde68a",           // #fde68a
                    "error": "#fca5a5",             // #fca5a5
                    "error-content": "#ffffff",     // #ffffff
                    "--gradient-start": "var(--base-200)",
                    "--gradient-end": "var(--base-100)",
                    "focus": "#FF00FF",             // #FF00FF
                    "focus-content": "#FFFFFF",     // #FFFFFF
                    "--radius": "0.5rem",
                    "--border": "var(--base-200)",
                    "--input": "var(--base-200)",
                    "--ring": "var(--primary)",
                    // Brand color: white in dark mode
                    "--brand": "99% 0.01 85",        // #fefbf6
                    "--brand-content": "91% 0.15 85", // #F7DB5C
                    // High contrast: dark with white content in dark mode  
                    "--contrast": "14% 0.01 85",     // #232322 (dark)
                    "--contrast-content": "100% 0 0", // #ffffff (white)
                    // Hover color: black in dark mode
                    "--hover": "14% 0.01 85",        // #232322 (dark/black)
                    "--hover-content": "100% 0 0",   // #ffffff (white)
                },
            },
            "autumn",
            "light",
            "dark",
            "cupcake",
            "bumblebee",
            "emerald",
            "corporate",
            "synthwave",
            "cyberpunk",
            "valentine",
            "halloween",
            "garden",
            "forest",
            "aqua",
            "lofi",
            "pastel",
            "fantasy",
            "wireframe",
            "black",
            "luxury",
            "dracula",
            "cmyk",
            "business",
            "acid",
            "lemonade",
            "night",
            "coffee",
            "winter",
        ],
        darkTheme: "skanthemedark",
    }
};

export default config;