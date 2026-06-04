#!/usr/bin/env zsh
# Utility to safely commit and push local changes, and optionally open a PR with gh.
# Usage:
#   ./scripts/push_and_pr.sh "commit message" [new-branch-name] [--pr]
# Examples:
#   ./scripts/push_and_pr.sh "fix: correct typo"                # commit + push current branch
#   ./scripts/push_and_pr.sh "feat: add X" feature/add-x --pr  # create branch, commit, push, open PR (requires gh)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

if [ ! -d .git ]; then
  echo "Error: not inside a git repository: $REPO_DIR"
  exit 1
fi

BRANCH_CURRENT=$(git rev-parse --abbrev-ref HEAD)

echo "Repository: $REPO_DIR"
echo "Current branch: $BRANCH_CURRENT"

git fetch origin --prune

echo "\nStatus:" 
git status --short --branch

PORCELAIN=$(git status --porcelain)
if [ -z "$PORCELAIN" ]; then
  echo "\nNo working-tree changes detected."
else
  echo "\nUncommitted changes detected:" 
  git status --short
fi

# Parse args
MSG="${1-}"
BRANCH_ARG="${2-}"
PR_FLAG="${3-}"

if [ -n "$BRANCH_ARG" ]; then
  echo "\nCreating and switching to branch: $BRANCH_ARG"
  git checkout -b "$BRANCH_ARG"
  BRANCH="$BRANCH_ARG"
else
  BRANCH="$BRANCH_CURRENT"
fi

if [ -z "$MSG" ]; then
  if [ -z "$PORCELAIN" ]; then
    echo "Nothing to commit and no commit message provided. Will just push the branch '$BRANCH'."
  else
    echo "\nEnter commit message (empty to abort):"
    read -r MSG
    if [ -z "$MSG" ]; then
      echo "Aborted: no commit message provided." 
      exit 1
    fi
  fi
fi

if [ -n "$PORCELAIN" ]; then
  echo "\nStaging changes..."
  git add -A
  echo "Committing: $MSG"
  # If there are no changes to commit (race), allow proceed
  if ! git commit -m "$MSG"; then
    echo "Note: nothing was committed (no staged changes or commit failed)."
  fi
fi

echo "\nPushing branch '$BRANCH' to origin (set upstream if needed)..."
# push and set upstream for new branches
git push -u origin "$BRANCH"

if [ "$PR_FLAG" = "--pr" ] || [ "$PR_FLAG" = "pr" ]; then
  if command -v gh >/dev/null 2>&1; then
    echo "\nCreating PR with gh..."
    gh pr create --fill
  else
    echo "\ngh CLI not available. Install it from https://cli.github.com/ to create PRs from the CLI."
  fi
fi

echo "\nPush complete. Verify on GitHub or with 'git log origin/$BRANCH -n 10'."
exit 0
