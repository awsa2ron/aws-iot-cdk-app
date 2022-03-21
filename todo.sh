#!/usr/bin/env bash

cd functions && \
cargo build --target x86_64-unknown-linux-musl && \
cp target/x86_64-unknown-linux-musl/debug/bootstrap lambda && \
cd .. && \
cdk synth --no-staging && \
sam local invoke iot-cdk-app-lambda \
--event test.json \
--template ./cdk.out/Cdkv2SamLambdaRustStack.template.json
