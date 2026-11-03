import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f6f3eb",
        ink: "#202b45",
        muted: "#77786f",
        blue: "#263d75",
        red: "#bd5947",
        gold: "#c29b55",
        line: "#e5dfd3",
        card: "#fffdf8",
      },
      fontFamily: {
        sans: ["Avenir Next", "Avenir", "Segoe UI", "sans-serif"],
        serif: ["Georgia", "Times New Roman", "serif"],
      },
      boxShadow: {
        card: "0 22px 70px rgb(48 43 31 / 7%), 0 2px 8px rgb(48 43 31 / 3%)",
      },
    },
  },
  plugins: [],
};

export default config;
