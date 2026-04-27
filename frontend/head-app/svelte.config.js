import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

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
      entries: ["/", "/arrival-counter"],
    },
    alias: {
      "$arrival": "src/lib/arrival-counter",
      "$api": "src/lib/api",
      "$realtime": "src/lib/realtime",
    },
  },
};

export default config;
