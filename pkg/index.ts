import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Pintire Bridge: Executes pintire.sh in response to Pi lifecycle events.
 */
export default function (pi: ExtensionAPI) {
  const scriptPath = path.join(__dirname, "pintire.sh");

  // Hook: before_agent_start -> capture prompt
  pi.on("before_agent_start", async (event) => {
    try {
      // Escape prompt for shell
      const safePrompt = event.prompt.replace(/'/g, "'\\''");
      execSync(`"${scriptPath}" save_prompt '${safePrompt}'`, {
        cwd: process.cwd(),
      });
    } catch (e) {
      console.error("Pintire (save_prompt) failed:", e);
    }
  });

  // Hook: agent_end -> capture state after all tools for this prompt are done
  pi.on("agent_end", async () => {
    try {
      execSync(`"${scriptPath}" hook`, {
        cwd: process.cwd(),
      });
    } catch (e) {
      console.error("Pintire (agent_end hook) failed:", e);
    }
  });

  // Command: @pintire/status
  pi.registerCommand("pintire-status", {
    description: "Show the sync state of the shadow branch.",
    handler: async (_args, ctx) => {
      try {
        const output = execSync(`"${scriptPath}" status`, {
          cwd: process.cwd(),
          encoding: "utf-8",
        });
        ctx.ui.notify(output, "info");
      } catch (e) {
        ctx.ui.notify("Pintire status failed", "error");
      }
    },
  });
}
