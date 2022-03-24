import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as timestream from 'aws-cdk-lib/aws-timestream';

import { iotCustomAuthentication } from './iot_custom_auth';
import { iotStreamProcessing } from './iot_stream_proc';
import { iotDisconnections } from './iot_disconnections';

const APP_NAME = 'iotCdkApp'

const LOG_GROUP_NAME = APP_NAME + 'Log'

const DATABASE_NAME = APP_NAME + 'DB'
const DATABASE_TABLE_NAME = DATABASE_NAME + 'Table'

const STREAM_NAME = APP_NAME + 'Stream'
const STREAM_LAMBDA_PATCH = 'functions/stream-process/target/lambda'

const QUEUE_NAME = APP_NAME + 'Queue'
const DISCON_LAMBDA_PATCH = 'functions/disconnections/target/lambda'

const CUSTOM_AUTH_NAME = APP_NAME + 'CustomAuth'
const CUSTOM_AUTH_LAMBDA_PATCH = 'functions/custom-authorizer/target/lambda'
const AUTHORIZER_NAME = 'iotCustomAuthorizer'

export class Cdkv2SamLambdaRustStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    // AWS Timestream DB.
    // Create a Timestream DB very first, in case it not ready when using.
    new timestream.CfnDatabase(this, 'iotDatabase', {
      databaseName: DATABASE_NAME,
    })
    // AWS CloudWatch log group
    new logs.LogGroup(this, LOG_GROUP_NAME, {
      logGroupName: LOG_GROUP_NAME,
    });

    // IoT custom authentication.
    // Any IoT message through either MQTT or HTTP, even MQTT over Websocket,
    // sent to IoT broker will trigger a custom authorizer for authentication.
    // Then the Lambda function receives the credentials and connection metadata 
    // in the request and makes an authentication decision. returns the results of 
    // the authentication decision and an AWS IoT Core policy document
    new iotCustomAuthentication(this, 'iotCustomAuthentication', {
      authorizerName: AUTHORIZER_NAME,
      lambdaName: CUSTOM_AUTH_NAME + 'Lambda',
      lambdaPatch: CUSTOM_AUTH_LAMBDA_PATCH,
      lambdaEnv: {
        RUST_BACKTRACE: '1',
        USERNAME: 'aaron',
        PASSWORD: 'tsui',
      }
    });

    // AWS Timestream DB table.
    // Create a DB table for data storage, 
    let db_table = new timestream.CfnTable(this, 'iotDatabaseTable', {
      tableName: DATABASE_TABLE_NAME,
      databaseName: DATABASE_NAME,
    })

    // IoT data stream processing.
    // IoT rule will be triggered and send all iot message to Kinesis data stream.
    // After Kinesis received more than 100 message or longer than 1 minutes, 
    // lambda will be triggered and process those batch data in Kinesis.
    // Finally, the lambda will write records to Timestream or other service.
    new iotStreamProcessing(this, 'iotStreamProcessing', {
      iotRuleName: STREAM_NAME + 'Rule',
      streamName: STREAM_NAME,
      streamPartitionKey: STREAM_NAME + 'PartitionKey',
      lambdaName: STREAM_NAME + 'Lambda',
      lambdaPatch: STREAM_LAMBDA_PATCH,
      databaseTable: db_table,
      role_name: STREAM_NAME + 'Role',
    });

    // IoT devices disconnections.
    // When a client receives a lifecycle event, you can enqueue a message, for 5 seconds.
    // When that message becomes available and is processed, you can first check if the 
    // device is still offline before taking further action.
    // One way to do this is by using SQS Delay Queues. 
    // https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-delay-queues.html
    new iotDisconnections(this, 'iotDisconnections', {
      iotRuleName: QUEUE_NAME + 'Rule',
      queueName: QUEUE_NAME,
      lambdaName: QUEUE_NAME + 'Lambda',
      lambdaPatch: DISCON_LAMBDA_PATCH,
    });

  }
}
