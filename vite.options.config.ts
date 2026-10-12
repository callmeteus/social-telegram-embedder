import { defineConfig } from "vite";
import { resolve } from "node:path";
import { OPTIONS_DEV_PORT } from "./scripts/options-dev-port.mjs";

const optionsRoot = resolve(__dirname, "src/options");
const optionsDevPort = Number(process.env.OPTIONS_DEV_PORT ?? OPTIONS_DEV_PORT);

export default defineConfig({
    root: optionsRoot,
    publicDir: false,
    server: {
        port: optionsDevPort,
        strictPort: true,
        open: "/dev.html?popup=1",
        proxy: {
            "/tg": {
                target: "https://api.telegram.org",
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/tg/, "")
            }
        }
    },
    build: {
        outDir: resolve(__dirname, "dist-dev-options"),
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(optionsRoot, "dev.html")
        }
    }
});
