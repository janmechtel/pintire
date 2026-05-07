# Plan: Pintire Extension (Pi + Entire)

Automatically capture AI-driven changes to a shadow branch after tool use, preserving intent and history without affecting the main working branch.

## Context
User wants a lightweight version of Entire.io / SpecStory specifically for the Pi agent. It should:
- Record every "dirty" state after an AI tool finishes.
- Use the user's prompt as the commit message.
- Store this history in a shadow branch `pintire-<branch-name>-<base-commit-hash>`. This ensures that each set of "vibe" commits is unique to the specific commit they branched from, avoiding merge/rebase conflicts.
- These branches will be strictly local (no auto-push).
- **Auto-Cleanup**: Old pintire branches that are ancestors of the current main branch or haven't been touched in N days could be pruned to avoid branch bloat.
- **Merge Back (Optional)**: If the user wants to "pull in" the AI's latest state, they can simply merge the latest pintire branch. Since the pintire branch is always ahead of the current branch, it's a clean fast-forward.

## Approach
We will use a `post_tool_use` hook to trigger a bash script. The script will use a **temporary Git index file** (`GIT_INDEX_FILE`) and `git commit-tree` to create commits directly into the Git object database and update the shadow branch reference.

### Key Logic:
1. **Shadow Branch Name**: `pintire-<current_branch>-<base_commit_short_hash>`.
2. **Branch Logic**: 
   - A new pintire branch is created whenever the base commit changes.
   - This keeps a "clean" immutable history for every point the user started "vibe coding" from.
3. **The "Shadow" Commit**:
   - `export GIT_INDEX_FILE=$(mktemp)`
   - `git add -A` (adds all dirty files to the *temporary* index)
   - `TREE_ID=$(git write-tree)`
   - `COMMIT_ID=$(echo "$MESSAGE" | git commit-tree $TREE_ID -p $PARENT_ID)`
   - `git update-ref refs/heads/$SHADOW_BRANCH $COMMIT_ID`
   - This process creates a commit without ever calling `git commit`, which would otherwise affect the current branch/index.

## Files to modify
- `.pi/extensions/pintire/extension.yaml` (Create)
- `.pi/extensions/pintire/pintire.sh` (Create)

## Reuse
- Pi Extension Hooks: `before_agent_start` (to capture the prompt) and `post_tool_use`.

## Steps
- [x] Create directory `pkg`.
- [x] Create `extension.yaml` (legacy/reference) and `index.ts` (bridge).
- [x] Create `pintire.sh` with the shadow-committing logic.
- [x] Add a `README.md` to explain how to enable/use it.
- [x] Symlink `pkg` to `~/.pi/agent/extensions/pintire`.
- [ ] Test by making an edit and checking `git log pintire-<branch>`.

## Verification
1. Run a prompt that modifies a file.
2. Check `git branch` to ensure you are still on your original branch.
3. Run `git log pintire-<current-branch>` and verify:
   - A commit exists with your prompt as the message.
   - The commit contains the changes made by the AI.
4. Manually commit on your main branch.
5. Run another AI prompt.
6. Verify the shadow branch has "reset" to start from your new manual commit.
