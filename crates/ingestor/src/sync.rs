use crate::AppState;
use serde_json::Value;
use sqlx::PgPool;
use std::time::Duration;

const REPOS: &[&str] = &[
    "agent-body", "agent-brain", "agent-eyes", "agent-heart",
    "agent-immune", "agent-mouth", "agent-muscle", "agent-nerves",
    "agent-spine",
];

pub async fn run_loop(state: AppState) {
    sync_all(&state).await;

    loop {
        tokio::time::sleep(Duration::from_secs(300)).await;
        sync_all(&state).await;
    }
}

async fn sync_all(state: &AppState) {
    for name in REPOS {
        tracing::info!("syncing {name}");

        if let Err(e) = sqlx::query(
            "INSERT INTO repositories (name, owner)
             VALUES ($1, 'autonomic-ai-dev')
             ON CONFLICT (owner, name) DO UPDATE SET updated_at = NOW()",
        )
        .bind(name)
        .execute(&state.db)
        .await
        {
            tracing::error!("failed to upsert repo {name}: {e}");
            continue;
        }

        if let Err(e) = sync_pulls(state, name).await {
            tracing::error!("sync_pulls failed for {name}: {e}");
        }
        if let Err(e) = sync_issues(state, name).await {
            tracing::error!("sync_issues failed for {name}: {e}");
        }
        if let Err(e) = sync_workflows(state, name).await {
            tracing::error!("sync_workflows failed for {name}: {e}");
        }
        if let Err(e) = sync_releases(state, name).await {
            tracing::error!("sync_releases failed for {name}: {e}");
        }
        if let Err(e) = sync_readme_and_head(state, name).await {
            tracing::error!("sync_readme failed for {name}: {e}");
        }
    }
}

// ── Helpers ──

async fn repo_id(db: &PgPool, name: &str) -> anyhow::Result<i32> {
    Ok(
        sqlx::query_scalar(
            "SELECT id FROM repositories WHERE owner = 'autonomic-ai-dev' AND name = $1",
        )
        .bind(name)
        .fetch_one(db)
        .await?,
    )
}

async fn graphql(
    state: &AppState,
    query: &str,
    variables: Value,
) -> anyhow::Result<Value> {
    let token = std::env::var("GITHUB_TOKEN")?;
    let body = serde_json::json!({ "query": query, "variables": variables });
    let resp = state
        .client
        .post("https://api.github.com/graphql")
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", "github-ingestor")
        .json(&body)
        .send()
        .await?;

    let data: Value = resp.json().await?;
    if let Some(errors) = data["errors"].as_array() {
        anyhow::bail!("GraphQL errors: {errors:?}");
    }
    Ok(data)
}

// ── Pull Requests ──

async fn sync_pulls(state: &AppState, name: &str) -> anyhow::Result<()> {
    let rid = repo_id(&state.db, name).await?;
    let owner = "autonomic-ai-dev";

    let query = r#"
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          pullRequests(first: 20, states: OPEN) {
            nodes {
              number
              title
              author { login }
              labels(first: 10) { nodes { name } }
              assignees(first: 10) { nodes { login } }
              isDraft
              mergeable
              headRefName
              baseRefName
              createdAt
              updatedAt
              mergedAt
              closedAt
              commits(last: 1) {
                nodes {
                  commit {
                    checkSuites(first: 20) {
                      nodes {
                        app { name }
                        status
                        conclusion
                        workflowRun { databaseId }
                      }
                    }
                  }
                }
              }
            }
            totalCount
          }
        }
      }
    "#;

    let data = graphql(state, query, serde_json::json!({ "owner": owner, "repo": name })).await?;

    let prs = data["data"]["repository"]["pullRequests"]["nodes"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    for pr in &prs {
        let labels: Vec<String> = pr["labels"]["nodes"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|l| l["name"].as_str().map(String::from)).collect())
            .unwrap_or_default();

        let assignees: Vec<String> = pr["assignees"]["nodes"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|a| a["login"].as_str().map(String::from)).collect())
            .unwrap_or_default();

        sqlx::query(
            r#"
            INSERT INTO pull_requests
              (repo_id, number, title, author, state, is_draft, mergeable,
               head_ref, base_ref, labels, assignees,
               created_at, updated_at, merged_at, closed_at)
            VALUES ($1, $2, $3, $4, 'open', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (repo_id, number) DO UPDATE SET
              title = EXCLUDED.title, author = EXCLUDED.author, state = 'open',
              is_draft = EXCLUDED.is_draft, mergeable = EXCLUDED.mergeable,
              head_ref = EXCLUDED.head_ref, base_ref = EXCLUDED.base_ref,
              labels = EXCLUDED.labels, assignees = EXCLUDED.assignees,
              updated_at = EXCLUDED.updated_at, merged_at = EXCLUDED.merged_at,
              closed_at = EXCLUDED.closed_at
            "#,
        )
        .bind(rid)
        .bind(pr["number"].as_i64().unwrap_or(0) as i32)
        .bind(pr["title"].as_str().unwrap_or(""))
        .bind(pr["author"]["login"].as_str().unwrap_or("unknown"))
        .bind(pr["isDraft"].as_bool().unwrap_or(false))
        .bind(pr["mergeable"].as_str().unwrap_or("UNKNOWN"))
        .bind(pr["headRefName"].as_str())
        .bind(pr["baseRefName"].as_str())
        .bind(&labels)
        .bind(&assignees)
        .bind(pr["createdAt"].as_str())
        .bind(pr["updatedAt"].as_str())
        .bind(pr["mergedAt"].as_str())
        .bind(pr["closedAt"].as_str())
        .execute(&state.db)
        .await?;
    }

    tracing::info!("synced {} PRs for {name}", prs.len());
    Ok(())
}

