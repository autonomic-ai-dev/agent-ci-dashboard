use axum::{
    Router,
    routing::{get, post},
};
use sqlx::PgPool;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

mod webhook;
mod sync;
mod github;
mod materialize;

#[derive(Clone)]
struct AppState {
    db: PgPool,
    gh: Arc<octocrab::Octocrab>,
    client: reqwest::Client,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let db = PgPool::connect(&database_url).await?;
    sqlx::migrate!("../../migrations").run(&db).await?;

    let gh = Arc::new(
        octocrab::Octocrab::builder()
            .personal_token(
                std::env::var("GITHUB_TOKEN")
                    .expect("GITHUB_TOKEN must be set"),
            )
            .build()?,
    );

    let client = reqwest::Client::new();

    let state = AppState { db, gh, client };

    // Start background sync worker
    let sync_state = state.clone();
    tokio::spawn(async move {
        sync::run_loop(sync_state).await;
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/webhooks/github", post(webhook::handle))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await?;
    tracing::info!("ingestor listening on {}", listener.local_addr()?);
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health() -> &'static str {
    "ok"
}
