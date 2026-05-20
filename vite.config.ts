import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
	return {
		base: command === "build" ? "/gossip-glomers/" : "/",
		plugins: [react(), tailwindcss()],
		resolve: {
			alias: {
				"@": path.resolve(import.meta.dirname, "src"),
				"@assets": path.resolve(
					import.meta.dirname,
					"..",
					"..",
					"attached_assets",
				),
			},
			dedupe: ["react", "react-dom"],
		},
		root: path.resolve(import.meta.dirname),
		build: {
			outDir: path.resolve(import.meta.dirname, "dist/public"),
			emptyOutDir: true,
		},
	};
});
