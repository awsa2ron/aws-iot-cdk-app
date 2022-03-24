import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_events from 'aws-cdk-lib/aws-lambda-event-sources';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import * as logs from 'aws-cdk-lib/aws-logs';

const IOT_RULE_SQL = "SELECT * FROM 'iot/queue'"

export interface iotDisconnectionsProps {
    iotRuleName: string;
    iotRuleSQL?: string;
    queueName: string;
    queueDeliveryDelay?: Duration;
    lambda_event_max_batching_window?: Duration;
    lambdaEventBatchSize?: number;
    lambdaName: string;
    lambdaDiscription?: string;
    lambdaPatch: string;
    lambdaRuntime?: lambda.Runtime;
    lambdaArchitecture?: lambda.Architecture;
    lambdaHandler?: string;
    logGroup?: logs.LogGroup;
}

export class iotDisconnections extends Construct {
    constructor(scope: Construct, id: string, props: iotDisconnectionsProps) {
        super(scope, id);

        // Create AWS SQS
        let queue = new sqs.Queue(this, 'Queue', {
            queueName: props.queueName,
            deliveryDelay: props.queueDeliveryDelay || Duration.seconds(5),
        });
        // Create AWS IoT rule
        let iot_rule = new iot.TopicRule(this, props.iotRuleName, {
            topicRuleName: props.iotRuleName,
            sql: iot.IotSql.fromStringAsVer20160323(props.iotRuleSQL || IOT_RULE_SQL),
            // errorAction: new actions.CloudWatchLogsAction(props.logGroup),
        });

        // Create AWS Lambda function event mapping
        let discon_source = new lambda_events.SqsEventSource(queue, {
            batchSize: props.lambdaEventBatchSize || 100,
            maxBatchingWindow: props.lambda_event_max_batching_window || Duration.seconds(5),
        });

        // Create AWS Lambda function
        let func = new lambda.Function(this, props.lambdaName, {
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
        });

        // IoT disconnected events -> sqs -> lambda
        iot_rule.addAction(new actions.SqsQueueAction(queue));
        func.addEventSource(discon_source);

    }
}
