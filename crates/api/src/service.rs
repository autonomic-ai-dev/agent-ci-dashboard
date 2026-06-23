use crate::AppState;
use base64::Engine as _;
use chrono::{DateTime, Utc};
use insights_proto::insights_service_server::InsightsService;
use insights_proto::*;
use serde_json::Value;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{async_trait, Request, Response, Status};

pub struct InsightsServiceImpl {
    state: AppState,
}

impl InsightsServiceImpl {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }
}

// ── helpers ──

fn ts(dt: Option<DateTime<Utc>>) -> i64 {
    dt.map(|d| d.timestamp()).unwrap_or(0)
}

async fn gh_post(state: &AppState, path: &str, body: Value) -> Result<Value, Status> {
    let token = std::env::var("GITHUB_TOKEN").map_err(|_| Status::internal("GITHUB_TOKEN not set"))?;
    let url = format!("https://api.github.com{path}");
    let resp = state
        .client
        .post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", "insights-api")
        .header("Accept", "application/vnd.github+json")
        .json(&body)
        .send()
        .await
        .map_err(|e| Status::internal(format!("request failed: {e}")))?;

    let status = resp.status();
    let data: Value = resp
        .json()
        .await
        .map_err(|e| Status::internal(format!("parse failed: {e}")))?;

    if !status.is_success() {
        return Err(Status::internal(format!(
            "GitHub API {}: {}",
            status,
            data["message"].as_str().unwrap_or("unknown")
        )));
    }
    Ok(data)
}

async fn gh_get(state: &AppState, path: &str) -> Result<Value, Status> {
    let token = std::env::var("GITHUB_TOKEN").map_err(|_| Status::internal("GITHUB_TOKEN not set"))?;
    let url = format!("https://api.github.com{path}");
    let resp = state
        .client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", "insights-api")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| Status::internal(format!("request failed: {e}")))?;

    let status = resp.status();
    let data: Value = resp
        .json()
        .await
        .map_err(|e| Status::internal(format!("parse failed: {e}")))?;

    if !status.is_success() {
        return Err(Status::internal(format!(
            "GitHub API {}: {}",
            status,
            data["message"].as_str().unwrap_or("unknown")
        )));
    }
    Ok(data)
}

fn parse_opt_dt(s: Option<&str>) -> Option<DateTime<Utc>> {
    s.and_then(|v| DateTime::parse_from_rfc3339(v).ok().map(|dt| dt.with_timezone(&Utc)))
}

fn cursor_encode(n: i64) -> String {
    base64::engine::general_purpose::STANDARD.encode(n.to_string().as_bytes())
}

fn cursor_decode(s: &str) -> Option<i64> {
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .ok()
        .and_then(|b| String::from_utf8(b).ok())
        .and_then(|s| s.parse().ok())
}

// ── Implementation ──

#[async_trait]
impl InsightsService for InsightsServiceImpl {
    type GetWorkflowLogsStream = ReceiverStream<Result<LogChunk, Status>>;

