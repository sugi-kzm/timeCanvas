import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import { platform } from "node:os";

function isWsl() {
  if (platform() !== "linux") return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;

  try {
    return readFileSync("/proc/sys/kernel/osrelease", "utf8").toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

const env = { ...process.env };
const args = process.argv.slice(2);

if (isWsl()) {
  const wslWebKitDefaults = {
    GDK_BACKEND: "x11",
    WEBKIT_DISABLE_DMABUF_RENDERER: "1",
    WEBKIT_DMABUF_RENDERER_DISABLE_GBM: "1",
    WEBKIT_DMABUF_RENDERER_FORCE_SHM: "1",
    WEBKIT_WEBGL_DISABLE_GBM: "1",
    WEBKIT_DISABLE_COMPOSITING_MODE: "1",
    WEBKIT_SKIA_ENABLE_CPU_RENDERING: "1",
    WEBKIT_SKIA_GPU_PAINTING_THREADS: "0",
    LIBGL_ALWAYS_SOFTWARE: "1",
    GALLIUM_DRIVER: "llvmpipe",
  };

  for (const [key, value] of Object.entries(wslWebKitDefaults)) {
    env[key] ??= value;
  }
}

function canListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => {
      resolve(error.code !== "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

if (args[0] === "dev" && !(await canListen(1420, "127.0.0.1"))) {
  console.error(
    [
      "Port 1420 is already in use.",
      "Stop the existing TimeCanvas/Vite dev server first, then run `npm run tauri dev` again.",
      "You can inspect the owner with: ss -ltnp 'sport = :1420'",
    ].join("\n"),
  );
  process.exit(1);
}

const command = platform() === "win32" ? "tauri.cmd" : "tauri";
const child = spawn(command, args, {
  env,
  shell: platform() === "win32",
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
