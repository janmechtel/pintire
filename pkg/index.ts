import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Pintire Bridge: Executes pintire.sh in response to Pi lifecycle events.
 */
export default function (pi: ExtensionAPI) {
  const scriptPath = path.join(__dirname, "pintire.sh");
  let lastPrompt = "Shadow commit after tool use";

  // Hook: before_agent_start -> capture prompt
  pi.on("before_agent_start", async (event) => {
    lastPrompt = event.prompt;
  });

  // Hook: agent_end -> capture state after all tools for this prompt are done
  pi.on("agent_end", async () => {
    try {
      // Escape prompt for shell
      const safePrompt = lastPrompt.replace(/'/g, "'\\''");
      execSync(`"${scriptPath}" hook '${safePrompt}'`, {
        cwd: process.cwd(),
      });
    } catch (e) {
      console.error("Pintire (agent_end hook) failed:", e);
    }
  });

  // Also hook into tool execution for more immediate feedback
  pi.on("tool_execution_end", async (event) => {
    if (["edit", "write", "bash"].includes(event.toolName)) {
      try {
        const safePrompt = lastPrompt.replace(/'/g, "'\\''");
        execSync(`"${scriptPath}" hook '${safePrompt}'`, {
          cwd: process.cwd(),
        });
      } catch (e) {
        // Silent failure during tool execution to avoid disrupting the agent
      }
    }
  });
}
