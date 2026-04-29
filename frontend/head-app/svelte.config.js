import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** Asset path contract fulfilled by Frappe shell controller's path rewriting:
 *  clinic_flow/www/clinic/arrival_counter.py — _load_head_app_shell()
 *  rewrites relative ./_app/ -> /assets/clinic_flow/head-app/_app/ at serve time.
 *  SvelteKit v2.58 requires paths.assets to be a full URL (with protocol),
 *  so root-relative config is not set here. */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: undefined,
      precompress: false,
      strict: true,
    }),
    prerender: {
      entries: ["/", "/arrival-counter", "/login"],
      handleHttpError: "warn",
    },
    alias: {
      "$arrival": "src/lib/arrival-counter",
      "$login": "src/lib/login",
      "$api": "src/lib/api",
      "$realtime": "src/lib/realtime",
    },
  },
};

export default config;
