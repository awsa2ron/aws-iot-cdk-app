use lambda_runtime::{service_fn, Error, LambdaEvent};
use log::LevelFilter;
use serde_json::{json, Value};
use simple_logger::SimpleLogger;

#[tokio::main]
async fn main() -> Result<(), Error> {
  SimpleLogger::new()
    .with_level(LevelFilter::Info)
    .init()
    .unwrap();

  let func = service_fn(func);
  lambda_runtime::run(func).await?;
  Ok(())
}

pub(crate) async fn func(event: LambdaEvent<Value>) -> Result<Value, Error> {
  let (event, ctx) = event.into_parts();
  let message = event["message"].as_str().unwrap_or("world");
  let first_name = event["firstName"].as_str().unwrap_or("Anonymous");

  let response = format!("Hello, {}! Your name is {}", message, first_name);
  log::info!("{}", response);

  Ok(json!({ "response": response }))
}
