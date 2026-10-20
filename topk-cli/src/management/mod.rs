mod client;
pub use client::{Client, DataPlaneToken};

mod transport;
pub use transport::Transport;

pub mod proto {
    tonic::include_proto!("topk.management.v1");
}
