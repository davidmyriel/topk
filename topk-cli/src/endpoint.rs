use std::time::Duration;

use anyhow::{Context, Result};
use tonic::transport::{ClientTlsConfig, Endpoint as GrpcEndpoint};

use topk_rs::client::retry::{BackoffConfig, RetryConfig};
use topk_rs::{Client, ClientConfig};

use crate::auth::{Auth, Config};
use crate::config;
use crate::management::{Client as ManagementClient, DataPlaneToken};

#[derive(clap::Args, Clone)]
pub struct Endpoint {
    /// TopK API key
    #[arg(
        long,
        env = "TOPK_API_KEY",
        global = true,
        hide_env_values = true,
        help_heading = "Global options"
    )]
    pub api_key: Option<String>,

    /// Region to read and write; list available regions at https://docs.topk.io/regions
    #[arg(
        long,
        env = "TOPK_REGION",
        global = true,
        help_heading = "Global options"
    )]
    pub region: Option<String>,

    /// Project to use when authenticating with `topk login` instead of an API key
    /// (default: the organization's only project)
    #[arg(
        long,
        env = "TOPK_PROJECT",
        global = true,
        help_heading = "Global options"
    )]
    pub project: Option<String>,

    /// API domain; the endpoint is <REGION>.api.<HOST>
    #[arg(
        long,
        env = "TOPK_HOST",
        default_value = "topk.io",
        global = true,
        help_heading = "Global options"
    )]
    pub host: String,

    /// Connect over HTTPS (default: true; --https false for a plaintext endpoint)
    #[arg(
        long,
        env = "TOPK_HTTPS",
        default_value = "true",
        num_args = 0..=1,
        default_missing_value = "true",
        global = true,
        help_heading = "Global options"
    )]
    pub https: bool,

    #[command(flatten)]
    pub auth: Config,
}

impl Endpoint {
    /// `--api-key`/`TOPK_API_KEY`.
    pub fn api_key(&self) -> Option<String> {
        self.api_key.clone().filter(|v| !v.is_empty())
    }

    pub fn auth(&self) -> Result<Auth> {
        Auth::new(&self.auth, config::dir().context("no config directory")?)
    }

    pub fn management(&self) -> Result<ManagementClient> {
        let protocol = if self.https { "https" } else { "http" };
        let mut endpoint = GrpcEndpoint::from_shared(format!("{protocol}://api.{}", self.host))?;
        if self.https {
            endpoint = endpoint.tls_config(ClientTlsConfig::new().with_native_roots())?;
        }
        Ok(ManagementClient::new(endpoint, self.auth()?))
    }

    /// Mints a data plane token for `--project`, or the organization's only project.
    pub async fn data_plane_token(&self) -> Result<DataPlaneToken> {
        let project = self.project.as_deref().filter(|v| !v.is_empty());
        self.management()?.data_plane_token(project).await
    }

    /// An API key wins; otherwise the `topk login` session mints a token.
    pub async fn client(&self) -> Result<Client> {
        let region = self.region.as_deref().filter(|v| !v.is_empty()).context(
            "--region is required (or set TOPK_REGION). \
             List available regions with `topk region list`",
        )?;
        let api_key = match self.api_key() {
            Some(api_key) => api_key,
            None => self
                .data_plane_token()
                .await
                .context(
                    "authenticating with the `topk login` session (no TOPK_API_KEY or --api-key)",
                )?
                .token,
        };
        // A batch tool rides out `SlowDown`: retries never run out, an hour of
        // continuous throttling fails the request, and `--resume` picks up.
        Ok(Client::new(
            ClientConfig::new(&api_key, region)
                .with_host(&self.host)
                .with_https(self.https)
                .with_retry_config(RetryConfig {
                    max_retries: usize::MAX,
                    timeout: Duration::from_secs(60 * 60),
                    backoff: BackoffConfig {
                        init_backoff: Duration::from_millis(250),
                        ..BackoffConfig::default()
                    },
                }),
        ))
    }
}
