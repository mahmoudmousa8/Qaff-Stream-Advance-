import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

let cachedPublicIp: string | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in ms

export async function GET() {
  let isRunning = false;
  try {
    if (process.platform === "win32") {
      const stdout = execSync("tasklist", { encoding: "utf8" });
      isRunning = stdout.toLowerCase().includes("cloudflared");
    } else {
      execSync("pgrep -x cloudflared", { stdio: "ignore" });
      isRunning = true;
    }
  } catch (err) {
    isRunning = false;
  }

  const possiblePaths = [
    "/root/cloudflare.log",
    "/var/log/cloudflare.log",
    "/tmp/cloudflare.log",
    path.join(process.cwd(), "cloudflare.log"),
    path.join(process.cwd(), "..", "cloudflare.log"),
    "cloudflare.log"
  ];

  if (process.env.CLOUDFLARE_LOG_PATH) {
    possiblePaths.unshift(process.env.CLOUDFLARE_LOG_PATH);
  }

  let tunnelUrl: string | null = null;
  let foundPath: string | null = null;

  if (isRunning) {
    for (const logPath of possiblePaths) {
      try {
        if (fs.existsSync(logPath)) {
          const content = fs.readFileSync(logPath, "utf8");
          // Regex to find trycloudflare URLs
          const matches = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
          if (matches && matches.length > 0) {
            // Get the last occurrence as it is the most recent session
            tunnelUrl = matches[matches.length - 1];
            foundPath = logPath;
            break;
          }
        }
      } catch (err) {
        // Ignore read errors for individual paths and try next
        console.warn(`Could not read cloudflare log at ${logPath}:`, err);
      }
    }
  }

  // Fetch and cache public IP
  const now = Date.now();
  if (!cachedPublicIp || now - cacheTimestamp > CACHE_DURATION) {
    try {
      const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        if (data.ip) {
          cachedPublicIp = data.ip;
          cacheTimestamp = now;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch public IP:", err);
    }
  }

  return NextResponse.json({
    success: !!(isRunning && tunnelUrl),
    tunnelUrl: isRunning ? (tunnelUrl || null) : null,
    logPath: foundPath || null,
    publicIp: cachedPublicIp || null
  });
}

// POST - Restart cloudflared quick tunnel process via PM2
export async function POST() {
  try {
    const { exec } = await import("child_process");
    
    await new Promise<void>((resolve, reject) => {
      exec("pm2 restart qaff-tunnel", (err) => {
        if (err) {
          // If restart fails (e.g. process not running/registered), try starting it using the config file
          exec("pm2 start ecosystem.config.cjs --only qaff-tunnel", (err2) => {
            if (err2) reject(err2);
            else resolve();
          });
        } else {
          resolve();
        }
      });
    });

    // Wait 3 seconds for cloudflared to boot up and print the new trycloudflare URL
    await new Promise(resolve => setTimeout(resolve, 3000));

    return NextResponse.json({ success: true, message: "Tunnel restarted successfully" });
  } catch (error: any) {
    console.error("Failed to restart tunnel:", error);
    return NextResponse.json({ error: "Failed to restart tunnel: " + error.message }, { status: 500 });
  }
}

