#!/bin/bash
set -e

# State management
EXTENSION_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$EXTENSION_DIR/state"
mkdir -p "$STATE_DIR"
PROMPT_CACHE="$STATE_DIR/last_prompt.txt"

# Git context
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD)
BASE_HASH=$(git rev-parse --short HEAD)
SHADOW_BRANCH="pintire-$CURRENT_BRANCH-$BASE_HASH"
MAIN_HEAD=$(git rev-parse HEAD)

case "$1" in
  "save_prompt")
    # Store the prompt for the duration of the agent session
    echo "$2" > "$PROMPT_CACHE"
    ;;

  "status")
    echo "Pintire Status:"
    echo "  Current branch: $CURRENT_BRANCH"
    echo "  Base Commit:    $BASE_HASH"
    if git rev-parse --verify "$SHADOW_BRANCH" >/dev/null 2>&1; then
      AHEAD=$(git rev-list --count "$BASE_HASH..$SHADOW_BRANCH")
      echo "  Shadow branch:  $SHADOW_BRANCH (Ahead of base by $AHEAD commits)"
      echo "  Latest Shadow Message: $(git log -1 --format=%s "$SHADOW_BRANCH")"
    else
      echo "  Shadow branch:  $SHADOW_BRANCH (Not yet created)"
    fi
    ;;

  "hook")
    # 1. Initialize shadow branch if it doesn't exist
    # It always starts from the current HEAD (BASE_HASH)
    if ! git rev-parse --verify "$SHADOW_BRANCH" >/dev/null 2>&1; then
      git update-ref "refs/heads/$SHADOW_BRANCH" "$MAIN_HEAD"
    fi

    # 2. Prepare temporary index to capture dirty state
    TMP_INDEX=$(mktemp)
    export GIT_INDEX_FILE="$TMP_INDEX"
    
    # Initialize temp index from current real index to include user-staged changes
    if [ -f .git/index ]; then
      cp .git/index "$TMP_INDEX"
    fi
    
    # Stage all changes (dirty state) into the temp index
    # We use -A to capture deleted files, new files, and modified files
    git add -A
    
    # 3. Create shadow commit if there are changes compared to shadow branch HEAD
    TREE_ID=$(git write-tree)
    PARENT_ID=$(git rev-parse "$SHADOW_BRANCH")
    SHADOW_TREE=$(git rev-parse "$SHADOW_BRANCH^{tree}")
    
    if [ "$TREE_ID" != "$SHADOW_TREE" ]; then
      MESSAGE=$(cat "$PROMPT_CACHE" 2>/dev/null || echo "Shadow commit after tool use")
      # Truncate message if it's too long for a commit subject
      SUBJECT=$(echo "$MESSAGE" | head -n 1 | cut -c 1-100)
      
      # Use commit-tree to create a commit object without affecting the current branch
      COMMIT_ID=$(echo "$SUBJECT" | git commit-tree "$TREE_ID" -p "$PARENT_ID")
      
      # Update the shadow branch reference
      git update-ref "refs/heads/$SHADOW_BRANCH" "$COMMIT_ID"
    fi
    
    rm -f "$TMP_INDEX"
    ;;
esac
