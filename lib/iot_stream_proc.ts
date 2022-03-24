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
    iotRuleName: string;
    iotRuleSQL?: string;
    streamName: string;
    streamPartitionKey?: string;
    lambdaEventBatchSize?: number;
    lambdaTumblingWindow?: Duration;
    lambdaName: string;
    lambdaDiscription?: string;
    lambdaPatch: string;
    lambdaRuntime?: lambda.Runtime;
    lambdaArchitecture?: lambda.Architecture;
    lambdaHandler?: string;
    databaseTable?: timestream.CfnTable;
    role_name: string;
    logGroup?: logs.LogGroup;
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
        let rule = new iot.TopicRule(this, props.iotRuleName, {
            topicRuleName: props.iotRuleName,
            sql: iot.IotSql.fromStringAsVer20160323(props.iotRuleSQL || IOT_RULE_SQL),
            // errorAction: new iot_actions.CloudWatchLogsAction(props.logGroup),
        });

        // Create Kinesis data stream
        let stream = new kinesis.Stream(this, props.streamName, {
            streamName: props.streamName,
        });

        // Create Lambda
        let func = new lambda.Function(this, props.lambdaName, {
            role: role,
            functionName: props.lambdaName,
            description: props.lambdaDiscription || 'on' + props.lambdaArchitecture,
            code: lambda.Code.fromAsset(
                props.lambdaPatch,
            ),
            runtime: props.lambdaRuntime || lambda.Runtime.PROVIDED_AL2,
            architecture: props.lambdaArchitecture || lambda.Architecture.ARM_64,
            handler: props.lambdaHandler || 'not.required',
            environment: {
                RUST_BACKTRACE: '1',
            },
        })

        // AWS IoT rule -> Kinesis data stream
        rule.addAction(new iot_actions.KinesisPutRecordAction(stream, {
            partitionKey: props.streamPartitionKey || '${newuuid()}',
        }));

        // Kinesis data stream -> Lambda event source mapping
        let stream_source = new lambda_events.KinesisEventSource(stream, {
            batchSize: props.lambdaEventBatchSize || 100,
            // maxBatchingWindow: props.lambdaTumblingWindow || Duration.minutes(1),
            tumblingWindow: props.lambdaTumblingWindow || Duration.minutes(1),
            // The position in a stream from which to start reading. Required
            startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        });

        // Lambda event source mapping -> AWS Lambda function
        func.addEventSource(stream_source);
    }
}