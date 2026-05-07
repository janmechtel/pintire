import {
  type Api,
  type Context,
  type Model,
  registerApiProvider,
  AssistantMessageEventStream
} from "@earendil-works/pi-ai";
import {
  AuthStorage,
  ModelRegistry,
  createAgentSession,
  SessionManager,
  discoverAndLoadExtensions,
} from "@earendil-works/pi-coding-agent";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const TEST_DIR = path.resolve("pkg/tests/tmp-repo");
const EXTENSION_PATH = path.resolve("pkg");

function setupRepo() {
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
    execSync("git init", { cwd: TEST_DIR });
    execSync('git config user.email "test@example.com"', { cwd: TEST_DIR });
    execSync('git config user.name "Test User"', { cwd: TEST_DIR });
    fs.writeFileSync(path.join(TEST_DIR, "initial.txt"), "hello");
    execSync("git add initial.txt", { cwd: TEST_DIR });
    execSync('git commit -m "initial commit"', { cwd: TEST_DIR });
}

let nextToolCall: { name: string, arguments: any } | null = null;

const mockStream = (model: Model<Api>, context: Context) => {
  const stream = new AssistantMessageEventStream();
  
  setTimeout(() => {
    const lastMessage = context.messages[context.messages.length - 1];

    if (lastMessage.role === "toolResult" || !nextToolCall) {
      const msg = {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "Done!" }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        stopReason: "stop" as const,
        usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        timestamp: Date.now()
      };

      stream.push({ type: "start", partial: msg });
      stream.push({ type: "text_start", contentIndex: 0, partial: msg });
      stream.push({ type: "text_delta", contentIndex: 0, delta: "Done!", partial: msg });
      stream.push({ type: "text_end", contentIndex: 0, content: "Done!", partial: msg });
      stream.push({ type: "done", reason: "stop", message: msg });
      stream.end(msg);
      return;
    }

    const toolCall = {
      type: "toolCall" as const,
      id: "call_" + Math.random().toString(36).substring(2, 9),
      name: nextToolCall.name,
      arguments: nextToolCall.arguments
    };

    const msg = {
      role: "assistant" as const,
      content: [toolCall],
      api: model.api,
      provider: model.provider,
      model: model.id,
      stopReason: "toolUse" as const,
      usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      timestamp: Date.now()
    };

    stream.push({ type: "start", partial: msg });
    stream.push({ type: "toolcall_start", contentIndex: 0, partial: msg });
    stream.push({ type: "toolcall_delta", contentIndex: 0, delta: JSON.stringify(toolCall.arguments), partial: msg });
    stream.push({ type: "toolcall_end", contentIndex: 0, toolCall, partial: msg });
    stream.push({ type: "done", reason: "toolUse", message: msg });
    stream.end(msg);
    
    nextToolCall = null; // Reset for next turn
  }, 10);

  return stream;
};

registerApiProvider({
  api: "mock-api" as Api,
  stream: mockStream,
  streamSimple: mockStream as any
});

async function runTest() {
  const mockModel: Model<Api> = {
    id: "mock-model",
    name: "Mock Model",
    api: "mock-api" as Api,
    provider: "mock",
    baseUrl: "http://localhost",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 100000,
    maxTokens: 4000
  };

  console.log("Setting up repo...");
  setupRepo();

  // Change process CWD to TEST_DIR so extension hooks use the correct directory
  process.chdir(TEST_DIR);
  console.log(`Changed CWD to ${process.cwd()}`);

  // Clean up previous state
  const stateDir = path.join(EXTENSION_PATH, "state");
  if (fs.existsSync(stateDir)) {
      fs.rmSync(stateDir, { recursive: true, force: true });
  }

  const authStorage = AuthStorage.inMemory();
  authStorage.set("mock", { type: "apiKey", key: "dummy" });
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  
  // Load extensions
  console.log(`Loading extensions from ${EXTENSION_PATH}...`);
  const extensionsResult = await discoverAndLoadExtensions([EXTENSION_PATH], TEST_DIR);
  console.log(`Loaded ${extensionsResult.extensions.length} extensions`);

  const { session } = await createAgentSession({
    model: mockModel,
    authStorage,
    modelRegistry,
    cwd: TEST_DIR,
    sessionManager: SessionManager.inMemory(),
    extensions: extensionsResult.extensions
  });

  console.log("\n1. Running 3 Prompts...");
  for (let i = 1; i <= 3; i++) {
    nextToolCall = { name: "write", arguments: { path: `test${i}.txt`, content: `content ${i}` } };
    process.env.PI_PROMPT = `Prompt ${i}`;
    await session.prompt(`Do prompt ${i}`);
  }

  console.log("\n2. Manual promotion of AI work to main branch...");
  // First, stage and commit the AI work on main (dirty promote)
  execSync("git add .", { cwd: TEST_DIR });
  execSync('git commit -m "Manual commit (incorporating AI work 1-3)"', { cwd: TEST_DIR });
  
  // Now merge the shadow branch to link histories and avoid future diamonds
  execSync("git merge pintire-main -m 'Link AI history'", { cwd: TEST_DIR });
  
  // User adds a manual commit on top
  fs.writeFileSync(path.join(TEST_DIR, "manual.txt"), "manual content");
  execSync("git add manual.txt", { cwd: TEST_DIR });
  execSync('git commit -m "Manual tweak after promoting AI work"', { cwd: TEST_DIR });

  console.log("\n3. Running 3 more Prompts...");
  for (let i = 4; i <= 6; i++) {
    nextToolCall = { name: "write", arguments: { path: `test${i}.txt`, content: `content ${i}` } };
    process.env.PI_PROMPT = `Prompt ${i}`;
    await session.prompt(`Do prompt ${i}`);
  }

  console.log("\nFinal Git History (All branches):");
  const log = execSync("git log --all --oneline --graph --decorate", { cwd: TEST_DIR }).toString();
  console.log(log);

  console.log("\nVerifying results...");
  const branches = execSync("git branch", { cwd: TEST_DIR }).toString();
  console.log("Branches:\n" + branches);

  if (branches.includes("pintire-main")) {
      console.log("✅ Shadow branch created.");
  } else {
      throw new Error("❌ No shadow branch found.");
  }

  console.log("\nAll tests finished!");
}

runTest().catch(err => {
    console.error("Test failed!");
    console.error(err);
    process.exit(1);
});
