use anyhow::{bail, Result};
use tonic::transport::Endpoint;

use crate::auth::Auth;
use crate::management::proto::collection_service_client::CollectionServiceClient;
use crate::management::proto::data_plane_service_client::DataPlaneServiceClient;
use crate::management::proto::project_service_client::ProjectServiceClient;
use crate::management::proto::region_service_client::RegionServiceClient;
use crate::management::proto::{ListProjectsRequest, MintAccessTokenRequest};
use crate::management::Transport;

/// A short-lived data plane token minted from the `topk login` session.
pub struct DataPlaneToken {
    pub token: String,
    pub project_id: String,
    /// Unix seconds.
    pub expires_at: i64,
}

#[derive(Clone)]
pub struct Client {
    pub projects: ProjectServiceClient<Transport>,
    pub collections: CollectionServiceClient<Transport>,
    pub regions: RegionServiceClient<Transport>,
    pub data_plane: DataPlaneServiceClient<Transport>,
}

impl Client {
    pub fn new(endpoint: Endpoint, auth: Auth) -> Self {
        let transport = Transport::new(endpoint.connect_lazy(), auth);
        Self {
            projects: ProjectServiceClient::new(transport.clone()),
            collections: CollectionServiceClient::new(transport.clone()),
            regions: RegionServiceClient::new(transport.clone()),
            data_plane: DataPlaneServiceClient::new(transport),
        }
    }

    /// Mints a data plane token for `project`, or the organization's only project.
    pub async fn data_plane_token(&mut self, project: Option<&str>) -> Result<DataPlaneToken> {
        let project_id = match project {
            Some(project_id) => project_id.to_string(),
            None => self.only_project().await?,
        };
        let res = self
            .data_plane
            .mint_access_token(MintAccessTokenRequest {
                project_id: project_id.clone(),
            })
            .await?
            .into_inner();
        Ok(DataPlaneToken {
            token: res.token,
            project_id,
            expires_at: res.expires_at,
        })
    }

    async fn only_project(&mut self) -> Result<String> {
        let projects = self
            .projects
            .list_projects(ListProjectsRequest {})
            .await?
            .into_inner()
            .projects;
        match projects.as_slice() {
            [project] => Ok(project.project_id.clone()),
            [] => bail!("no projects yet. Create one with `topk project create <NAME>`."),
            _ => bail!(
                "several projects; pass --project (or set TOPK_PROJECT) to one of: {}",
                projects
                    .iter()
                    .map(|p| format!("{} ({})", p.project_id, p.name))
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
        }
    }
}
