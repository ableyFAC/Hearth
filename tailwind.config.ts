import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Hearth palette — warm, calm, trustworthy.
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
