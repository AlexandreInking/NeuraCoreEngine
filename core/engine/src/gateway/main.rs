//! Neura-Core v2 output gateway (hito 8.3-8.5).
//!
//! Bridges the TS cognitive motor to external clients:
//!   - gRPC (Tonic)   : EmitTurn (unary) + StreamAffect (server-streaming)
//!   - REST (Axum)    : POST /v2/turn, GET /v2/affect (SSE), GET /v2/ws (WebSocket)
//!   - Auth           : X-Tenant-Id + X-Api-Key headers (401 otherwise)
//!
//! The cognitive motor runs in the launcher (TS); this gateway accepts
//! already-built NeuraCoreOutputPayloads, validates the JSON, and streams
//! demo VAD frames until hito 0.9 wires the real motor.

pub mod pb {
    tonic::include_proto!("neuracore.v2");
}

use axum::{
    extract::ws::{Message as WsMessage, WebSocket, WebSocketUpgrade},
    http::HeaderMap,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use futures::Stream;
use pb::neura_core_v2_server::{NeuraCoreV2, NeuraCoreV2Server};
use pb::{AffectFrame, StreamAffectRequest, TurnRequest, TurnResponse};
use rand::Rng;
use std::{convert::Infallible, net::SocketAddr, pin::Pin, time::Duration};
use tonic::{transport::Server, Request, Response as TonicResponse, Status};

const API_KEY: &str = "dev-key"; // replaced by per-tenant JWT in hito 0.9
const TENANT: &str = "default";

// ── auth ─────────────────────────────────────────────────────────────

fn tenant_key_ok(tenant: &str, key: &str) -> bool {
    tenant == TENANT && key == API_KEY
}

fn require_auth<T>(request: &Request<T>) -> Result<(), Status> {
    let tenant = request
        .metadata()
        .get("x-tenant-id")
        .map(|v| v.to_str().unwrap_or(""))
        .unwrap_or("");
    let key = request
        .metadata()
        .get("x-api-key")
        .map(|v| v.to_str().unwrap_or(""))
        .unwrap_or("");
    if tenant_key_ok(tenant, key) {
        Ok(())
    } else {
        Err(Status::unauthenticated("X-Tenant-Id / X-Api-Key requeridos"))
    }
}

fn rest_auth_ok(headers: &HeaderMap) -> bool {
    let tenant = headers
        .get("x-tenant-id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let key = headers
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    tenant_key_ok(tenant, key)
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

// ── REST handlers ────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct TurnBody {
    agent_id: String,
    user_message: String,
    #[serde(default)]
    payload_json: String,
}

async fn rest_turn(headers: HeaderMap, Json(body): Json<TurnBody>) -> impl IntoResponse {
    if !rest_auth_ok(&headers) {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "X-Tenant-Id / X-Api-Key requeridos" })),
        );
    }
    let (accepted, validation) = accept_payload(&body.payload_json);
    (
        axum::http::StatusCode::OK,
        Json(serde_json::json!({
            "accepted": accepted,
            "validation": validation,
            "agentId": body.agent_id,
            "userMessage": body.user_message,
        })),
    )
}

async fn rest_affect(headers: HeaderMap) -> Response {
    if !rest_auth_ok(&headers) {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            "X-Tenant-Id / X-Api-Key requeridos".to_string(),
        )
            .into_response();
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

async fn rest_ws(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_socket)
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
    println!("  REST -> http://{rest_addr}  (POST /v2/turn · GET /v2/affect SSE · GET /v2/ws)");
    println!("  gRPC -> http://{grpc_addr}  (EmitTurn · StreamAffect)");
    println!("  Auth -> X-Tenant-Id: {TENANT} · X-Api-Key: {API_KEY}");

    tokio::try_join!(rest_handle, grpc_handle)?;
    Ok(())
}
