use aws_sdk_dynamodb::Client;
use lambda_runtime::{service_fn, Error, LambdaEvent};

use serde_json::{json, Value};

#[tokio::main]
async fn main() -> Result<(), Error> {
  tracing_subscriber::fmt()
    .with_max_level(tracing::Level::INFO)
    .with_ansi(false)
    .without_time()
    .init();

  let func = service_fn(func);
  lambda_runtime::run(func).await?;
  Ok(())
}

pub(crate) async fn func(event: LambdaEvent<Value>) -> Result<Value, Error> {
  let shared_config = aws_config::load_from_env().await;
  let client = Client::new(&shared_config);
  let req = client.list_tables().limit(10);
  let resp = req.send().await?;
  tracing::info!("Tables:");

  let names = resp.table_names().unwrap_or_default();

  for name in names {
    tracing::info!(" {}", name);
  }

  Ok(json!({ "response": names }))

  // let (event, ctx) = event.into_parts();
  // tracing::info!("{}", event);
  // let message = event["message"].as_str().unwrap_or("world");
  // let first_name = event["firstName"].as_str().unwrap_or("Anonymous");

  // let response = format!("Hello, {}! Your name is {}", message, first_name);
  // tracing::info!("{}", response);

  // Ok(json!({ "response": response }))
}
