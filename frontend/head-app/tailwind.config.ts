import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f6f5f1",
        ink: "#10211f",
        mineral: "#0d6f69",
        mint: "#dcebe6",
        sand: "#f1ece5",
        line: "#d9ddd8"
      },
      fontFamily: {
        display: ["Lexend", "sans-serif"],
        body: ["Source Sans 3", "sans-serif"]
      },
      boxShadow: {
        panel: "0 18px 50px rgba(16, 33, 31, 0.08)"
      },
      borderRadius: {
        panel: "1.5rem"
      }
    }
  },
  plugins: [require("@tailwindcss/forms")]
} satisfies Config;