    async fn get_org_status(
        &self,
        _req: Request<Empty>,
    ) -> Result<Response<OrgStatusResponse>, Status> {
        // Query each repo with latest workflow run status
        let repos = sqlx::query(
            r#"
            SELECT r.name, r.owner, r.default_branch, r.head_sha, r.latest_tag, r.updated_at
            FROM repositories r
            ORDER BY r.name
            "#,
        )
        .fetch_all(&self.state.db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        let mut repositories = Vec::new();
        for row in repos {
            use sqlx::Row;
            let name: String = row.get("name");
            let owner: String = row.get("owner");

            // Fetch latest workflow run status for this repo
            let wf: Option<(String, Option<String>)> = sqlx::query_as(
                "SELECT status, conclusion FROM workflow_runs WHERE repo_id = (SELECT id FROM repositories WHERE name = $1) ORDER BY started_at DESC NULLS LAST LIMIT 1",
            )
            .bind(&name)
            .fetch_optional(&self.state.db)
            .await
            .map_err(|e| Status::internal(format!("db: {e}")))?;

            let (wf_status, conclusion) = wf.unwrap_or(("unknown".into(), None));
            let status = conclusion.as_deref().unwrap_or(&wf_status).to_string();
            let head_sha: Option<String> = row.get("head_sha");
            let latest_tag: Option<String> = row.get("latest_tag");
            let updated_at: Option<DateTime<Utc>> = row.get("updated_at");

            repositories.push(Repository {
                name,
                owner,
                default_branch: row.get("default_branch"),
                head_sha: head_sha.unwrap_or_default(),
                latest_tag: latest_tag.unwrap_or_default(),
                status,
                updated_at: ts(updated_at),
            });
        }

        Ok(Response::new(OrgStatusResponse { repositories }))
    }

    async fn get_org_pulls(
        &self,
        _req: Request<OrgPullsRequest>,
    ) -> Result<Response<OrgPullsResponse>, Status> {
        let rows = sqlx::query(
            r#"
            SELECT r.name as repo, pr.number, pr.title, pr.author, pr.labels, pr.assignees,
                   pr.is_draft, pr.mergeable, pr.state, pr.head_ref, pr.base_ref,
                   pr.created_at, pr.updated_at, pr.merged_at, pr.closed_at
            FROM pull_requests pr
            JOIN repositories r ON r.id = pr.repo_id
            WHERE pr.state = 'open'
            ORDER BY r.name, pr.created_at DESC
            "#,
        )
        .fetch_all(&self.state.db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        use sqlx::Row;
        let mut pull_requests = Vec::new();
        let mut totals: std::collections::HashMap<String, i32> = std::collections::HashMap::new();

        for row in rows {
            let repo: String = row.get("repo");
            *totals.entry(repo.clone()).or_insert(0) += 1;

            let labels: Vec<String> = row
                .try_get::<Vec<String>, _>("labels")
                .unwrap_or_default()
                .iter()
                .map(|s| s.replace('"', ""))
                .collect();
            let assignees: Vec<String> = row
                .try_get::<Vec<String>, _>("assignees")
                .unwrap_or_default()
                .iter()
                .map(|s| s.replace('"', ""))
                .collect();

            pull_requests.push(PullRequest {
                repo,
                number: row.get("number"),
                title: row.get("title"),
                author: row.get("author"),
                labels,
                assignees,
                is_draft: row.get("is_draft"),
                mergeable: row.get::<Option<String>, _>("mergeable").unwrap_or_default(),
                state: row.get("state"),
                head_ref: row.get::<Option<String>, _>("head_ref").unwrap_or_default(),
                base_ref: row.get::<Option<String>, _>("base_ref").unwrap_or_default(),
                created_at: ts(row.get("created_at")),
                updated_at: ts(row.get("updated_at")),
                merged_at: ts(row.get::<Option<DateTime<Utc>>, _>("merged_at")),
                closed_at: ts(row.get::<Option<DateTime<Utc>>, _>("closed_at")),
                total_checks: 0,
                completed_checks: 0,
                passing_checks: 0,
            });
        }

        Ok(Response::new(OrgPullsResponse { pull_requests, totals }))
    }

    async fn get_repo_pulls(
        &self,
        req: Request<RepoPullsRequest>,
    ) -> Result<Response<RepoPullsResponse>, Status> {
        let params = req.into_inner();
        let limit = if params.first > 0 { params.first as i64 } else { 10 };
        let offset = cursor_decode(&params.after).unwrap_or(0);

        let rows = sqlx::query(
            r#"
            SELECT pr.number, pr.title, pr.author, pr.labels, pr.assignees,
                   pr.is_draft, pr.mergeable, pr.state, pr.head_ref, pr.base_ref,
                   pr.created_at, pr.updated_at, pr.merged_at, pr.closed_at
            FROM pull_requests pr
            JOIN repositories r ON r.id = pr.repo_id
            WHERE r.name = $1 AND pr.state = 'open'
            ORDER BY pr.created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(&params.repo)
        .bind(limit + 1) // fetch one extra to check has_next_page
        .bind(offset)
        .fetch_all(&self.state.db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        let has_more = rows.len() as i64 > limit;
        let rows = if has_more { &rows[..limit as usize] } else { &rows[..] };

        use sqlx::Row;
        let mut pull_requests = Vec::new();
        for row in rows {
            let labels: Vec<String> = row
                .try_get::<Vec<String>, _>("labels")
                .unwrap_or_default()
                .iter()
                .map(|s| s.replace('"', ""))
                .collect();
            let assignees: Vec<String> = row
                .try_get::<Vec<String>, _>("assignees")
                .unwrap_or_default()
                .iter()
                .map(|s| s.replace('"', ""))
                .collect();

            pull_requests.push(PullRequest {
                repo: params.repo.clone(),
                number: row.get("number"),
                title: row.get("title"),
                author: row.get("author"),
                labels,
                assignees,
                is_draft: row.get("is_draft"),
                mergeable: row.get::<Option<String>, _>("mergeable").unwrap_or_default(),
                state: row.get("state"),
                head_ref: row.get::<Option<String>, _>("head_ref").unwrap_or_default(),
                base_ref: row.get::<Option<String>, _>("base_ref").unwrap_or_default(),
                created_at: ts(row.get("created_at")),
                updated_at: ts(row.get("updated_at")),
                merged_at: ts(row.get::<Option<DateTime<Utc>>, _>("merged_at")),
                closed_at: ts(row.get::<Option<DateTime<Utc>>, _>("closed_at")),
                total_checks: 0,
                completed_checks: 0,
                passing_checks: 0,
            });
        }

        Ok(Response::new(RepoPullsResponse {
            pull_requests,
            page_info: Some(PageInfo {
                has_next_page: has_more,
                end_cursor: cursor_encode(offset + limit),
            }),
        }))
    }

    async fn get_org_issues(
        &self,
        _req: Request<OrgIssuesRequest>,
    ) -> Result<Response<OrgIssuesResponse>, Status> {
        let rows = sqlx::query(
            r#"
            SELECT r.name as repo, i.number, i.title, i.author, i.labels, i.assignees,
                   i.state, i.created_at, i.updated_at, i.closed_at
            FROM issues i
            JOIN repositories r ON r.id = i.repo_id
            WHERE i.state = 'open'
            ORDER BY r.name, i.created_at DESC
            "#,
        )
        .fetch_all(&self.state.db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        use sqlx::Row;
        let mut issues = Vec::new();
        let mut totals: std::collections::HashMap<String, i32> = std::collections::HashMap::new();

        for row in rows {
            let repo: String = row.get("repo");
            *totals.entry(repo.clone()).or_insert(0) += 1;

            let labels: Vec<String> = row
                .try_get::<Vec<String>, _>("labels")
                .unwrap_or_default()
                .iter()
                .map(|s| s.replace('"', ""))
                .collect();
            let assignees: Vec<String> = row
                .try_get::<Vec<String>, _>("assignees")
                .unwrap_or_default()
                .iter()
                .map(|s| s.replace('"', ""))
                .collect();

            issues.push(Issue {
                repo,
                number: row.get("number"),
                title: row.get("title"),
                author: row.get("author"),
                labels,
                assignees,
                state: row.get("state"),
                created_at: ts(row.get("created_at")),
                updated_at: ts(row.get("updated_at")),
                closed_at: ts(row.get::<Option<DateTime<Utc>>, _>("closed_at")),
            });
        }

        Ok(Response::new(OrgIssuesResponse { issues, totals }))
    }

    async fn get_repo_issues(
        &self,
        req: Request<RepoIssuesRequest>,
    ) -> Result<Response<RepoIssuesResponse>, Status> {
        let params = req.into_inner();
        let limit = if params.first > 0 { params.first as i64 } else { 10 };
        let offset = cursor_decode(&params.after).unwrap_or(0);

        let rows = sqlx::query(
            r#"
            SELECT i.number, i.title, i.author, i.labels, i.assignees,
                   i.state, i.created_at, i.updated_at, i.closed_at
            FROM issues i
            JOIN repositories r ON r.id = i.repo_id
            WHERE r.name = $1 AND i.state = 'open'
            ORDER BY i.created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(&params.repo)
        .bind(limit + 1)
        .bind(offset)
        .fetch_all(&self.state.db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        use sqlx::Row;
        let has_more = rows.len() as i64 > limit;
        let rows = if has_more { &rows[..limit as usize] } else { &rows[..] };

        let mut issues = Vec::new();
        for row in rows {
            let labels: Vec<String> = row
                .try_get::<Vec<String>, _>("labels")
                .unwrap_or_default()
                .iter()
                .map(|s| s.replace('"', ""))
                .collect();
            let assignees: Vec<String> = row
                .try_get::<Vec<String>, _>("assignees")
                .unwrap_or_default()
                .iter()
                .map(|s| s.replace('"', ""))
                .collect();

            issues.push(Issue {
                repo: params.repo.clone(),
                number: row.get("number"),
                title: row.get("title"),
                author: row.get("author"),
                labels,
                assignees,
                state: row.get("state"),
                created_at: ts(row.get("created_at")),
                updated_at: ts(row.get("updated_at")),
                closed_at: ts(row.get::<Option<DateTime<Utc>>, _>("closed_at")),
            });
        }

        Ok(Response::new(RepoIssuesResponse {
            issues,
            page_info: Some(PageInfo {
                has_next_page: has_more,
                end_cursor: cursor_encode(offset + limit),
            }),
        }))
    }

    async fn get_workflow_history(
        &self,
        req: Request<WorkflowHistoryRequest>,
    ) -> Result<Response<WorkflowHistoryResponse>, Status> {
        let params = req.into_inner();
        let limit = if params.first > 0 { params.first as i64 } else { 10 };
        let offset = cursor_decode(&params.after).unwrap_or(0);

        let rows = sqlx::query(
            r#"
            SELECT run_id, run_number, workflow_name, status, conclusion,
                   head_sha, branch, actor, event, started_at, completed_at, duration_seconds
            FROM workflow_runs wr
            JOIN repositories r ON r.id = wr.repo_id
            WHERE r.name = $1
            ORDER BY started_at DESC NULLS LAST
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(&params.repo)
        .bind(limit + 1)
        .bind(offset)
        .fetch_all(&self.state.db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        use sqlx::Row;
        let has_more = rows.len() as i64 > limit;
        let rows = if has_more { &rows[..limit as usize] } else { &rows[..] };

        let mut runs = Vec::new();
        for row in rows {
            runs.push(WorkflowRun {
                id: row.get::<i64, _>("run_id"),
                repo: params.repo.clone(),
                workflow_name: row.get("workflow_name"),
                run_number: row.get("run_number"),
                status: row.get("status"),
                conclusion: row.get::<Option<String>, _>("conclusion").unwrap_or_default(),
                head_sha: row.get("head_sha"),
                actor: row.get::<Option<String>, _>("actor").unwrap_or_default(),
                branch: row.get::<Option<String>, _>("branch").unwrap_or_default(),
                event: row.get::<Option<String>, _>("event").unwrap_or_default(),
                started_at: ts(row.get::<Option<DateTime<Utc>>, _>("started_at")),
                completed_at: ts(row.get::<Option<DateTime<Utc>>, _>("completed_at")),
                duration_seconds: row.get::<Option<i32>, _>("duration_seconds").unwrap_or(0),
            });
        }

        Ok(Response::new(WorkflowHistoryResponse {
            runs,
            page_info: Some(PageInfo {
                has_next_page: has_more,
                end_cursor: cursor_encode(offset + limit),
            }),
        }))
    }

    async fn get_workflow_logs(
        &self,
        req: Request<WorkflowLogsRequest>,
    ) -> Result<Response<Self::GetWorkflowLogsStream>, Status> {
        let params = req.into_inner();

        // Look up the repo for this run
        let row = sqlx::query(
            "SELECT r.name FROM workflow_runs wr JOIN repositories r ON r.id = wr.repo_id WHERE wr.run_id = $1",
        )
        .bind(params.run_id)
        .fetch_optional(&self.state.db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?
        .ok_or_else(|| Status::not_found("workflow run not found"))?;

        use sqlx::Row;
        let repo: String = row.get("name");
        let owner = "autonomic-ai-dev";

        // Download logs from GitHub — they come as a zip
        let url = format!(
            "https://api.github.com/repos/{owner}/{repo}/actions/runs/{}/logs",
            params.run_id
        );

        let token =
            std::env::var("GITHUB_TOKEN").map_err(|_| Status::internal("GITHUB_TOKEN not set"))?;

        let resp = self.state
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {token}"))
            .header("User-Agent", "insights-api")
            .send()
            .await
            .map_err(|e| Status::internal(format!("download failed: {e}")))?;

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| Status::internal(format!("read failed: {e}")))?;

        // Stream as single chunk (tonic-web requires streaming responses to return a stream)
        let (tx, rx) = tokio::sync::mpsc::channel(1);
        tx.send(Ok(LogChunk { data: bytes.to_vec() }))
            .await
            .map_err(|_| Status::internal("channel closed"))?;
        drop(tx);

        let stream = ReceiverStream::new(rx);
        Ok(Response::new(stream))
    }

    async fn get_releases(
        &self,
        req: Request<ReleasesRequest>,
    ) -> Result<Response<ReleasesResponse>, Status> {
        let params = req.into_inner();
        let limit = if params.first > 0 { params.first as i64 } else { 10 };
        let offset = cursor_decode(&params.after).unwrap_or(0);

        let rows = sqlx::query(
            r#"
            SELECT tag, author, is_draft, is_prerelease, published_at
            FROM releases rel
            JOIN repositories r ON r.id = rel.repo_id
            WHERE r.name = $1
            ORDER BY published_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(&params.repo)
        .bind(limit + 1)
        .bind(offset)
        .fetch_all(&self.state.db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        use sqlx::Row;
        let has_more = rows.len() as i64 > limit;
        let rows = if has_more { &rows[..limit as usize] } else { &rows[..] };

        let mut releases = Vec::new();
        for row in rows {
            releases.push(Release {
                repo: params.repo.clone(),
                tag: row.get("tag"),
                author: row.get::<Option<String>, _>("author").unwrap_or_default(),
                published_at: ts(row.get::<Option<DateTime<Utc>>, _>("published_at")),
                is_draft: row.get("is_draft"),
                is_prerelease: row.get("is_prerelease"),
            });
        }

        Ok(Response::new(ReleasesResponse {
            releases,
            page_info: Some(PageInfo {
                has_next_page: has_more,
                end_cursor: cursor_encode(offset + limit),
            }),
        }))
    }

    async fn get_commits(
        &self,
        req: Request<CommitsRequest>,
    ) -> Result<Response<CommitsResponse>, Status> {
        let params = req.into_inner();
        // Commits aren't stored in our DB — fetch from GitHub on demand
        // Query default branch commits via GitHub REST API
        let path = format!(
            "/repos/autonomic-ai-dev/{}/commits?sha=&per_page={}",
            params.repo,
            params.first.max(1).min(100)
        );
        let data = gh_get(&self.state, &path).await?;

        let commits = data
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|c| Commit {
                        sha: c["sha"].as_str().unwrap_or("").to_string(),
                        message: c["commit"]["message"].as_str().unwrap_or("").to_string(),
                        author: c["commit"]["author"]["name"]
                            .as_str()
                            .unwrap_or("unknown")
                            .to_string(),
                        committed_at: parse_opt_dt(c["commit"]["author"]["date"].as_str())
                            .map(|d| d.timestamp())
                            .unwrap_or(0),
                        checks: vec![],
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        Ok(Response::new(CommitsResponse {
            commits,
            page_info: None,
        }))
    }

    async fn get_readme(
        &self,
        req: Request<ReadmeRequest>,
    ) -> Result<Response<ReadmeResponse>, Status> {
        let params = req.into_inner();

        let row = sqlx::query(
            "SELECT content, html, updated_at FROM readmes rm JOIN repositories r ON r.id = rm.repo_id WHERE r.name = $1",
        )
        .bind(&params.repo)
        .fetch_optional(&self.state.db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        match row {
            Some(row) => {
                use sqlx::Row;
                Ok(Response::new(ReadmeResponse {
                    content: row.get::<Option<String>, _>("content").unwrap_or_default(),
                    html: row.get::<Option<String>, _>("html").unwrap_or_default(),
                    updated_at: ts(row.get::<Option<DateTime<Utc>>, _>("updated_at")),
                }))
            },
            None => Err(Status::not_found("README not found")),
        }
    }

    async fn merge_pull_request(
        &self,
        req: Request<MergePullRequestRequest>,
    ) -> Result<Response<MergePullRequestResponse>, Status> {
        let params = req.into_inner();
        let path = format!(
            "/repos/autonomic-ai-dev/{}/pulls/{}/merge",
            params.repo, params.pull_number
        );
        let body = serde_json::json!({ "merge_method": "squash" });
        let data = gh_post(&self.state, &path, body).await?;

        Ok(Response::new(MergePullRequestResponse {
            merged: data["merged"].as_bool().unwrap_or(false),
            sha: data["sha"].as_str().unwrap_or("").to_string(),
            message: data["message"].as_str().unwrap_or("").to_string(),
        }))
    }

    async fn close_issue(
        &self,
        req: Request<CloseIssueRequest>,
    ) -> Result<Response<CloseIssueResponse>, Status> {
        let params = req.into_inner();
        let path = format!(
            "/repos/autonomic-ai-dev/{}/issues/{}",
            params.repo, params.issue_number
        );
        let body = serde_json::json!({ "state": "closed" });
        let data = gh_post(&self.state, &path, body).await?;

        Ok(Response::new(CloseIssueResponse {
            closed: data["state"].as_str() == Some("closed"),
        }))
    }

    async fn rerun_workflow(
        &self,
        req: Request<RerunWorkflowRequest>,
    ) -> Result<Response<RerunWorkflowResponse>, Status> {
        let params = req.into_inner();
        let path = if params.failed_only {
            format!(
                "/repos/autonomic-ai-dev/{}/actions/runs/{}/rerun-failed-jobs",
                params.repo, params.run_id
            )
        } else {
            format!(
                "/repos/autonomic-ai-dev/{}/actions/runs/{}/rerun",
                params.repo, params.run_id
            )
        };
        let data = gh_post(&self.state, &path, serde_json::json!({})).await?;

        Ok(Response::new(RerunWorkflowResponse {
            triggered: true,
            new_run_id: data["run_id"].as_i64().unwrap_or(0),
        }))
    }

    async fn get_dora_metrics(
        &self,
        req: Request<DoraRequest>,
    ) -> Result<Response<DoraResponse>, Status> {
        let params = req.into_inner();
        let days = params.days.max(1).min(365) as i64;

        let db = &self.state.db;

        // Deployment frequency: number of releases / days
        let deploys: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM releases rel JOIN repositories r ON r.id = rel.repo_id WHERE r.name = $1 AND published_at >= NOW() - ($2 || ' days')::INTERVAL",
        )
        .bind(&params.repo)
        .bind(&days.to_string())
        .fetch_one(db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        // Lead time for change: avg seconds from PR merge to release
        let lead_time: Option<(Option<f64>,)> = sqlx::query_as(
            r#"
            SELECT AVG(EXTRACT(EPOCH FROM (rel.published_at - pr.merged_at)))
            FROM releases rel
            JOIN repositories r ON r.id = rel.repo_id
            JOIN pull_requests pr ON pr.repo_id = r.id
            WHERE r.name = $1
              AND rel.published_at >= NOW() - ($2 || ' days')::INTERVAL
              AND pr.merged_at IS NOT NULL
              AND rel.published_at > pr.merged_at
            "#,
        )
        .bind(&params.repo)
        .bind(&days.to_string())
        .fetch_optional(db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        // Change failure rate: failed runs / total runs
        let total_runs: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM workflow_runs wr JOIN repositories r ON r.id = wr.repo_id WHERE r.name = $1 AND wr.started_at >= NOW() - ($2 || ' days')::INTERVAL",
        )
        .bind(&params.repo)
        .bind(&days.to_string())
        .fetch_one(db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        let failed_runs: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM workflow_runs wr JOIN repositories r ON r.id = wr.repo_id WHERE r.name = $1 AND wr.conclusion = 'failure' AND wr.started_at >= NOW() - ($2 || ' days')::INTERVAL",
        )
        .bind(&params.repo)
        .bind(&days.to_string())
        .fetch_one(db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        let failure_rate = if total_runs.0 > 0 {
            failed_runs.0 as f64 / total_runs.0 as f64
        } else {
            0.0
        };

        // MTTR: avg time from a failed run to the next successful run
        // Simplified: avg duration of failed runs (crude but workable)
        let mttr: Option<(Option<f64>,)> = sqlx::query_as(
            r#"
            SELECT AVG(duration_seconds)
            FROM workflow_runs wr
            JOIN repositories r ON r.id = wr.repo_id
            WHERE r.name = $1
              AND wr.conclusion = 'failure'
              AND wr.started_at >= NOW() - ($2 || ' days')::INTERVAL
            "#,
        )
        .bind(&params.repo)
        .bind(&days.to_string())
        .fetch_optional(db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        Ok(Response::new(DoraResponse {
            deployment_frequency: deploys.0 as f64 / days as f64,
            lead_time_for_change_seconds: lead_time.and_then(|r| r.0).unwrap_or(0.0),
            change_failure_rate: failure_rate,
            time_to_restore_seconds: mttr.and_then(|r| r.0).unwrap_or(0.0),
        }))
    }

    async fn get_ci_trends(
        &self,
        req: Request<CiTrendsRequest>,
    ) -> Result<Response<CiTrendsResponse>, Status> {
        let params = req.into_inner();
        let days = params.days.max(1).min(365);

        let rows = sqlx::query(
            r#"
            SELECT
              DATE(started_at) as day,
              COUNT(*)::int as total,
              SUM(CASE WHEN conclusion = 'success' THEN 1 ELSE 0 END)::int as successes,
              AVG(duration_seconds) as avg_duration
            FROM workflow_runs wr
            JOIN repositories r ON r.id = wr.repo_id
            WHERE r.name = $1 AND wr.started_at >= NOW() - ($2 || ' days')::INTERVAL
            GROUP BY DATE(started_at)
            ORDER BY day DESC
            "#,
        )
        .bind(&params.repo)
        .bind(&days.to_string())
        .fetch_all(&self.state.db)
        .await
        .map_err(|e| Status::internal(format!("db: {e}")))?;

        use sqlx::Row;
        let points = rows
            .iter()
            .map(|row| {
                let day: String = row
                    .get::<Option<DateTime<Utc>>, _>("day")
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default();
                let total: i32 = row.get("total");
                let successes: i32 = row.get("successes");
                let avg_duration: Option<f64> = row.get("avg_duration");

                CiTrendsPoint {
                    date: day,
                    total_runs: total,
                    successful_runs: successes,
                    success_rate: if total > 0 {
                        successes as f64 / total as f64
                    } else {
                        0.0
                    },
                    avg_duration_seconds: avg_duration.unwrap_or(0.0),
                }
            })
            .collect();

        Ok(Response::new(CiTrendsResponse { points }))
    }
}
