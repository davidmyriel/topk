use std::collections::HashMap;

use chrono::{DateTime, Utc};
use topk_rs::proto::v1::control::FieldSpec;

pub type Schema = HashMap<String, FieldSpec>;

#[derive(Clone, Copy)]
pub struct Ctx<'a> {
    pub schema: &'a Schema,
    pub now: DateTime<Utc>,
}

impl<'a> Ctx<'a> {
    pub fn new(schema: &'a Schema) -> Self {
        Self {
            schema,
            now: Utc::now(),
        }
    }
}

pub mod agg;
pub mod compile;
pub mod doc;
pub mod field;
pub mod rank;
pub mod score;

const RANK_PREFIX: &str = "topk_es_rank_";
const RANK_SCORE: &str = "topk_es_rank_score";
const RANK_BM25: &str = "topk_es_rank_bm25";
const RANK_ANN: &str = "topk_es_rank_ann";
