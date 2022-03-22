import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as lambda_events from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import * as sqs from 'aws-cdk-lib/aws-sqs';

import { iotCustomAuth } from './iot_custom_auth';

const APP_NAME = 'iotCdkApp'
const LOG_GROUP_NAME = APP_NAME + 'Log'
const CONSTRUCT_NAME = APP_NAME + 'CustomAuthConstruct'
const CUSTOM_AUTH_CONSTRUCT_NAME = APP_NAME + 'CustomAuthConstruct'
const STREAM_CONSTRUCT_NAME = APP_NAME + 'StreamConstruct'
const DISCON_CONSTRUCT_NAME = APP_NAME + 'DisconnectionsConstruct'

const STREAM_NAME = APP_NAME + 'Stream'
const STREAM_PARTITION_KEY = APP_NAME + 'Partitionkey'
const IOT_STREAM_RULE_NAME = APP_NAME + 'StreamRule'
const IOT_STREAM_RULE_SQL = "SELECT * FROM 'iot/stream'"
const STREAM_LAMBDA_NAME = APP_NAME + 'StreamLambda'
const STREAM_LAMBDA_PATCH = 'functions/stream-process/lambda'
const STREAM_LAMBDA_DESCRIPTION = 'IoT rule to kinesis, then triger a lambda do something'

const QUEUE_NAME = APP_NAME + 'Queue'
const DISCON_LAMBDA_NAME = APP_NAME + 'DisconLambda'
const DISCON_LAMBDA_PATCH = 'functions/disconnections/lambda'
const DISCON_LAMBDA_DESCRIPTION = 'IoT rule to sqs, then triger a lambda for disconnections'
const IOT_QUEUE_RULE_NAME = APP_NAME + 'QueueRule'
const IOT_QUEUE_RULE_SQL = "SELECT * FROM '$aws/events/presence/disconnected/+'"

const CUSTOM_AUTH_NAME = 'CustomAuth'
const CUSTOM_AUTH_LAMBDA_NAME = 'iotCdkApp' + 'CustomAuthLambda'
const CUSTOM_AUTH_LAMBDA_PATCH = 'functions/custom-authorizer/lambda'
const CUSTOM_AUTH_LAMBDA_DESCRIPTION = 'IoT custom authorizer'

export class Cdkv2SamLambdaRustStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // AWS CloudWatch log group
    let log_group = new logs.LogGroup(this, LOG_GROUP_NAME + 'Id', {
      logGroupName: LOG_GROUP_NAME,
    });

    // IoT custom authentication.
    // Any IoT message through either MQTT or HTTP, even MQTT over Websocket,
    // sent to IoT broker will trigger a custom authorizer for authentication.
    // Then the Lambda function receives the credentials and connection metadata 
    // in the request and makes an authentication decision. returns the results of 
    // the authentication decision and an AWS IoT Core policy document
    new iotCustomAuth(this, CUSTOM_AUTH_NAME, {
      lambda_name: CUSTOM_AUTH_NAME,
      lambda_patch: CUSTOM_AUTH_LAMBDA_PATCH,
    });

    // IoT data stream processing.
    // IoT rule will be triggered and send all iot message to Kinesis data stream.
    // After Kinesis received more than 100 message or longer than 1 minutes, 
    // lambda will be triggered and process those batch data in Kinesis.
    // Finally, the lambda will write records to Timestream or other service.
    new iotStreamProcess(this, STREAM_CONSTRUCT_NAME, { logGroup: log_group });

    // IoT devices disconnections.
    // When a client receives a lifecycle event, you can enqueue a message, for 5 seconds.
    // When that message becomes available and is processed, you can first check if the 
    // device is still offline before taking further action.
    // One way to do this is by using SQS Delay Queues. 
    // https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-delay-queues.html
    new iotDisconnections(this, DISCON_CONSTRUCT_NAME, { logGroup: log_group });
  }
}

export interface iotDisconnectionsProps {
  logGroup?: logs.LogGroup;
}

export class iotDisconnections extends Construct {
  constructor(scope: Construct, id: string, props: iotDisconnectionsProps = {}) {
    super(scope, id);
    // AWS SQS
    let discon_queue = new sqs.Queue(this, 'Queue', {
      queueName: QUEUE_NAME,
      deliveryDelay: Duration.seconds(5),
    });
    // AWS IoT rule action
    // Write(PutRecord) to AWS Kinesis Data Stream
    let queue_action = new actions.SqsQueueAction(discon_queue, {
    });

    // AWS IoT rule
    let queueTopicRule = new iot.TopicRule(this, IOT_QUEUE_RULE_NAME + 'Id', {
      topicRuleName: IOT_QUEUE_RULE_NAME,
      sql: iot.IotSql.fromStringAsVer20160323(IOT_QUEUE_RULE_SQL),
      // errorAction: new actions.CloudWatchLogsAction(props.logGroup),
    });
    queueTopicRule.addAction(queue_action);

    // AWS Lambda function
    let discon_lambda = new lambda.Function(this, DISCON_LAMBDA_NAME + 'Id', {
      functionName: DISCON_LAMBDA_NAME,
      description: DISCON_LAMBDA_DESCRIPTION,
      code: lambda.Code.fromAsset(
        DISCON_LAMBDA_PATCH,
      ),
      runtime: lambda.Runtime.PROVIDED_AL2,
      architecture: lambda.Architecture.X86_64,
      handler: 'not.required',
      environment: {
        RUST_BACKTRACE: '1',
      },
    });
    // AWS Lambda function event mapping
    let discon_source = new lambda_events.SqsEventSource(discon_queue, {
      batchSize: 100,
      maxBatchingWindow: Duration.seconds(5),
    });
    discon_lambda.addEventSource(discon_source);
  }
}

export interface iotStreamProcessProps {
  logGroup?: logs.LogGroup;
}

export class iotStreamProcess extends Construct {
  constructor(scope: Construct, id: string, props: iotStreamProcessProps = {}) {
    super(scope, id);
    // Kinesis data stream
    let data_stream = new kinesis.Stream(this, STREAM_NAME + 'Id', {
      streamName: STREAM_NAME,
    });

    // AWS IoT rule action
    // Write(PutRecord) to AWS Kinesis Data Stream
    let stream_action = new actions.KinesisPutRecordAction(data_stream, {
      partitionKey: STREAM_PARTITION_KEY,
    });

    // AWS IoT rule
    let stream_topic_rule = new iot.TopicRule(this, IOT_STREAM_RULE_NAME + 'Id', {
      topicRuleName: IOT_STREAM_RULE_NAME,
      sql: iot.IotSql.fromStringAsVer20160323(IOT_STREAM_RULE_SQL),
      // errorAction: new actions.CloudWatchLogsAction(log_group),
    });
    stream_topic_rule.addAction(stream_action);

    // AWS Lambda function
    let stream_lambda = new lambda.Function(this, STREAM_LAMBDA_NAME + 'Id', {
      functionName: STREAM_LAMBDA_NAME,
      description: STREAM_LAMBDA_DESCRIPTION,
      code: lambda.Code.fromAsset(
        STREAM_LAMBDA_PATCH,
      ),
      runtime: lambda.Runtime.PROVIDED_AL2,
      architecture: lambda.Architecture.X86_64,
      handler: 'not.required',
      environment: {
        RUST_BACKTRACE: '1',
      },
    });

    // AWS Lambda function event mapping
    let stream_source = new lambda_events.KinesisEventSource(data_stream, {
      batchSize: 100,
      maxBatchingWindow: Duration.minutes(1),
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
    });
    stream_lambda.addEventSource(stream_source);


  }
}
