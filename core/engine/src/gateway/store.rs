//! Local tenant store for the gateway (hito 9.1): a small JSON file with
//! tenant id / name / role and SHA-256 API key hashes. Tokens are issued by
//! POST /auth/token and validated by the /v2/* middleware.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

pub const DEFAULT_SECRET: &str = "neuracore-gateway-secret";

#[derive(Clone, Serialize, Deserialize)]
pub struct GatewayTenant {
    pub id: String,
    pub name: String,
    pub role: String,
    pub api_key_hash: String,
}

#[derive(Serialize, Deserialize)]
struct StoreFile {
    tenants: Vec<GatewayTenant>,
}

pub struct TenantStore {
    tenants: Vec<GatewayTenant>,
    path: PathBuf,
}

pub fn hash_key(api_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(api_key.as_bytes());
    format!("{:x}", hasher.finalize())
}

impl TenantStore {
    pub fn load() -> Self {
        let path = PathBuf::from("gateway_tenants.json");
        let tenants = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<StoreFile>(&raw).ok())
            .map(|file| file.tenants)
            .unwrap_or_else(|| {
                vec![GatewayTenant {
                    id: "default".to_string(),
                    name: "Default".to_string(),
                    role: "admin".to_string(),
                    api_key_hash: hash_key("dev-key"),
                }]
            });
        Self { tenants, path }
    }

    fn save(&self) {
        let file = StoreFile {
            tenants: self.tenants.clone(),
        };
        if let Ok(raw) = serde_json::to_string_pretty(&file) {
            let _ = std::fs::write(&self.path, raw);
        }
    }

    pub fn list(&self) -> Vec<GatewayTenant> {
        self.tenants.clone()
    }

    pub fn find_by_api_key(&self, api_key: &str) -> Option<&GatewayTenant> {
        let hash = hash_key(api_key);
        self.tenants.iter().find(|t| t.api_key_hash == hash)
    }

    pub fn create(&mut self, id: &str, name: &str, role: &str, api_key: &str) -> GatewayTenant {
        let tenant = GatewayTenant {
            id: id.to_string(),
            name: name.to_string(),
            role: role.to_string(),
            api_key_hash: hash_key(api_key),
        };
        self.tenants.retain(|t| t.id != tenant.id);
        self.tenants.push(tenant.clone());
        self.save();
        tenant
    }

    pub fn revoke(&mut self, id: &str) -> bool {
        let before = self.tenants.len();
        self.tenants.retain(|t| t.id != id);
        let removed = self.tenants.len() < before;
        if removed {
            self.save();
        }
        removed
    }
}
