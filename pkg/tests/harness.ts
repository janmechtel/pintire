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

  session.subscribe(event => {
    console.log(`[Event] ${event.type}`);
  });

  console.log("\n1. Testing Shadow Branch Creation...");
  nextToolCall = { name: "write", arguments: { path: "test.txt", content: "hello world" } };
  
  process.env.PI_PROMPT = "Test prompt 1";
  await session.prompt("Do write");
  
  // Check if shadow branch exists
  const branchName = execSync("git symbolic-ref --short HEAD", { cwd: TEST_DIR }).toString().trim();
  const baseHash = execSync("git rev-parse --short HEAD", { cwd: TEST_DIR }).toString().trim();
  const shadowBranch = `pintire-${branchName}-${baseHash}`;
  
  try {
    execSync(`git rev-parse --verify ${shadowBranch}`, { cwd: TEST_DIR });
    console.log(`✅ Shadow branch ${shadowBranch} created.`);
  } catch (e) {
    throw new Error(`❌ Shadow branch ${shadowBranch} NOT created.`);
  }

  console.log("\n2. Testing Capture Changes...");
  const initialShadowHash = execSync(`git rev-parse ${shadowBranch}`, { cwd: TEST_DIR }).toString().trim();
  
  nextToolCall = { name: "write", arguments: { path: "test2.txt", content: "another file" } };
  const prompt2 = "Test prompt 2";
  process.env.PI_PROMPT = prompt2;
  await session.prompt(prompt2);
  
  const newShadowHash = execSync(`git rev-parse ${shadowBranch}`, { cwd: TEST_DIR }).toString().trim();
  if (initialShadowHash !== newShadowHash) {
    console.log("✅ Shadow branch updated with a new commit.");
    const commitMsg = execSync(`git log -1 --format=%s ${shadowBranch}`, { cwd: TEST_DIR }).toString().trim();
    console.log(`Commit message: ${commitMsg}`);
    if (commitMsg === prompt2) {
        console.log("✅ Commit message matches prompt.");
    } else {
        console.error(`❌ Commit message mismatch: expected "${prompt2}", got "${commitMsg}"`);
    }
  } else {
    throw new Error("❌ Shadow branch NOT updated.");
  }

  console.log("\n3. Testing Capture Staged Changes...");
  // Manually stage a change
  fs.writeFileSync(path.join(TEST_DIR, "manual.txt"), "manual change");
  execSync("git add manual.txt", { cwd: TEST_DIR });
  
  nextToolCall = { name: "write", arguments: { path: "test3.txt", content: "third file" } };
  const prompt3 = "Test prompt 3";
  process.env.PI_PROMPT = prompt3;
  await session.prompt(prompt3);
  
  // The shadow commit should contain both manual.txt and test3.txt
  const filesInShadow = execSync(`git ls-tree -r ${shadowBranch} --name-only`, { cwd: TEST_DIR }).toString();
  if (filesInShadow.includes("manual.txt") && filesInShadow.includes("test3.txt")) {
    console.log("✅ Shadow commit captures both tool changes and manually staged changes.");
  } else {
    console.error("Files in shadow branch:", filesInShadow);
    throw new Error("❌ Shadow commit missing expected files.");
  }

  console.log("\nAll tests passed!");
}

runTest().catch(err => {
    console.error("Test failed!");
    console.error(err);
    process.exit(1);
});
