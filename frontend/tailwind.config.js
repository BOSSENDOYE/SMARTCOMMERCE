/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#fff4ef',
          100: '#ffe6d9',
          200: '#ffc9a8',
          300: '#ffa876',
          400: '#ff8c4f',
          DEFAULT: '#ff7631',
          600: '#e65c18',
          700: '#bf4a10',
          800: '#99390b',
          900: '#7a2d08',
        },
        brand: {
          50:  '#e6edf5',
          100: '#ccdaeb',
          200: '#99b5d7',
          300: '#6690c3',
          400: '#336baf',
          500: '#004a9b',
          600: '#003d80',
          DEFAULT: '#002f59',
          700: '#002244',
          800: '#001833',
          900: '#000e1f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '20%':       { transform: 'rotate(-15deg)' },
          '40%':       { transform: 'rotate(15deg)' },
          '60%':       { transform: 'rotate(-10deg)' },
          '80%':       { transform: 'rotate(10deg)' },
        },
      },
      animation: {
        wiggle: 'wiggle 0.7s ease-in-out',
      },
    },
  },
  plugins: [],
}
