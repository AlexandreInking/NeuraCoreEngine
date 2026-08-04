//! Neura-Core v2 output gateway (hito 8.3-8.5 + 9.1).
//!
//! Bridges the TS cognitive motor to external clients:
//!   - gRPC (Tonic)   : EmitTurn (unary) + StreamAffect (server-streaming)
//!   - REST (Axum)    : POST /v2/turn, GET /v2/affect (SSE), GET /v2/ws (WebSocket)
//!   - Auth (hito 9.1): POST /auth/token (X-Api-Key → JWT HS256) + middleware
//!                      Bearer JWT o headers X-Tenant-Id/X-Api-Key (401)
//!   - Admin          : GET/POST /admin/tenants, DELETE /admin/tenants/:id (revocación),
//!                      GET /admin/logs (intentos de auth fallidos)

pub mod auth;
pub mod store;

pub mod pb {
    tonic::include_proto!("neuracore.v2");
}

use axum::{
    extract::{
        ws::{Message as WsMessage, WebSocket, WebSocketUpgrade},
        Path, Request as AxumRequest,
    },
    http::HeaderMap,
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{delete, get, post},
    Json, Router,
};
use chrono::Utc;
use futures::Stream;
use pb::neura_core_v2_server::{NeuraCoreV2, NeuraCoreV2Server};
use pb::{AffectFrame, StreamAffectRequest, TurnRequest, TurnResponse};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    convert::Infallible,
    net::SocketAddr,
    pin::Pin,
    sync::{Mutex, OnceLock},
    time::Duration,
};
use tonic::{transport::Server, Request, Response as TonicResponse, Status};

// ── shared state ─────────────────────────────────────────────────────

static AUTH_FAILURES: Mutex<Vec<AuthFailure>> = Mutex::new(Vec::new());

#[derive(Clone, Serialize)]
struct AuthFailure {
    at: String,
    source: String,
    reason: String,
}

fn log_auth_failure(source: &str, reason: &str) {
    if let Ok(mut failures) = AUTH_FAILURES.lock() {
        failures.push(AuthFailure {
            at: Utc::now().to_rfc3339(),
            source: source.to_string(),
            reason: reason.to_string(),
        });
        let len = failures.len();
        if len > 200 {
            failures.drain(0..len - 200);
        }
    }
}

// ── auth helpers ─────────────────────────────────────────────────────

fn require_auth<T>(request: &Request<T>) -> Result<(), Status> {
    let headers = request.metadata();
    let tenant = headers
        .get("x-tenant-id")
        .map(|value| value.to_str().unwrap_or(""))
        .unwrap_or("");
    let key = headers
        .get("x-api-key")
        .map(|value| value.to_str().unwrap_or(""))
        .unwrap_or("");
    if tenant == "default" && key == "dev-key" {
        return Ok(());
    }
    if let Some(auth) = headers.get("authorization").map(|value| value.to_str().unwrap_or("")) {
        if let Some(token) = auth.strip_prefix("Bearer ") {
            if auth::verify_token(token).is_some() {
                return Ok(());
            }
        }
    }
    log_auth_failure("grpc", "auth fallida");
    Err(Status::unauthenticated("X-Tenant-Id/X-Api-Key o Bearer JWT requeridos"))
}

fn http_authenticated(headers: &HeaderMap, source: &str) -> Result<auth::Claims, Response> {
    match auth::authenticate(headers) {
        Ok(claims) => Ok(claims),
        Err(reason) => {
            log_auth_failure(source, &reason);
            Err((axum::http::StatusCode::UNAUTHORIZED, reason).into_response())
        }
    }
}

fn frame_at(phase: f32) -> AffectFrame {
    let valence = (phase * 1.3).sin();
    let arousal = (phase * 0.9 + 0.4).sin().abs() * 2.0 - 1.0;
    let dominance = (phase * 0.7).cos();
    AffectFrame {
        valence,
        arousal,
        dominance,
        hex_color: valence_to_hex(valence, arousal),
        timestamp_ms: Utc::now().timestamp_millis(),
    }
}

fn valence_to_hex(valence: f32, arousal: f32) -> String {
    if valence >= 0.0 && arousal >= 0.0 {
        "#10b981".to_string()
    } else if valence >= 0.0 {
        "#60a5fa".to_string()
    } else if arousal >= 0.0 {
        "#ef4444".to_string()
    } else {
        "#6b7280".to_string()
    }
}

fn accept_payload(payload_json: &str) -> (bool, String) {
    if payload_json.trim().is_empty()
        || serde_json::from_str::<serde_json::Value>(payload_json).is_err()
    {
        (false, "payload_json vacío o no-JSON".to_string())
    } else {
        (true, "ok".to_string())
    }
}

// ── gRPC service ─────────────────────────────────────────────────────

#[derive(Default)]
struct GrpcGateway;

type AffectStream = Pin<Box<dyn Stream<Item = Result<AffectFrame, Status>> + Send + 'static>>;

