#!/bin/bash
set -e

# Git context
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD)
BASE_HASH=$(git rev-parse --short HEAD)
SHADOW_BRANCH="pintire-$CURRENT_BRANCH-$BASE_HASH"
MAIN_HEAD=$(git rev-parse HEAD)

case "$1" in
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
      # Use provided message as second argument, or default
      MESSAGE="${2:-Shadow commit after tool use}"
      
      # Truncate message if it's too long for a commit subject
      SUBJECT=$(echo "$MESSAGE" | head -n 1 | cut -c 1-100)
      
<<<<<<< HEAD
      # Use commit-tree to create a commit object without affecting the current branch
      COMMIT_ID=$(echo "$SUBJECT" | git commit-tree "$TREE_ID" -p "$PARENT_ID")
=======
      # Determine parents
      # Default: extend shadow branch history
      PARENTS="-p $PARENT_ID"
      
      # If MAIN_HEAD is not an ancestor of PARENT_ID, it means the real branch has moved.
      if ! git merge-base --is-ancestor "$MAIN_HEAD" "$PARENT_ID"; then
        # Check the inverse: has the shadow branch moved past the real branch?
        # If it has, we just keep extending PARENT_ID.
        # If not, we merge MAIN_HEAD in.
        if ! git merge-base --is-ancestor "$PARENT_ID" "$MAIN_HEAD"; then
           # Diverged: Merge both
           PARENTS="-p $PARENT_ID -p $MAIN_HEAD"
        else
           # Real branch is ahead of shadow branch (initial state or manual commit)
           PARENTS="-p $MAIN_HEAD -p $PARENT_ID"
        fi
      fi

      COMMIT_ID=$(echo "$SUBJECT" | git commit-tree "$TREE_ID" $PARENTS)
>>>>>>> 7bd9f02 (/tmp/pi-clipboard-31d3166c-beb2-4955-90f3-844fd9ba83a3.png yeah it looks pretty nice, but I don't un)
      
      # Update the shadow branch reference
      git update-ref "refs/heads/$SHADOW_BRANCH" "$COMMIT_ID"
    fi
    
    rm -f "$TMP_INDEX"
    ;;
esac
