use std::collections::HashMap;

use serde_json::{json, Value};
use test_context::test_context;

use super::common::{response, tenant_dir, AuthTestContext};

fn form(body: &str) -> HashMap<String, String> {
    url::form_urlencoded::parse(body.as_bytes())
        .into_owned()
        .collect()
}

fn authorization() -> Value {
    json!({
        "device_code": "device-1",
        "user_code": "ABCD-EFGH",
        "verification_uri": "https://login.test/activate",
        "verification_uri_complete": "https://login.test/activate?user_code=ABCD-EFGH",
        "expires_in": 900,
        "interval": 1,
    })
}

#[test_context(AuthTestContext)]
#[tokio::test]
async fn device_login_polls_until_approved_and_saves_the_session(ctx: &mut AuthTestContext) {
    let auth = ctx.server.auth(ctx.dir.path());
    let (login, _) = tokio::join!(auth.device_login(), ctx.server.reply(200, authorization()));
    let login = login.unwrap();
    let start = form(&ctx.server.request().await);
    assert_eq!(start["client_id"], ctx.server.config().client_id);
    assert_eq!(start["audience"], ctx.server.config().audience);
    assert_eq!(start["scope"], "openid profile email offline_access");
    assert_eq!(
        login.url().unwrap().as_str(),
        "https://login.test/activate?user_code=ABCD-EFGH"
    );
    assert_eq!(login.user_code(), "ABCD-EFGH");
    assert_eq!(login.expires_in(), 900);

    ctx.server
        .reply(400, json!({"error": "authorization_pending"}))
        .await;
    ctx.server.reply(200, response(3600, Some("refresh"))).await;
    login.finish().await.unwrap();
    for _ in 0..2 {
        let poll = form(&ctx.server.request().await);
        assert_eq!(
            poll["grant_type"],
            "urn:ietf:params:oauth:grant-type:device_code"
        );
        assert_eq!(poll["device_code"], "device-1");
        assert_eq!(poll["client_id"], ctx.server.config().client_id);
    }
    let credentials = std::fs::read_to_string(
        tenant_dir(ctx.dir.path(), &ctx.server.url).join("credentials.toml"),
    )
    .unwrap();
    assert!(credentials.contains("refresh_token = \"refresh\""));
    assert_eq!(auth.access_token().await.unwrap(), "access");
}

#[test_context(AuthTestContext)]
#[tokio::test]
async fn denied_or_expired_device_login_saves_nothing(ctx: &mut AuthTestContext) {
    let auth = ctx.server.auth(ctx.dir.path());
    for (error, message) in [
        ("access_denied", "login was denied"),
        ("expired_token", "the login code expired"),
    ] {
        ctx.server.reply(200, authorization()).await;
        let login = auth.device_login().await.unwrap();
        ctx.server.request().await;
        ctx.server.reply(400, json!({"error": error})).await;
        let err = login.finish().await.unwrap_err();
        assert!(err.to_string().contains(message), "{err:#}");
        ctx.server.request().await;
    }
    assert!(!tenant_dir(ctx.dir.path(), &ctx.server.url)
        .join("credentials.toml")
        .exists());
}

#[test_context(AuthTestContext)]
#[tokio::test]
async fn unsupported_device_grant_is_reported(ctx: &mut AuthTestContext) {
    let auth = ctx.server.auth(ctx.dir.path());
    ctx.server
        .reply(403, json!({"error": "unauthorized_client"}))
        .await;
    let err = auth.device_login().await.err().unwrap();
    assert!(
        format!("{err:#}").contains("unauthorized_client"),
        "{err:#}"
    );
}
