#!/usr/bin/env bash

cd functions/stream-process && \
mkdir -p lambda && \
cargo build --target x86_64-unknown-linux-musl && \
cp target/x86_64-unknown-linux-musl/debug/bootstrap lambda && \
cd - && \
cd functions/disconnections && \
mkdir -p lambda && \
cargo build --target x86_64-unknown-linux-musl && \
cp target/x86_64-unknown-linux-musl/debug/bootstrap lambda && \
cd - && \
cd functions/custom-authorizer && \
mkdir -p lambda && \
cargo build --target x86_64-unknown-linux-musl && \
cp target/x86_64-unknown-linux-musl/debug/bootstrap lambda && \
cd - && \
cdk synth --no-staging && \
sam local invoke iotCdkAppCustomAuthLambda \
--event test.json \
--template ./cdk.out/Cdkv2SamLambdaRustStack.template.json && \
sam local invoke iotCdkAppStreamLambda \
--event test.json \
--template ./cdk.out/Cdkv2SamLambdaRustStack.template.json && \
sam local invoke iotCdkAppDisconLambda \
--event test.json \
--template ./cdk.out/Cdkv2SamLambdaRustStack.template.json
