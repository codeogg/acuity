// The one PostCSS config: Tailwind v4 runs as a PostCSS plugin (matches
// @component-core/ui's v4 setup). Apps re-export this file verbatim.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
