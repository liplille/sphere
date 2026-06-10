import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// public/ (favicon.svg, go/index.php) est copié tel quel dans dist/.
// Les noms de fichiers JS/CSS sont hashés → plus de cache busting manuel (?v=N).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        confirm: fileURLToPath(new URL("./confirm.html", import.meta.url)),
      },
    },
  },
});
