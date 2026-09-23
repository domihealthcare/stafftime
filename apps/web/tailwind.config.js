import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Domi Healthcare's blue, from domihealthcare.com (#3A6888, the 600
      // step). The other steps keep its hue and chroma in OKLCH and move only
      // lightness, so a tint and a hover read as the same colour. White text
      // on 600 is 6.0:1 and on 700 is 7.7:1.
      colors: {
        brand: {
          50: '#f0f8fe',
          100: '#dbeefd',
          200: '#bbddf6',
          300: '#92c1e4',
          400: '#6099c1',
          500: '#507fa0',
          600: '#3a6888',
          700: '#2c5775',
          800: '#1e445d',
          900: '#103146',
        },
      },
      // The website sets its type in Avenir. It is not a web font anyone may
      // serve, so it is used where the device already has it — every iPhone,
      // iPad and Mac — and everything else gets its own system face.
      fontFamily: {
        sans: [
          '"Avenir Next"',
          'Avenir',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
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
