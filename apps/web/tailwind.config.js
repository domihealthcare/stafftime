import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
      },
    },
  },
  // The form markup across this app is written for this plugin: inputs carry a
  // border *colour* (`border-slate-300`) and rely on the plugin's base styles
  // for the border itself. Without it, Tailwind's reset leaves every field with
  // `border-width: 0` — a text box with no visible box, which is exactly how it
  // shipped until somebody setting the app up for the first time said the text
  // "starts very close to the left side".
  plugins: [forms],
};
