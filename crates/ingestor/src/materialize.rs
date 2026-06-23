use sqlx::PgPool;
use std::sync::Arc;

pub async fn event(
    db: &PgPool,
    _gh: &Arc<octocrab::Octocrab>,
    event_type: &str,
    payload: &serde_json::Value,
) -> anyhow::Result<()> {
    match event_type {
        "pull_request" => handle_pr_event(db, payload).await?,
        "workflow_run" => handle_workflow_event(db, payload).await?,
        "issues" => handle_issue_event(db, payload).await?,
        "release" => handle_release_event(db, payload).await?,
        "push" => handle_push_event(db, _gh, payload).await?,
        _ => {},
    }
    Ok(())
}

async fn repo_id_from_payload(db: &PgPool, payload: &serde_json::Value) -> anyhow::Result<i32> {
    let owner = payload["repository"]["owner"]["login"]
        .as_str()
        .unwrap_or("autonomic-ai-dev");
    let name = payload["repository"]["name"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing repo name"))?;

    Ok(sqlx::query_scalar(
        "SELECT id FROM repositories WHERE owner = $1 AND name = $2",
    )
    .bind(owner)
    .bind(name)
    .fetch_one(db)
    .await?)
}

async fn handle_pr_event(db: &PgPool, payload: &serde_json::Value) -> anyhow::Result<()> {
    let rid = repo_id_from_payload(db, payload).await?;
    let pr = &payload["pull_request"];
    let action = payload["action"].as_str().unwrap_or("opened");

    if action == "closed" {
        let merged = pr["merged"].as_bool().unwrap_or(false);
        let state = if merged { "merged" } else { "closed" };

        sqlx::query(
            r#"
            UPDATE pull_requests SET state = $1, merged_at = $2, closed_at = $2, updated_at = NOW()
            WHERE repo_id = $3 AND number = $4
            "#,
        )
        .bind(state)
        .bind(pr["merged_at"].as_str().or(pr["closed_at"].as_str()))
        .bind(rid)
        .bind(pr["number"].as_i64().unwrap_or(0) as i32)
        .execute(db)
        .await?;
        return Ok(());
    }

    let labels: Vec<String> = pr["labels"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|l| l["name"].as_str().map(String::from)).collect())
        .unwrap_or_default();

    let assignees: Vec<String> = pr["assignees"]
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
          updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(rid)
    .bind(pr["number"].as_i64().unwrap_or(0) as i32)
    .bind(pr["title"].as_str().unwrap_or(""))
    .bind(pr["user"]["login"].as_str().unwrap_or("unknown"))
    .bind(pr["draft"].as_bool().unwrap_or(false))
    .bind(pr["mergeable"].as_str().unwrap_or("UNKNOWN"))
    .bind(pr["head"]["ref"].as_str())
    .bind(pr["base"]["ref"].as_str())
    .bind(&labels)
    .bind(&assignees)
    .bind(pr["created_at"].as_str())
    .bind(pr["updated_at"].as_str())
    .bind(pr["merged_at"].as_str())
    .bind(pr["closed_at"].as_str())
    .execute(db)
    .await?;

    Ok(())
}

async fn handle_workflow_event(db: &PgPool, payload: &serde_json::Value) -> anyhow::Result<()> {
    let rid = repo_id_from_payload(db, payload).await?;
    let wf = &payload["workflow_run"];

    let started_at = wf["run_started_at"].as_str();
    let completed_at = wf["updated_at"].as_str();
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
    .bind(wf["id"].as_i64().unwrap_or(0))
    .bind(rid)
    .bind(wf["run_number"].as_i64().unwrap_or(0) as i32)
    .bind(wf["name"].as_str().unwrap_or("unknown"))
    .bind(wf["status"].as_str().unwrap_or("unknown"))
    .bind(wf["conclusion"].as_str())
    .bind(wf["head_sha"].as_str().unwrap_or(""))
    .bind(wf["head_branch"].as_str())
    .bind(wf["actor"]["login"].as_str())
    .bind(wf["event"].as_str())
    .bind(started_at)
    .bind(completed_at)
    .bind(duration)
    .execute(db)
    .await?;

    Ok(())
}

async fn handle_issue_event(db: &PgPool, payload: &serde_json::Value) -> anyhow::Result<()> {
    let rid = repo_id_from_payload(db, payload).await?;
    let issue = &payload["issue"];
    let action = payload["action"].as_str().unwrap_or("opened");

    let labels: Vec<String> = issue["labels"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|l| l["name"].as_str().map(String::from)).collect())
        .unwrap_or_default();

    let assignees: Vec<String> = issue["assignees"]
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
          title = EXCLUDED.title, author = EXCLUDED.author,
          state = EXCLUDED.state, labels = EXCLUDED.labels,
          assignees = EXCLUDED.assignees, updated_at = EXCLUDED.updated_at,
          closed_at = EXCLUDED.closed_at
        "#,
    )
    .bind(rid)
    .bind(issue["number"].as_i64().unwrap_or(0) as i32)
    .bind(issue["title"].as_str().unwrap_or(""))
    .bind(issue["user"]["login"].as_str().unwrap_or("unknown"))
    .bind(if action == "closed" { "closed" } else { issue["state"].as_str().unwrap_or("open") })
    .bind(&labels)
    .bind(&assignees)
    .bind(issue["created_at"].as_str())
    .bind(issue["updated_at"].as_str())
    .bind(issue["closed_at"].as_str())
    .execute(db)
    .await?;

    Ok(())
}

async fn handle_release_event(db: &PgPool, payload: &serde_json::Value) -> anyhow::Result<()> {
    let rid = repo_id_from_payload(db, payload).await?;
    let rel = &payload["release"];
    let action = payload["action"].as_str().unwrap_or("published");

    if action == "deleted" || action == "unpublished" {
        sqlx::query("DELETE FROM releases WHERE repo_id = $1 AND tag = $2")
            .bind(rid)
            .bind(rel["tag_name"].as_str().unwrap_or(""))
            .execute(db)
            .await?;
        return Ok(());
    }

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
    .bind(rel["tag_name"].as_str().unwrap_or(""))
    .bind(rel["author"]["login"].as_str())
    .bind(rel["draft"].as_bool().unwrap_or(false))
    .bind(rel["prerelease"].as_bool().unwrap_or(false))
    .bind(rel["published_at"].as_str())
    .execute(db)
    .await?;

    Ok(())
}

async fn handle_push_event(
    db: &PgPool,
    gh: &Arc<octocrab::Octocrab>,
    payload: &serde_json::Value,
) -> anyhow::Result<()> {
    // Check if README was modified
    let modified: Vec<String> = payload["commits"]
        .as_array()
        .map(|commits| {
            commits
                .iter()
                .flat_map(|c| {
                    c["modified"]
                        .as_array()
                        .cloned()
                        .unwrap_or_default()
                })
                .filter_map(|f| f.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    if !modified.iter().any(|f| f == "README.md") {
        return Ok(());
    }

    let owner = payload["repository"]["owner"]["login"]
        .as_str()
        .unwrap_or("autonomic-ai-dev");
    let name = payload["repository"]["name"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing repo name"))?;

    match gh.repos(owner, name).get_readme().send().await {
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

            let rid = repo_id_from_payload(db, payload).await?;
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
            .execute(db)
            .await?;
        },
        Err(e) => {
            tracing::warn!("failed to fetch README after push: {e}");
        },
    }

    Ok(())
}
