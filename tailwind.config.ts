import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:  ['var(--font-sans)', 'sans-serif'],
        serif: ['var(--font-serif)', 'serif'],
      },
      colors: {
        teal: {
          50:  '#E1F5EE',
          100: '#9FE1CB',
          200: '#5DCAA5',
          300: '#5DCAA5',
          400: '#1D9E75',
          500: '#1D9E75',
          600: '#1D9E75',
          700: '#0F6E56',
          800: '#085041',
          900: '#04342C',
        },
      },
    },
  },
  plugins: [],
}

export default config
