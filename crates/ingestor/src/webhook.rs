use crate::AppState;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

pub async fn handle(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let delivery_id = headers
        .get("x-github-delivery")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    let event_type = headers
        .get("x-github-event")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    // Verify webhook signature
    if let Some(sig) = headers
        .get("x-hub-signature-256")
        .and_then(|v| v.to_str().ok())
    {
        if let Ok(secret) = std::env::var("GITHUB_WEBHOOK_SECRET") {
            let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
            mac.update(&body);
            let expected = format!("sha256={}", hex::encode(mac.finalize().into_bytes()));
            if sig != expected {
                tracing::warn!("signature mismatch for delivery {delivery_id}");
                return StatusCode::UNAUTHORIZED.into_response();
            }
        }
    }

    let payload: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("invalid JSON: {e}");
            return StatusCode::BAD_REQUEST.into_response();
        },
    };

    let repo = payload["repository"]["full_name"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    // Insert into raw_events
    match sqlx::query(
        "INSERT INTO raw_events (event_type, action, repo, delivery_id, payload)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (delivery_id) DO NOTHING",
    )
    .bind(&event_type)
    .bind(payload["action"].as_str())
    .bind(&repo)
    .bind(&delivery_id)
    .bind(&payload)
    .execute(&state.db)
    .await
    {
        Ok(_) => {
            // Materialize into normalized tables in background
            let db = state.db.clone();
            let gh = state.gh.clone();
            let event_type = event_type.clone();
            tokio::spawn(async move {
                if let Err(e) = crate::materialize::event(&db, &gh, &event_type, &payload).await {
                    tracing::error!("materialize failed: {e}");
                }
            });
            (StatusCode::OK, "ok").into_response()
        },
        Err(e) => {
            tracing::error!("db insert failed: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        },
    }
}
