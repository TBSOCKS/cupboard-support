/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cupboard: {
          cream: '#FAF7F2',
          stone: '#E8E2D6',
          warm: '#A8957A',
          deep: '#3D3528',
          accent: '#7B6549',
        }
      },
      fontFamily: {
        serif: ['ui-serif', 'Georgia', 'Cambria', 'serif'],
      }
    },
  },
  plugins: [],
};