#[tonic::async_trait]
impl NeuraCoreV2 for GrpcGateway {
    async fn emit_turn(
        &self,
        request: Request<TurnRequest>,
    ) -> Result<TonicResponse<TurnResponse>, Status> {
        require_auth(&request)?;
        let turn = request.into_inner();
        let (accepted, validation) = accept_payload(&turn.payload_json);
        let payload_json = if accepted {
            turn.payload_json
        } else {
            serde_json::json!({
                "version": "1.0.0",
                "agentId": turn.agent_id,
                "sessionId": "echo",
                "timestamp": Utc::now().to_rfc3339(),
                "affectState": {"valence": 0.0, "arousal": 0.0, "dominance": 0.0, "quadrant": "NEUTRAL", "hexColor": "#8b93a7", "animationTag": "GESTURE_NEUTRAL"},
                "memoryTrace": {"l0Entries": 0, "l1FactsUsed": 0, "l2Scenario": null, "l3Profile": null},
                "cognitiveOutput": {"message": format!("echo: {}", turn.user_message), "confidence": 0.0, "dominantSystem": null, "internalConflict": 0.0},
                "behavioralTriggers": {"animationTag": "GESTURE_NEUTRAL", "uiHexColor": "#8b93a7", "proactive": false}
            })
            .to_string()
        };
        Ok(TonicResponse::new(TurnResponse {
            accepted,
            payload_json,
            validation,
        }))
    }

    type StreamAffectStream = AffectStream;

    async fn stream_affect(
        &self,
        request: Request<StreamAffectRequest>,
    ) -> Result<TonicResponse<Self::StreamAffectStream>, Status> {
        require_auth(&request)?;
        let fps = request.into_inner().fps.max(1).min(60);
        let interval = Duration::from_millis(1000 / fps as u64);
        let stream = async_stream::stream! {
            let mut phase = rand::thread_rng().gen_range(0.0_f32..1.0);
            loop {
                tokio::time::sleep(interval).await;
                phase += 0.06;
                yield Ok(frame_at(phase));
            }
        };
        Ok(TonicResponse::new(Box::pin(stream)))
    }
}

// ── rate limiting (hito 9.5) ─────────────────────────────────────────

const RATE_WINDOW_SECS: u64 = 60;
const RATE_MAX_PER_WINDOW: u32 = 120;

static RATE_BUCKETS: OnceLock<Mutex<HashMap<String, (u32, u64)>>> = OnceLock::new();

