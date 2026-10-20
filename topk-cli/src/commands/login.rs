use std::io::Write;
use std::process::ExitCode;

use anyhow::Result;
use clap::Args;
use colored::Colorize;
use serde_json::json;

use crate::auth::AccessTokenClaims;
use crate::endpoint::Endpoint;
use crate::output::json_line;

// Registered Auth0 loopback callback ports.
const AUTH_CALLBACK_PORTS: [u16; 3] = [38123, 38124, 38125];

#[derive(Args, Debug)]
pub struct LoginArgs {
    /// Print the login URL instead of opening a browser.
    #[arg(long)]
    pub no_browser: bool,

    /// Log in with a code confirmed in a browser on any device; the default
    /// over SSH and on machines without a display.
    #[arg(long)]
    pub device: bool,

    #[arg(long = "auth-callback-ports", env = "TOPK_AUTH_CALLBACK_PORTS", value_delimiter = ',', default_values_t = AUTH_CALLBACK_PORTS, hide = true)]
    pub callback_ports: Vec<u16>,
}

pub async fn run(
    endpoint: &Endpoint,
    args: &LoginArgs,
    json: bool,
    out: &mut impl Write,
) -> Result<ExitCode> {
    // `--no-browser` asks for the localhost callback flow by name.
    let claims = match args.device || (!args.no_browser && headless()) {
        true => device_login(endpoint, args, json, out).await?,
        false => browser_login(endpoint, args).await?,
    };
    match &claims {
        Some(claims) => eprintln!("{} Logged in as {}", "✓".green(), claims.account()),
        None => eprintln!("{} Logged in.", "✓".green()),
    }
    if json {
        json_line(
            out,
            &json!({"logged_in": true, "account": claims.map(|c| c.account())}),
        )?;
    }
    Ok(ExitCode::SUCCESS)
}

async fn browser_login(endpoint: &Endpoint, args: &LoginArgs) -> Result<Option<AccessTokenClaims>> {
    let auth = endpoint.auth()?;
    let login = auth.login(&args.callback_ports).await?;
    if args.no_browser {
        eprintln!(
            "Open this URL in your browser to log in:\n\n{}\n",
            login.url()
        );
    } else {
        eprintln!(
            "Opening your browser to log in. If it doesn't open, visit:\n\n{}\n",
            login.url()
        );
        let _ = open::that_detached(login.url().as_str());
    }
    eprintln!("Waiting for login...");
    login.finish().await
}

async fn device_login(
    endpoint: &Endpoint,
    args: &LoginArgs,
    json: bool,
    out: &mut impl Write,
) -> Result<Option<AccessTokenClaims>> {
    let auth = endpoint.auth()?;
    let login = auth.device_login().await?;
    let url = login.url()?;
    // Printed before waiting: whoever runs this, a person or an agent, must
    // pass the URL on while the command is still polling.
    if json {
        json_line(
            out,
            &json!({
                "verification_uri": url.as_str(),
                "user_code": login.user_code(),
                "expires_in": login.expires_in(),
            }),
        )?;
        out.flush()?;
    }
    eprintln!(
        "Open this URL in a browser on any device to log in or sign up:\n\n{url}\n\n\
         Confirm that it shows the code {}\n",
        login.user_code().bold()
    );
    if !args.no_browser && !headless() {
        let _ = open::that_detached(url.as_str());
    }
    eprintln!("Waiting for login...");
    login.finish().await
}

/// No browser here, or none that could reach a localhost callback.
fn headless() -> bool {
    let set = |v: &str| std::env::var_os(v).is_some_and(|s| !s.is_empty());
    let ssh = set("SSH_CONNECTION") || set("SSH_TTY");
    let no_display = cfg!(target_os = "linux") && !set("DISPLAY") && !set("WAYLAND_DISPLAY");
    ssh || no_display
}
