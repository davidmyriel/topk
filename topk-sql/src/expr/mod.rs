use topk_rs::proto::v1::data::{FunctionExpr, LogicalExpr, TextExpr, Value};

mod aggregate;
mod filter;
mod function;
mod logical;
mod regexp;
mod select;
mod typed;
mod value;

#[derive(Clone, Debug)]
pub enum Expr {
    Literal(Value),
    Logical(LogicalExpr),
    Text(TextExpr),
}

impl Expr {
    pub fn function(func: FunctionExpr) -> Self {
        Self::Logical(LogicalExpr::function(func))
    }
}
