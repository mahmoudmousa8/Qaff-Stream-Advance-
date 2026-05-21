import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
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

  return NextResponse.json({
    success: !!tunnelUrl,
    tunnelUrl: tunnelUrl || null,
    logPath: foundPath || null
  });
}
