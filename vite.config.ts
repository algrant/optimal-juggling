import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served by GitHub Pages at https://algrant.github.io/optimal-juggling/
export default defineConfig({ base: "/optimal-juggling/", plugins: [react()] });
