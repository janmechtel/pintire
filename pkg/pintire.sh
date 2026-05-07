#!/bin/bash
set -e

# Git context
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD)
SHADOW_BRANCH="pintire-$CURRENT_BRANCH"
MAIN_HEAD=$(git rev-parse HEAD)

case "$1" in
  "hook")
    # 1. Initialize shadow branch if it doesn't exist
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
    git add -A
    
    # 3. Create shadow commit if there are changes compared to shadow branch HEAD
    TREE_ID=$(git write-tree)
    PARENT_ID=$(git rev-parse "$SHADOW_BRANCH")
    SHADOW_TREE=$(git rev-parse "$SHADOW_BRANCH^{tree}")
    
    if [ "$TREE_ID" != "$SHADOW_TREE" ]; then
      # Use provided message as second argument, or default
      MESSAGE="${2:-Shadow commit after tool use}"
      SUBJECT=$(echo "$MESSAGE" | head -n 1 | cut -c 1-100)
      
      # Determine parents logic:
      # 1. If MAIN_HEAD is a descendant of PARENT_ID (user merged or committed AI work), 
      #    we should follow MAIN_HEAD.
      # 2. If PARENT_ID is a descendant of MAIN_HEAD (normal case), 
      #    we should follow PARENT_ID.
      # 3. If they have diverged, we merge them, prioritizing MAIN_HEAD as first parent.
      
      if git merge-base --is-ancestor "$PARENT_ID" "$MAIN_HEAD"; then
        PARENTS="-p $MAIN_HEAD"
      elif git merge-base --is-ancestor "$MAIN_HEAD" "$PARENT_ID"; then
        PARENTS="-p $PARENT_ID"
      else
        PARENTS="-p $MAIN_HEAD -p $PARENT_ID"
      fi

      COMMIT_ID=$(echo "$SUBJECT" | git commit-tree "$TREE_ID" $PARENTS)
      
      # Update the shadow branch reference
      git update-ref "refs/heads/$SHADOW_BRANCH" "$COMMIT_ID"
    fi
    
    rm -f "$TMP_INDEX"
    ;;
esac
