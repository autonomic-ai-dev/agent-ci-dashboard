use sqlx::PgPool;
use std::sync::Arc;
use tonic::transport::Server;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing_subscriber::EnvFilter;

mod service;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub gh: Arc<octocrab::Octocrab>,
    pub client: reqwest::Client,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let database_url =
        std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let db = PgPool::connect(&database_url).await?;

    let gh = Arc::new(
        octocrab::Octocrab::builder()
            .personal_token(
                std::env::var("GITHUB_TOKEN")
                    .expect("GITHUB_TOKEN must be set for mutations"),
            )
            .build()?,
    );

    let client = reqwest::Client::new();

    let state = AppState { db, gh, client };

    let addr = "0.0.0.0:3002".parse()?;

    let insights_service = service::InsightsServiceImpl::new(state);

    let cors = CorsLayer::new().allow_origin(AllowOrigin::any());

    tracing::info!("insights-api listening on {addr}");

    Server::builder()
        .accept_http1(true)
        .layer(cors)
        .layer(tonic_web::GrpcWebLayer::new())
        .add_service(
            insights_proto::insights_service_server::InsightsServiceServer::new(
                insights_service,
            ),
        )
        .serve(addr)
        .await?;

    Ok(())
}
