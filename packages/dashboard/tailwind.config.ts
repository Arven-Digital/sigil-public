import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        neon: "#00FF88",
        sigil: {
          bg: { dark: "#050505", card: "rgba(255,255,255,0.02)", light: "#F5F7FA" },
          fg: { light: "#EDEFF2", dark: "#050505" },
          muted: "rgba(255,255,255,0.4)",
          divider: "rgba(255,255,255,0.05)",
          accent: "#00FF88",
          indigo: "#00FF88", // legacy alias → neon green
          success: "#00FF88",
          warning: "#F4A524",
          error: "#F04452",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
        display: ["var(--font-fraunces)", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
