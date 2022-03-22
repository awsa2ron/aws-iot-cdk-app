use core::slice;

use lambda_runtime::{service_fn, Error, LambdaEvent};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::env;

#[derive(Debug)]
enum Protocol {
    https,
    mqtts,
    mqtt_over_ws,
}
#[derive(Deserialize)]
struct Request {
    token: String,
    signatureVerified: bool,
    protocols: Vec<String>,
    protocolData: Value,
    connectionMetadata: Map<String, Value>,
}

#[derive(Serialize)]
struct Response {
    isAuthenticated: bool,
    principalId: String,
    disconnectAfterInSeconds: u32,
    refreshAfterInSeconds: u32,
    policyDocuments: Value,
}

#[derive(Debug, Serialize)]
struct CustomError {
    is_authenticated: bool,
    req_id: String,
    msg: String,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    // The runtime logging can be enabled here by initializing `tracing` with `tracing-subscriber`
    // While `tracing` is used internally, `log` can be used as well if preferred.
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        // this needs to be set to false, otherwise ANSI color codes will
        // show up in a confusing manner in CloudWatch logs.
        .with_ansi(false)
        // disabling time is handy because CloudWatch will add the ingestion time.
        .without_time()
        .init();

    // call the actual handler of the request
    let func = service_fn(func);
    lambda_runtime::run(func).await?;
    Ok(())
}
// let protocal_filter = |protocols| -> Option<Protocol> {
fn protocal_filter(protocols: Vec<String>) -> Option<Protocol> {
    if let [first, middle @ .., last] = protocols.as_slice() {
        tracing::info!("{} {:?} {}", first, middle, last);
        if middle.is_empty() && last == "http" {
            // tracing::info!("HTTPS");
            return Some(Protocol::https);
        } else if middle.is_empty() && last == "mqtt" {
            // tracing::info!("MQTT over TLS");
            return Some(Protocol::mqtts);
        } else if middle.len() == 1 && middle[0] == "http" && last == "mqtt" {
            // tracing::info!("MQTT over Websocket");
            return Some(Protocol::mqtt_over_ws);
        }
    }
    tracing::info!("Unknown protocol {:?}", protocols);
    None
}
/// The actual handler of the Lambda request.
pub(crate) async fn func(event: LambdaEvent<Value>) -> Result<Value, Error> {
    let (event, ctx) = event.into_parts();
    let e: Request = serde_json::from_value(event)?;

    if let Some(protocol) = protocal_filter(e.protocols) {
        tracing::info!("protocol is {:?}", protocol);
    }

    for (key, value) in e.connectionMetadata {
        tracing::info!("meta data is {}:{}", key, value);
        // let new = e.connectionMetadata.entry(key);
        // *new = "0987654321"
    }

    let username = std::env::var("USERNAME").unwrap_or("null".to_string());
    tracing::info!("env USERNAME:{:?}", username);
    let password = std::env::var("PASSWORD").unwrap_or("null".to_string());
    tracing::info!("env PASSWORD:{:?}", password);

    let resp = Response {
        isAuthenticated: true,
        principalId: "xxxxx".to_string(),
        disconnectAfterInSeconds: 86400,
        refreshAfterInSeconds: 300,
        policyDocuments: json!([
          {
            "Version": "2012-10-17",
            "Statement": [
               {
                  "Action": "iot:Publish",
                  "Effect": "Allow",
                  "Resource": "arn:aws:iot:us-east-1:<your_aws_account_id>:topic/customauthtesting"
                }
             ]
           }
        ]),
    };

    return Ok(json!(resp));
    //   tracing::info!(token, "token is");

    //   let resp = Response {
    //     req_id: ctx.request_id,
    //     // msg: (stage + "OK!").into(),
    //     msg: "OK!".into(),
    //   };

    //   return Ok(json!(resp));

    //   check what action was requested
    //   match serde_json::from_value::<Request>(event)?.event_type {
    //       EventType::SimpleError => {
    //           // generate a simple text message error using `simple_error` crate
    //           return Err(Box::new(simple_error::SimpleError::new("A simple error as requested!")));
    //       }
    //       EventType::CustomError => {
    //           // generate a custom error using our own structure
    //           let cust_err = CustomError {
    //               is_authenticated: ctx.identity.is_some(),
    //               req_id: ctx.request_id,
    //               msg: "A custom error as requested!".into(),
    //           };
    //           return Err(Box::new(cust_err));
    //       }
    //       EventType::ExternalError => {
    //           // try to open a non-existent file to get an error and propagate it with `?`
    //           let _file = File::open("non-existent-file.txt")?;

    //           // it should never execute past the above line
    //           unreachable!();
    //       }
    //       EventType::Panic => {
    //           panic!();
    //       }
    //       EventType::Response => {
    //           // let stage = std::env::var("STAGE").expect("Missing STAGE env var");
    //           // generate and return an OK response in JSON format
    //           let resp = Response {
    //               req_id: ctx.request_id,
    //               // msg: (stage + "OK!").into(),
    //               msg: ctx.env_config.function_name + "OK!".into(),
    //           };

    //           return Ok(json!(resp));
    //       }
    //   }
}
