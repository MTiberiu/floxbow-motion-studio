import { spawn } from "node:child_process";
import electron from "electron";
import { startServers, root } from "./server";
const servers = await startServers(process.argv.includes("--built"));
console.log(`AI Motion Studio: ${servers.url}`);
if (!process.argv.includes("--browser")) {
  const env: NodeJS.ProcessEnv = { ...process.env, STUDIO_URL: servers.url };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    electron as unknown as string,
    ["apps/desktop/electron/main.cjs"],
    { cwd: root, env, stdio: "inherit" },
  );
  child.on("error", async (error) => {
    console.error(error);
    await servers.close();
    process.exit(1);
  });
  child.on("exit", async (code) => {
    await servers.close();
    process.exit(code ?? 0);
  });
  process.on("SIGINT", () => child.kill());
  process.on("SIGTERM", () => child.kill());
} else {
  process.on("SIGINT", async () => {
    await servers.close();
    process.exit();
  });
}
