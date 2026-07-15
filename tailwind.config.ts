import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  // Dark mode is opt-in via a .dark class on <html>, set before paint by the
  // inline script in app/layout.tsx and toggled by ThemeToggle.
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // Inter is loaded in app/layout.tsx via next/font and exposed as
        // --font-inter; system stack covers the flash before it resolves.
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      // Small entrance animations for cards, menus, and toasts.
      keyframes: {
        "fade-slide-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Exit mirror of fade-slide-up, for toasts dismissing back down.
        "fade-slide-down": {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(6px)" },
        },
        "fade-scale": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        // Exit mirror of fade-scale, for dropdown panels closing.
        "fade-scale-out": {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.97)" },
        },
        // Overshoot pop for a checkbox that just turned on.
        "check-pop": {
          "0%": { transform: "scale(0.8)" },
          "60%": { transform: "scale(1.15)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "fade-slide-up": "fade-slide-up 150ms ease-out",
        // Slower entrance for hero moments; reuses the same keyframes.
        "fade-slide-up-slow": "fade-slide-up 400ms ease-out",
        "fade-slide-down": "fade-slide-down 120ms ease-in",
        "fade-scale": "fade-scale 150ms ease-out",
        "fade-scale-out": "fade-scale-out 120ms ease-in",
        "check-pop": "check-pop 220ms ease-out",
      },
      // Warm brand-tinted shadows (rgb from hearth-800 #5e3c28), three tiers.
      boxShadow: {
        card: "0 1px 2px 0 rgb(94 60 40 / 0.05)",
        lift: "0 6px 16px -4px rgb(94 60 40 / 0.10)",
        pop: "0 16px 40px -12px rgb(94 60 40 / 0.18)",
        // Same elevation as the plain shadow-lg dropdown panels used, named
        // for what it's for so new panels reach for this instead of raw
        // shadow-lg.
        menu: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      },
      colors: {
        // Hearth palette: warm, calm, trustworthy.
        hearth: {
          50: "#fbf7f2",
          100: "#f3e9dd",
          200: "#e6d1ba",
          300: "#d4b08c",
          400: "#c08f60",
          500: "#a9743f",
          600: "#915d32",
          700: "#73482b",
          800: "#5e3c28",
          900: "#4f3324",
        },
      },
    },
  },
  plugins: [],
};

export default config;