// ── Issues ──

async fn sync_issues(state: &AppState, name: &str) -> anyhow::Result<()> {
    let rid = repo_id(&state.db, name).await?;
    let owner = "autonomic-ai-dev";

    let query = r#"
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          issues(first: 20, states: OPEN, orderBy: { field: CREATED_AT, direction: DESC }) {
            nodes {
              number
              title
              author { login }
              labels(first: 10) { nodes { name } }
              assignees(first: 10) { nodes { login } }
              state
              createdAt
              updatedAt
              closedAt
            }
            totalCount
          }
        }
      }
    "#;

    let data = graphql(state, query, serde_json::json!({ "owner": owner, "repo": name })).await?;

    let issues = data["data"]["repository"]["issues"]["nodes"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    for issue in &issues {
        let labels: Vec<String> = issue["labels"]["nodes"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|l| l["name"].as_str().map(String::from)).collect())
            .unwrap_or_default();

        let assignees: Vec<String> = issue["assignees"]["nodes"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|a| a["login"].as_str().map(String::from)).collect())
            .unwrap_or_default();

        sqlx::query(
            r#"
            INSERT INTO issues
              (repo_id, number, title, author, state, labels, assignees,
               created_at, updated_at, closed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (repo_id, number) DO UPDATE SET
              title = EXCLUDED.title, author = EXCLUDED.author, state = EXCLUDED.state,
              labels = EXCLUDED.labels, assignees = EXCLUDED.assignees,
              updated_at = EXCLUDED.updated_at, closed_at = EXCLUDED.closed_at
            "#,
        )
        .bind(rid)
        .bind(issue["number"].as_i64().unwrap_or(0) as i32)
        .bind(issue["title"].as_str().unwrap_or(""))
        .bind(issue["author"]["login"].as_str().unwrap_or("unknown"))
        .bind(issue["state"].as_str().unwrap_or("open"))
        .bind(&labels)
        .bind(&assignees)
        .bind(issue["createdAt"].as_str())
        .bind(issue["updatedAt"].as_str())
        .bind(issue["closedAt"].as_str())
        .execute(&state.db)
        .await?;
    }

    tracing::info!("synced {} issues for {name}", issues.len());
    Ok(())
}

// ── Workflow Runs ──

async fn sync_workflows(state: &AppState, name: &str) -> anyhow::Result<()> {
    let rid = repo_id(&state.db, name).await?;
    let owner = "autonomic-ai-dev";

    let token = std::env::var("GITHUB_TOKEN")?;
    let url = format!("https://api.github.com/repos/{owner}/{name}/actions/runs?per_page=20");
    let resp = state
        .client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", "github-ingestor")
        .send()
        .await?;

    let data: Value = resp.json().await?;
    let runs = data["workflow_runs"].as_array().cloned().unwrap_or_default();

    for run in &runs {
        let started_at = run["run_started_at"].as_str();
        let completed_at = run["updated_at"].as_str();
        let duration = started_at.and_then(|s| {
            completed_at.and_then(|e| {
                let start = chrono::DateTime::parse_from_rfc3339(s).ok()?;
                let end = chrono::DateTime::parse_from_rfc3339(e).ok()?;
                Some((end - start).num_seconds() as i32)
            })
        });

        sqlx::query(
            r#"
            INSERT INTO workflow_runs
              (run_id, repo_id, run_number, workflow_name, status, conclusion,
               head_sha, branch, actor, event, started_at, completed_at, duration_seconds)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (repo_id, run_id) DO UPDATE SET
              status = EXCLUDED.status, conclusion = EXCLUDED.conclusion,
              head_sha = EXCLUDED.head_sha, branch = EXCLUDED.branch,
              actor = EXCLUDED.actor, event = EXCLUDED.event,
              started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at,
              duration_seconds = EXCLUDED.duration_seconds
            "#,
        )
        .bind(run["id"].as_i64().unwrap_or(0))
        .bind(rid)
        .bind(run["run_number"].as_i64().unwrap_or(0) as i32)
        .bind(run["name"].as_str().unwrap_or("unknown"))
        .bind(run["status"].as_str().unwrap_or("unknown"))
        .bind(run["conclusion"].as_str())
        .bind(run["head_sha"].as_str().unwrap_or(""))
        .bind(run["head_branch"].as_str())
        .bind(run["actor"]["login"].as_str())
        .bind(run["event"].as_str())
        .bind(started_at)
        .bind(completed_at)
        .bind(duration)
        .execute(&state.db)
        .await?;
    }

    tracing::info!("synced {} workflow runs for {name}", runs.len());
    Ok(())
}