fn rate_buckets() -> &'static Mutex<HashMap<String, (u32, u64)>> {
    RATE_BUCKETS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn client_ip(request: &AxumRequest) -> String {
    request
        .headers()
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(|ip| ip.trim().to_string())
        .filter(|ip| !ip.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

async fn rate_limit_middleware(
    request: AxumRequest,
    next: Next,
) -> Response {
    let now = Utc::now().timestamp() as u64;
    let ip = client_ip(&request);
    let allowed = {
        let mut buckets = rate_buckets().lock().unwrap();
        let entry = buckets.entry(ip).or_insert((0, now));
        if now - entry.1 >= RATE_WINDOW_SECS {
            *entry = (0, now);
        }
        entry.0 += 1;
        entry.0 <= RATE_MAX_PER_WINDOW
    };
    if allowed {
        next.run(request).await
    } else {
        (
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            "rate limit excedido (120 req/min)",
        )
            .into_response()
    }
}

// ── REST: auth/token + admin ─────────────────────────────────────────

#[derive(Deserialize)]
struct TokenRequest {
    ttl_seconds: Option<i64>,
}

async fn auth_token(headers: HeaderMap, Json(body): Json<TokenRequest>) -> Response {
    let api_key = headers
        .get("x-api-key")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let store = store::TenantStore::load();
    match store.find_by_api_key(api_key) {
        Some(tenant) => match auth::issue_token(tenant, body.ttl_seconds.unwrap_or(3600)) {
            Ok(token) => Json(serde_json::json!({
                "token": token,
                "tenantId": tenant.id,
                "role": tenant.role,
                "expiresInSeconds": body.ttl_seconds.unwrap_or(3600),
            }))
            .into_response(),
            Err(error) => {
                log_auth_failure("auth/token", &error);
                (axum::http::StatusCode::INTERNAL_SERVER_ERROR, error).into_response()
            }
        },
        None => {
            log_auth_failure("auth/token", "API key inválida");
            (axum::http::StatusCode::UNAUTHORIZED, "API key inválida").into_response()
        }
    }
}

#[derive(Deserialize)]
struct CreateTenantBody {
    id: String,
    name: String,
    role: Option<String>,
    api_key: String,
}

async fn admin_list_tenants(headers: HeaderMap) -> Response {
    if http_authenticated(&headers, "admin/tenants").is_err() {
        return (axum::http::StatusCode::UNAUTHORIZED, "no autorizado").into_response();
    }
    let store = store::TenantStore::load();
    Json(store.list()).into_response()
}

async fn admin_create_tenant(headers: HeaderMap, Json(body): Json<CreateTenantBody>) -> Response {
    if http_authenticated(&headers, "admin/tenants").is_err() {
        return (axum::http::StatusCode::UNAUTHORIZED, "no autorizado").into_response();
    }
    let mut store = store::TenantStore::load();
    let tenant = store.create(
        &body.id,
        &body.name,
        body.role.as_deref().unwrap_or("agent"),
        &body.api_key,
    );
    Json(tenant).into_response()
}

async fn admin_revoke_tenant(headers: HeaderMap, Path(id): Path<String>) -> Response {
    if http_authenticated(&headers, "admin/tenants").is_err() {
        return (axum::http::StatusCode::UNAUTHORIZED, "no autorizado").into_response();
    }
    let mut store = store::TenantStore::load();
    let removed = store.revoke(&id);
    Json(serde_json::json!({ "revoked": removed, "id": id })).into_response()
}

async fn admin_logs(headers: HeaderMap) -> Response {
    if http_authenticated(&headers, "admin/logs").is_err() {
        return (axum::http::StatusCode::UNAUTHORIZED, "no autorizado").into_response();
    }
    let failures = AUTH_FAILURES.lock().map(|log| log.clone()).unwrap_or_default();
    Json(failures).into_response()
}

// ── REST: v2 endpoints ───────────────────────────────────────────────

#[derive(Deserialize)]
struct TurnBody {
    agent_id: String,
    user_message: String,
    #[serde(default)]
    payload_json: String,
}

async fn rest_turn(headers: HeaderMap, Json(body): Json<TurnBody>) -> Response {
    if http_authenticated(&headers, "v2/turn").is_err() {
        return (axum::http::StatusCode::UNAUTHORIZED, "no autorizado").into_response();
    }
    let (accepted, validation) = accept_payload(&body.payload_json);
    Json(serde_json::json!({
        "accepted": accepted,
        "validation": validation,
        "agentId": body.agent_id,
        "userMessage": body.user_message,
    }))
    .into_response()
}

async fn rest_affect(headers: HeaderMap) -> Response {
    if http_authenticated(&headers, "v2/affect").is_err() {
        return (axum::http::StatusCode::UNAUTHORIZED, "no autorizado").into_response();
    }
    let stream = async_stream::stream! {
        let mut phase = 0.0_f32;
        loop {
            tokio::time::sleep(Duration::from_millis(200)).await;
            phase += 0.12;
            let frame = frame_at(phase);
            let data = serde_json::json!({
                "valence": frame.valence,
                "arousal": frame.arousal,
                "dominance": frame.dominance,
                "hexColor": frame.hex_color,
                "timestampMs": frame.timestamp_ms,
            });
            yield Ok::<_, Infallible>(Event::default().event("affect").data(data.to_string()));
        }
    };
    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}

async fn rest_ws(headers: HeaderMap, ws: WebSocketUpgrade) -> Response {
    if http_authenticated(&headers, "v2/ws").is_err() {
        return (axum::http::StatusCode::UNAUTHORIZED, "no autorizado").into_response();
    }
    ws.on_upgrade(handle_socket).into_response()
}

async fn handle_socket(mut socket: WebSocket) {
    let mut phase = 0.0_f32;
    loop {
        tokio::time::sleep(Duration::from_millis(250)).await;
        phase += 0.15;
        let frame = frame_at(phase);
        let data = serde_json::json!({
            "valence": frame.valence,
            "arousal": frame.arousal,
            "dominance": frame.dominance,
            "hexColor": frame.hex_color,
            "timestampMs": frame.timestamp_ms,
        });
        if socket.send(WsMessage::Text(data.to_string())).await.is_err() {
            break;
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let rest = Router::new()
        .route("/v2/turn", post(rest_turn))
        .route("/v2/affect", get(rest_affect))
        .route("/v2/ws", get(rest_ws))
        .route("/auth/token", post(auth_token))
        .route("/admin/tenants", get(admin_list_tenants).post(admin_create_tenant))
        .route("/admin/tenants/:id", delete(admin_revoke_tenant))
        .route("/admin/logs", get(admin_logs))
        .layer(middleware::from_fn(rate_limit_middleware))
        .layer(tower_http::cors::CorsLayer::permissive());

    let rest_addr: SocketAddr = "127.0.0.1:8443".parse()?;
    let grpc_addr: SocketAddr = "127.0.0.1:50051".parse()?;

    let rest_handle = tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(rest_addr).await.unwrap();
        axum::serve(listener, rest).await.unwrap();
    });
    let grpc_handle = tokio::spawn(async move {
        Server::builder()
            .add_service(NeuraCoreV2Server::new(GrpcGateway::default()))
            .serve(grpc_addr)
            .await
            .unwrap();
    });

    println!("Neura-Core v2 gateway");
    println!("  REST -> http://{rest_addr}  (/v2/turn · /v2/affect · /v2/ws · /auth/token · /admin/*)");
    println!("  gRPC -> http://{grpc_addr}  (EmitTurn · StreamAffect)");
    println!("  Auth -> X-Api-Key (POST /auth/token) o Bearer JWT · tenant por defecto: dev-key");

    tokio::try_join!(rest_handle, grpc_handle)?;
    Ok(())
}
