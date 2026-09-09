#!/usr/bin/env bash
# Post this commit's PR "Feature log" section to the admin API's feature log.
#
# Runs in the deploy workflow after a push to main. Finds the PR that produced
# $GITHUB_SHA, pulls the "## Feature log" section from its description, and
# posts one 'shipped' entry. PRs with no such section (chores, docs) post
# nothing, and re-runs are safe: the API dedupes on (kind, repo, commit).
#
# Section format (in the PR body):
#
#   ## Feature log
#   **Title:** Send quotes by text
#   **Where:** [Quotes](/app/quotes) → Send → Text
#   **Summary:** Operators can text a quote link instead of emailing it.
#   **Audience:** staff        (optional — admin-console / internal work;
#                               default operators, except in admin-api)
#
# Title and Where are one line each; Where is a short path (2–3 hops), with
# an optional markdown link on the page name. Summary is the Summary line
# plus any continuation lines up to the first blank line — so a PR footer
# further down the body never leaks into it.
#
# Needs: gh (GITHUB_TOKEN), jq, curl, and
#   FEATURE_LOG_API_URL      e.g. https://snowtracker-admin-api.fly.dev
#   FEATURE_LOG_WRITE_TOKEN  the shared secret the admin API checks
set -euo pipefail

: "${GITHUB_REPOSITORY:?}" "${GITHUB_SHA:?}"
if [ -z "${FEATURE_LOG_API_URL:-}" ] || [ -z "${FEATURE_LOG_WRITE_TOKEN:-}" ]; then
  echo "feature-log: FEATURE_LOG_API_URL / FEATURE_LOG_WRITE_TOKEN not set — skipping"
  exit 0
fi

repo=${GITHUB_REPOSITORY#*/}
pr=$(gh api "repos/$GITHUB_REPOSITORY/commits/$GITHUB_SHA/pulls" --jq '.[0] // empty')
if [ -z "$pr" ]; then
  echo "feature-log: no PR found for $GITHUB_SHA — skipping"
  exit 0
fi

number=$(jq -r '.number' <<<"$pr")
url=$(jq -r '.html_url' <<<"$pr")
pr_title=$(jq -r '.title' <<<"$pr")
body=$(jq -r '.body // ""' <<<"$pr" | tr -d '\r')

# Lines between "## Feature log" and the next heading.
section=$(awk '
  tolower($0) ~ /^#+[[:space:]]*feature log[[:space:]]*$/ { on = 1; next }
  on && /^#+[[:space:]]/ { on = 0 }
  on { print }
' <<<"$body")

if [ -z "$(tr -d '[:space:]' <<<"$section")" ]; then
  echo "feature-log: PR #$number has no Feature log section — skipping"
  exit 0
fi

field() { # field <name> — first line "Name:" or "**Name:**", value after it
  sed -nE "s/^[[:space:]]*\**$1:?\**:?[[:space:]]*//Ip" <<<"$section" | head -1
}
title=$(field Title)
where=$(field Where)
# Summary: from the Summary line to the first blank line, minus anything
# that looks like an agent/session footer.
summary=$(awk '
  !on && tolower($0) ~ /^[[:space:]]*\**summary:?\**:?/ { on = 1 }
  on && /^[[:space:]]*$/ { exit }
  on { print }
' <<<"$section" \
  | sed -E 's/^[[:space:]]*\**Summary:?\**:?[[:space:]]*//I' \
  | grep -viE 'generated with|claude\.ai/code|^[[:space:]]*🤖' \
  | paste -sd ' ' - | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')
[ -n "$title" ] || title=$pr_title
audience=$(field Audience | tr '[:upper:]' '[:lower:]')
case "$audience" in
  staff|operators) ;;
  "") if [ "$repo" = "snowtracker-admin-api" ]; then audience=staff; else audience=operators; fi ;;
  *) echo "feature-log: unknown Audience '$audience' — using operators"; audience=operators ;;
esac

payload=$(jq -n \
  --arg kind shipped --arg repo "$repo" --arg title "$title" --arg summary "$summary" \
  --arg where "$where" --arg url "$url" --argjson number "$number" --arg sha "$GITHUB_SHA" \
  --arg audience "$audience" \
  '{kind:$kind, repo:$repo, title:$title, summary:$summary, where_found:$where,
    pr_url:$url, pr_number:$number, commit_sha:$sha, audience:$audience}')

echo "feature-log: posting PR #$number ($title)"
# A failed post must not fail the deploy: the entry is a record, not the
# release. It surfaces as a workflow warning and as a gap on the Overview.
if curl -fsS -X POST "$FEATURE_LOG_API_URL/v1/feature-log" \
  -H "Content-Type: application/json" \
  -H "X-Feature-Log-Token: $FEATURE_LOG_WRITE_TOKEN" \
  --data "$payload" >/dev/null; then
  echo "feature-log: posted"
else
  echo "::warning::feature-log: post failed for PR #$number — add it by hand or re-run the job"
fi
