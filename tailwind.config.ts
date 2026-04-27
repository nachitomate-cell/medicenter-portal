import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Stark: solo negro puro, blanco puro, y un único gris para deshabilitar.
        ink: "#000000",
        paper: "#FFFFFF",
        hairline: "#FFFFFF", // los bordes son blancos sobre negro
        muted: "#5A5A5A", // único gris permitido — solo para texto deshabilitado
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      fontSize: {
        // Escala tipográfica deliberada — no usamos los defaults de Tailwind
        micro: ["10px", { lineHeight: "1.4", letterSpacing: "0.12em" }],
        caption: ["11px", { lineHeight: "1.5", letterSpacing: "0.08em" }],
        body: ["14px", { lineHeight: "1.6" }],
        lead: ["16px", { lineHeight: "1.5" }],
        h3: ["20px", { lineHeight: "1.3" }],
        h2: ["32px", { lineHeight: "1.15" }],
        h1: ["56px", { lineHeight: "1.0", letterSpacing: "-0.02em" }],
      },
      borderWidth: {
        hairline: "1px",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
