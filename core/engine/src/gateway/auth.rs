//! JWT issuance + validation for the gateway (hito 9.1).
//! HS256 via jsonwebtoken; the signing secret is stable for the demo.

use crate::store::{GatewayTenant, DEFAULT_SECRET};
use axum::http::HeaderMap;
use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub role: String,
    pub exp: usize,
    pub iat: usize,
}

pub fn issue_token(tenant: &GatewayTenant, ttl_seconds: i64) -> Result<String, String> {
    let now = Utc::now().timestamp();
    let claims = Claims {
        sub: tenant.id.clone(),
        role: tenant.role.clone(),
        exp: (now + ttl_seconds) as usize,
        iat: now as usize,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(DEFAULT_SECRET.as_bytes()),
    )
    .map_err(|error| error.to_string())
}

pub fn verify_token(token: &str) -> Option<Claims> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(DEFAULT_SECRET.as_bytes()),
        &Validation::default(),
    )
    .ok()
    .map(|data| data.claims)
}

/// Accepts either the legacy X-Tenant-Id/X-Api-Key headers or a Bearer JWT.
pub fn authenticate(headers: &HeaderMap) -> Result<Claims, String> {
    if let Some(auth) = headers.get("authorization").and_then(|value| value.to_str().ok()) {
        if let Some(token) = auth.strip_prefix("Bearer ") {
            if let Some(claims) = verify_token(token) {
                return Ok(claims);
            }
            return Err("JWT inválido o expirado".to_string());
        }
    }
    let tenant = headers
        .get("x-tenant-id")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let key = headers
        .get("x-api-key")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    if tenant == "default" && key == "dev-key" {
        return Ok(Claims {
            sub: "default".to_string(),
            role: "admin".to_string(),
            exp: 0,
            iat: 0,
        });
    }
    Err("X-Tenant-Id/X-Api-Key o Bearer JWT requeridos".to_string())
}
