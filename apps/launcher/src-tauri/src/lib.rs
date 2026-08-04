use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::Emitter;

const CONFIG_FILE_NAME: &str = "neuracore.config.json";

#[derive(Clone, Serialize)]
struct EngineLog {
    level: &'static str,
    message: &'static str,
    timestamp: u64,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn config_path(workspace_path: &str) -> Result<PathBuf, String> {
    let workspace = PathBuf::from(workspace_path);
    if !workspace.is_absolute() {
        return Err("El directorio de trabajo debe ser una ruta absoluta.".into());
    }

    let workspace = fs::canonicalize(&workspace)
        .map_err(|error| format!("No se pudo acceder al directorio: {error}"))?;
    if !workspace.is_dir() {
        return Err("El directorio seleccionado no es válido.".into());
    }

    Ok(workspace.join(CONFIG_FILE_NAME))
}

#[tauri::command]
fn write_project_config(workspace_path: String, contents: String) -> Result<String, String> {
    if contents.trim().is_empty() || contents.len() > 256_000 {
        return Err("El contenido de configuración no es válido.".into());
    }
    serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|error| format!("El contenido no es JSON válido: {error}"))?;

    let path = config_path(&workspace_path)?;
    fs::write(&path, contents)
        .map_err(|error| format!("No se pudo guardar la configuración: {error}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_project_config(config_path: String) -> Result<String, String> {
    let path = PathBuf::from(config_path);
    if path.file_name().and_then(|name| name.to_str()) != Some(CONFIG_FILE_NAME) {
        return Err("Ruta de configuración no permitida.".into());
    }

    fs::read_to_string(&path)
        .map_err(|error| format!("No se pudo leer la configuración: {error}"))
}

#[tauri::command]
fn emit_test_logs(app: tauri::AppHandle) -> Result<(), String> {
    let test_logs = [
        ("INFO", "Launcher connected to the native event bridge."),
        ("DEBUG", "Loading local project configuration."),
        ("INFO", "Memory subsystem registration queued."),
        ("WARN", "No Redis buffer configured; continuing in standby."),
        ("DEBUG", "Affect engine baseline awaiting first stimulus."),
        ("INFO", "Desktop window is ready for interaction."),
        ("ERROR", "Example error event for console verification."),
        ("DEBUG", "Event payload serialization completed."),
        ("WARN", "External services are not connected yet."),
        ("INFO", "Test log sequence completed."),
    ];

    for (level, message) in test_logs {
        app.emit(
            "engine-log",
            EngineLog {
                level,
                message,
                timestamp: now_millis(),
            },
        )
        .map_err(|error| format!("No se pudo emitir el log: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<String, String> {
    if contents.len() > 2_000_000 {
        return Err("El archivo de logs supera el tamaño permitido.".into());
    }

    let mut output_path = PathBuf::from(path);
    match output_path.extension().and_then(|extension| extension.to_str()) {
        Some("txt") => {}
        Some(_) => return Err("Los logs solo se pueden exportar como .txt.".into()),
        None => {
            output_path.set_extension("txt");
        }
    }

    fs::write(&output_path, contents)
        .map_err(|error| format!("No se pudo exportar el archivo: {error}"))?;
    Ok(output_path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            write_project_config,
            read_project_config,
            emit_test_logs,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Neura-Core launcher");
}
