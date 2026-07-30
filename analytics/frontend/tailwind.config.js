/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tinta naval e porcelana: ferramenta de análise, não cassino.
        tinta: "#0F1E2E",
        acaso: "#0E6E62",
        alerta: "#A3324C",
      },
    },
  },
  plugins: [],
};
