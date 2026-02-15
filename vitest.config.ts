import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const sharedConfig = {
  globals: true,
  setupFiles: ["./vitest.setup.ts"],
  testTimeout: 30000,
  maxWorkers: 3,
};

const sharedResolve = {
  alias: {
    "@": path.resolve(__dirname, "./dashboard/src"),
    react: path.resolve(__dirname, "./node_modules/react"),
    "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: sharedResolve,
  test: {
    ...sharedConfig,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "src/**/*.test.ts",
            "dashboard/src/**/*.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: [
            "dashboard/src/**/*.test.tsx",
          ],
        },
      },
    ],
  },
});
