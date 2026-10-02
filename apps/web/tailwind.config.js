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
        // Slate's own 500 is 4.3:1 on the page's slate-100 — under AA for small
        // text, and hint text is set in it about 270 times. Darkened a step so
        // it is 5.4:1 there and the hint/body distinction survives.
        slate: { 500: '#566579' },
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
      // The suggestion box: the note dropping into the slot once it is sent,
      // and the box giving a little bump as it lands. Used behind `motion-safe:`
      // so nobody who asked their phone for less motion gets it.
      keyframes: {
        'note-drop': {
          '0%': { transform: 'translateY(-26px) rotate(-10deg)', opacity: '1' },
          '55%': { transform: 'translateY(2px) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(26px) rotate(0deg)', opacity: '0' },
        },
        'box-bump': {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(3px) scale(1.03, 0.97)' },
        },
        'fade-up': {
          '0%': { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'note-drop': 'note-drop 900ms ease-in forwards',
        'box-bump': 'box-bump 350ms ease-out 650ms',
        'fade-up': 'fade-up 300ms ease-out 800ms both',
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
