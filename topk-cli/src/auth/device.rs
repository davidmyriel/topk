use anyhow::Result;
use oauth2::StandardDeviceAuthorizationResponse;
use url::Url;

use crate::auth::{AccessTokenClaims, Auth};

/// A login approved in a browser on any device, so it works where the CLI
/// cannot receive a localhost callback: SSH, containers, cloud agents.
pub struct DeviceLogin<'a> {
    auth: &'a Auth,
    authorization: StandardDeviceAuthorizationResponse,
}

impl<'a> DeviceLogin<'a> {
    pub async fn new(auth: &'a Auth) -> Result<Self> {
        Ok(Self {
            auth,
            authorization: auth.client.authorize_device().await?,
        })
    }

    /// The page that confirms the code, with the code filled in when the server supports it.
    pub fn url(&self) -> Result<Url> {
        let url = match self.authorization.verification_uri_complete() {
            Some(url) => url.secret().as_str(),
            None => self.authorization.verification_uri().as_str(),
        };
        Ok(Url::parse(url)?)
    }

    /// The code the user confirms on the verification page.
    pub fn user_code(&self) -> &str {
        self.authorization.user_code().secret()
    }

    /// Seconds until the code expires.
    pub fn expires_in(&self) -> u64 {
        self.authorization.expires_in().as_secs()
    }

    pub async fn finish(self) -> Result<Option<AccessTokenClaims>> {
        let (session, claims) = self
            .auth
            .client
            .exchange_device_code(&self.authorization)
            .await?;
        self.auth.store.lock().await?.save(session)?;
        Ok(claims)
    }
}
