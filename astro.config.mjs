import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://jackzsps.github.io',
  base: '/muzhuSite/',
  trailingSlash: 'always',
  integrations: [
    mdx(),
    sitemap(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
