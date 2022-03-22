#!/usr/bin/env bash
# Custom authentication

cd functions/custom-authorizer && \
mkdir -p lambda && \
cargo build --target x86_64-unknown-linux-musl && \
cp target/x86_64-unknown-linux-musl/debug/bootstrap lambda && \
cd - && \
cdk synth --no-staging && \
sam local invoke iotCdkAppCustomAuthLambda \
--event functions/custom-authorizer/json/event.json \
--template ./cdk.out/Cdkv2SamLambdaRustStack.template.json 
