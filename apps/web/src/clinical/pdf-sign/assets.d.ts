/// Vite's `?url` imports: the address of a file built into the app (the
/// pdf.js worker, here).
declare module '*?url' {
  const url: string;
  export default url;
}
