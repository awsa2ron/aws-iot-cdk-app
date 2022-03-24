import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_events from 'aws-cdk-lib/aws-lambda-event-sources';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as iot_actions from '@aws-cdk/aws-iot-actions-alpha';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as timestream from 'aws-cdk-lib/aws-timestream';
import * as iam from 'aws-cdk-lib/aws-iam';

const IOT_RULE_SQL = "SELECT * FROM 'iot/stream'"

export interface iotStreamProcessingProps {
    iot_rule_name: string;
    iot_rule_sql?: string;
    stream_name: string;
    stream_partition_key?: string;
    lambda_event_batch_size?: number;
    lambda_event_max_batching_window?: Duration;
    lambda_name: string;
    lambda_discription?: string;
    lambda_patch: string;
    lambda_runtime?: lambda.Runtime;
    lambda_architecture?: lambda.Architecture;
    lambda_handler?: string;
    database_table?: timestream.CfnTable;
    role_name: string;
    log_group?: logs.LogGroup;
}

export class iotStreamProcessing extends Construct {
    constructor(scope: Construct, id: string, props: iotStreamProcessingProps) {
        super(scope, id);

        // Create AWS IAM role and trust policy.
        let role = new iam.Role(this, props.role_name, {
            roleName: props.role_name,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        })
        //  + permissions policy
        role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['timestream:WriteRecords'],
            // should be like this:
            // "arn:aws:timestream:<us-east-1>:<account_id>:database/sampleDB/table/DevOps"
            resources: ['*'],
        }));
        // + another permissions policy
        role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['timestream:DescribeEndpoints'],
            resources: ['*'],
        }));
        // + AWSLambdaBasicExecutionRole permissions policy
        role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));


        // Create AWS IoT rule
        let rule = new iot.TopicRule(this, props.iot_rule_name, {
            topicRuleName: props.iot_rule_name,
            sql: iot.IotSql.fromStringAsVer20160323(props.iot_rule_sql || IOT_RULE_SQL),
            // errorAction: new iot_actions.CloudWatchLogsAction(props.log_group),
        });

        // Create Kinesis data stream
        let stream = new kinesis.Stream(this, props.stream_name, {
            streamName: props.stream_name,
        });

        // Create Lambda
        let func = new lambda.Function(this, props.lambda_name, {
            role: role,
            functionName: props.lambda_name,
            description: props.lambda_discription || 'on' + props.lambda_architecture,
            code: lambda.Code.fromAsset(
                props.lambda_patch,
            ),
            runtime: props.lambda_runtime || lambda.Runtime.PROVIDED_AL2,
            architecture: props.lambda_architecture || lambda.Architecture.ARM_64,
            handler: props.lambda_handler || 'not.required',
            environment: {
                RUST_BACKTRACE: '1',
            },
        })

        // AWS IoT rule -> Kinesis data stream
        rule.addAction(new iot_actions.KinesisPutRecordAction(stream, {
            partitionKey: props.stream_partition_key || '${newuuid()}',
        }));

        // Kinesis data stream -> Lambda event source mapping
        let stream_source = new lambda_events.KinesisEventSource(stream, {
            batchSize: props.lambda_event_batch_size || 100,
            maxBatchingWindow: props.lambda_event_max_batching_window || Duration.minutes(1),
            // The position in a stream from which to start reading. Required
            startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        });

        // Lambda event source mapping -> AWS Lambda function
        func.addEventSource(stream_source);
    }
}