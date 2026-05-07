# Pintire (Pi + Entire)

Pintire is a Pi extension that automatically captures every "vibe" into a shadow Git branch. It behaves like a lightweight, local-only version of Entire.io.

## Features
- **Auto-Shadow**: Every time Pi uses a tool (`edit`, `write`, `bash`), Pintire creates a commit on a shadow branch.
- **Context-Preserving**: The shadow branch is named `pintire-<branch>-<base-hash>`. This means if you manually commit and start a new vibe session, a new shadow branch is created, keeping your histories distinct.
- **Zero Interference**: Pintire uses a temporary Git index. It **never** touches your working directory, your staged changes, or your current branch's HEAD.
- **Intent-Linked**: The commit messages on the shadow branch are automatically set to your latest prompt.

## Usage

Once installed, it works in the background. You can check the status with:
`@pintire/status`

### Viewing History
To see what Pi has been doing:
`git log pintire-main-abc1234 --oneline` (replace with your actual shadow branch name)

### Merging Back
If you like what Pi did and want to fast-forward your main branch to the latest shadow state:
`git merge pintire-<branch>-<hash>`

## How it works
Pintire hooks into `post_tool_use`. It stages all dirty files into a temporary index file, writes a Git tree, and uses `git commit-tree` to append a new commit to the shadow branch.