// ── Releases ──

async fn sync_releases(state: &AppState, name: &str) -> anyhow::Result<()> {
    let rid = repo_id(&state.db, name).await?;
    let owner = "autonomic-ai-dev";

    let query = r#"
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          releases(first: 20, orderBy: { field: CREATED_AT, direction: DESC }) {
            nodes {
              tagName
              author { login }
              isDraft
              isPrerelease
              publishedAt
            }
          }
        }
      }
    "#;

    let data = graphql(state, query, serde_json::json!({ "owner": owner, "repo": name })).await?;

    let releases = data["data"]["repository"]["releases"]["nodes"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    for rel in &releases {
        sqlx::query(
            r#"
            INSERT INTO releases
              (repo_id, tag, author, is_draft, is_prerelease, published_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (repo_id, tag) DO UPDATE SET
              author = EXCLUDED.author, is_draft = EXCLUDED.is_draft,
              is_prerelease = EXCLUDED.is_prerelease, published_at = EXCLUDED.published_at
            "#,
        )
        .bind(rid)
        .bind(rel["tagName"].as_str().unwrap_or(""))
        .bind(rel["author"]["login"].as_str())
        .bind(rel["isDraft"].as_bool().unwrap_or(false))
        .bind(rel["isPrerelease"].as_bool().unwrap_or(false))
        .bind(rel["publishedAt"].as_str())
        .execute(&state.db)
        .await?;
    }

    tracing::info!("synced {} releases for {name}", releases.len());
    Ok(())
}

// ── README + Head ──

async fn sync_readme_and_head(state: &AppState, name: &str) -> anyhow::Result<()> {
    let rid = repo_id(&state.db, name).await?;
    let owner = "autonomic-ai-dev";

    let query = r#"
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          defaultBranchRef {
            name
            target { ... on Commit { oid } }
          }
          refs(refPrefix: "refs/tags/", first: 5, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
            nodes {
              name
            }
          }
        }
      }
    "#;

    let data = graphql(state, query, serde_json::json!({ "owner": owner, "repo": name })).await?;
    let repo_info = &data["data"]["repository"];

    let head_sha = repo_info["defaultBranchRef"]["target"]["oid"]
        .as_str()
        .map(String::from);

    let latest_tag = repo_info["refs"]["nodes"]
        .as_array()
        .and_then(|nodes| nodes.first())
        .and_then(|n| n["name"].as_str().map(|s| s.trim_start_matches("refs/tags/").to_string()));

    sqlx::query(
        "UPDATE repositories SET head_sha = $1, latest_tag = $2, updated_at = NOW() WHERE id = $3",
    )
    .bind(&head_sha)
    .bind(&latest_tag)
    .bind(rid)
    .execute(&state.db)
    .await?;

    // Fetch README via octocrab
    match state.gh.repos(owner, name).get_readme().send().await {
        Ok(readme) => {
            let content = readme.content.as_deref()
                .and_then(|c| {
                    use base64::Engine as _;
                    base64::engine::general_purpose::STANDARD
                        .decode(c.replace('\n', "").replace('\r', ""))
                        .ok()
                        .and_then(|bytes| String::from_utf8(bytes).ok())
                })
                .unwrap_or_default();

            sqlx::query(
                r#"
                INSERT INTO readmes (repo_id, content, html, updated_at)
                VALUES ($1, $2, '', NOW())
                ON CONFLICT (repo_id) DO UPDATE SET
                  content = EXCLUDED.content, html = '', updated_at = NOW()
                "#,
            )
            .bind(rid)
            .bind(&content)
            .execute(&state.db)
            .await?;
        },
        Err(e) => {
            tracing::warn!("failed to fetch README for {name}: {e}");
        },
    }

    tracing::info!("synced head/readme for {name}");
    Ok(())
}
