use std::io::Write;
use std::process::ExitCode;

use anyhow::Result;
use serde_json::json;

use crate::endpoint::Endpoint;
use crate::output::json_line;

/// Prints a short-lived data plane token from the `topk login` session, for
/// SDKs and scripts: `TOPK_API_KEY=$(topk token) python app.py`.
pub async fn run(endpoint: &Endpoint, json: bool, out: &mut impl Write) -> Result<ExitCode> {
    let token = endpoint.data_plane_token().await?;
    match json {
        true => json_line(
            out,
            &json!({
                "token": token.token,
                "project_id": token.project_id,
                "expires_at": token.expires_at,
            }),
        )?,
        false => writeln!(out, "{}", token.token)?,
    }
    Ok(ExitCode::SUCCESS)
}
