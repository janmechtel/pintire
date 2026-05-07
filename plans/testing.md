# Plan: Automated Testing for Pintire Extension

The goal is to create an automated test suite for the `pintire` extension that runs in a controlled environment without calling an LLM, using the `pi-coding-agent` SDK.

## Context
The `pintire` extension uses hooks (`before_agent_start`, `post_tool_use`) to capture dirty changes to a shadow branch.
To test this reliably without an LLM, we will use a programmatic approach with the `@earendil-works/pi-coding-agent` SDK and mock the model stream.

## Approach
1. **Mock LLM Provider**: Implement a custom API provider using `@earendil-works/pi-ai` that returns pre-defined tool calls and final responses.
2. **SDK Harness**: Use `createAgentSession` from `@earendil-works/pi-coding-agent` to run a session in a temporary directory.
3. **Extension Loading**: Load the `pintire` extension into the test session.
4. **Flow Simulation**:
    - Trigger `before_agent_start` (via session prompt).
    - Simulate tool calls (`write`, `edit`, `bash`) that trigger `post_tool_use`.
    - Verify git state (shadow branch creation, commits) after each step.
5. **Environment**: Use a temporary directory with a fresh git repository for each test case.

## Files to modify/create
- `pkg/tests/harness.ts`: TypeScript test harness using the SDK.
- `pkg/tests/run.sh`: Shell script to compile and run the test harness.
- `package.json`: (If needed) to manage test dependencies if they are not already available.

## Steps
- [ ] Initialize a test directory `pkg/tests`.
- [ ] Implement the `mockStream` and `registerApiProvider` in `harness.ts`.
- [ ] Implement the test cases in `harness.ts`:
    - [ ] **Test 1: Shadow Branch Creation**: Run a session, call a tool, verify `pintire-<branch>-<hash>` branch exists.
    - [ ] **Test 2: Capture Changes**: Call `write` tool, verify shadow branch has a new commit with the file content.
    - [ ] **Test 3: Capture Staged Changes**: Verify that user-staged changes are also captured in the shadow commit.
- [ ] Create a `run.sh` that sets up the environment (temp git repo) and executes the harness.

## Reuse
- `@earendil-works/pi-coding-agent` SDK for session management.
- `@earendil-works/pi-ai` for model mocking.
- Existing `pintire.sh` logic (the harness will trigger it via `pi` hooks).

## Verification
- Run `pkg/tests/run.sh` and ensure all assertions pass.
