---
safe-outputs:
  threat-detection:
    continue-on-error: false
    engine:
      id: copilot
      model: claude-sonnet-5
jobs:
  close-superseded:
    needs: [safe_outputs]
    if: needs.safe_outputs.outputs.created_pr_number != ''
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - name: Close older pull requests from this updater
        env:
          GH_TOKEN: ${{ github.token }}
          WORKFLOW_ID: ${{ github.workflow }}
          NEW_PR: ${{ needs.safe_outputs.outputs.created_pr_number }}
        run: |
          base=$(gh pr view "$NEW_PR" --repo "$GITHUB_REPOSITORY" --json baseRefName --jq .baseRefName)
          marker="<!-- gh-aw-workflow-id: $WORKFLOW_ID -->"
          older=$(gh api --paginate "repos/$GITHUB_REPOSITORY/pulls?state=open&per_page=100" |
            jq -r --arg marker "$marker" --arg base "$base" --argjson new "$NEW_PR" '
              .[] | select(.number < $new and .base.ref == $base
                and .user.login == "github-actions[bot]"
                and .head.repo.full_name == .base.repo.full_name
                and ((.body // "") | split("\n") | index($marker) != null)) | .number
            ')
          while IFS= read -r pr; do
            if [ -n "$pr" ]; then
              gh pr close "$pr" --repo "$GITHUB_REPOSITORY" --comment "Superseded by #$NEW_PR."
            fi
          done <<< "$older"
---
