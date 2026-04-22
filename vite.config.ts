import { defineConfig } from "vite";
import { execSync } from "child_process";

const commitHash = execSync("git rev-parse --short HEAD").toString().trim();
const pkg = JSON.parse(
  execSync("cat package.json").toString()
);

export default defineConfig({
  base: "/footsies-dojo/",
  build: {
    outDir: "dist",
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
});
