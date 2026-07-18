import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        canvas: "#f5efe3",
        signal: "#b64926",
        moss: "#5b6b43",
        steel: "#4b5563",
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "0 10px 40px rgba(17, 24, 39, 0.08)",
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at 1px 1px, rgba(17, 24, 39, 0.08) 1px, transparent 0)",
      },
    },
  },
  plugins: [],
};

export default config;
