const GITHUB_STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY

function getGitHubStepSummary(): string | null {
  if (GITHUB_STEP_SUMMARY) {
    return GITHUB_STEP_SUMMARY
  }
  return null
}

export {getGitHubStepSummary}
