import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pda: {
          navy: "#1b2a5e",
          blue: "#2563eb",
          gold: "#c9a227",
        },
      },
    },
  },
  plugins: [],
};

export default config;
