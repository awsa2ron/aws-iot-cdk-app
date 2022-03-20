import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as events from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';

const STREAM_NAME = 'iot-cdk-app-stream'
const STREAM_PARTITION_KEY = 'iot-cdk-app-partition-key'
const LOG_GROUP_NAME = 'iot-cdk-app-log'
const IOT_RULE_NAME = 'iot-cdk-app-rule'
const IOT_RULE_SQL = "SELECT * FROM 'test/iotrule'"
const LAMBDA_NAME = 'iot-cdk-app-lambda'
const LAMBDA_DESCRIPTION = 'IoT rule to kinesis, then triger a lambda do something'
const LAMBDA_HANDLER = 'not.required'

export class Cdkv2SamLambdaRustStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Kinesis data stream
    let stream = new kinesis.Stream(this, STREAM_NAME);

    // AWS IoT rule action
    // Write(PutRecord) to AWS Kinesis Data Stream
    let action = new actions.KinesisPutRecordAction(stream, {
      partitionKey: STREAM_PARTITION_KEY,
    });

    // AWS CloudWatch log group
    let logGroup = new logs.LogGroup(this, LOG_GROUP_NAME);

    // AWS IoT rule
    let topicRule = new iot.TopicRule(this, IOT_RULE_NAME, {
      sql: iot.IotSql.fromStringAsVer20160323(IOT_RULE_SQL),
      errorAction: new actions.CloudWatchLogsAction(logGroup),
    });
    topicRule.addAction(action);

    // AWS Lambda function
    let stream_lambda = new lambda.Function(this, LAMBDA_NAME, {
      description: LAMBDA_DESCRIPTION,
      code: lambda.Code.fromAsset(
        'functions/lambda'
      ),
      runtime: lambda.Runtime.PROVIDED_AL2,
      architecture: lambda.Architecture.X86_64,
      handler: LAMBDA_HANDLER,
      environment: {
        RUST_BACKTRACE: '1',
      },
    });

    // AWS Lambda function event mapping
    let stream_source = new events.KinesisEventSource(stream, {
      batchSize: 10, // default
      maxBatchingWindow: Duration.minutes(1),
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
    });
    stream_lambda.addEventSource(stream_source);
  }
}
