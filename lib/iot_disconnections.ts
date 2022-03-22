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
    iot_rule_name: string;
    iot_rule_sql?: string;
    sqs_name: string;
    sqs_delivery_delay?: Duration;
    lambda_event_batch_size?: number;
    lambda_event_max_batching_window?: Duration;
    lambda_name: string;
    lambda_discription?: string;
    lambda_patch: string;
    lambda_runtime?: lambda.Runtime;
    lambda_architecture?: lambda.Architecture;
    lambda_handler?: string;
    log_group?: logs.LogGroup;
}

export class iotDisconnections extends Construct {
    constructor(scope: Construct, id: string, props: iotDisconnectionsProps) {
        super(scope, id);
        // AWS SQS
        let queue = new sqs.Queue(this, 'Queue', {
            queueName: props.sqs_name,
            deliveryDelay: props.sqs_delivery_delay || Duration.seconds(5),
        });
        // AWS IoT rule action
        // Put IoT disconnected events to sqs
        let queue_action = new actions.SqsQueueAction(queue, {
        });

        // AWS IoT rule
        let iot_rule = new iot.TopicRule(this, props.iot_rule_name, {
            topicRuleName: props.iot_rule_name,
            sql: iot.IotSql.fromStringAsVer20160323(props.iot_rule_sql || IOT_RULE_SQL),
            // errorAction: new actions.CloudWatchLogsAction(props.log_group),
        });
        iot_rule.addAction(queue_action);

        // AWS Lambda function event mapping
        let discon_source = new lambda_events.SqsEventSource(discon_queue, {
            batchSize: props.lambda_event_batch_size || 100,
            maxBatchingWindow: props.lambda_event_max_batching_window || Duration.minutes(1),
        });

        // AWS Lambda function
        new lambda.Function(this, props.lambda_name, {
            functionName: props.lambda_name,
            description: props.lambda_discription || 'on' + props.lambda_architecture,
            code: lambda.Code.fromAsset(
                props.lambda_patch,
            ),
            runtime: props.lambda_runtime || lambda.Runtime.PROVIDED_AL2,
            architecture: props.lambda_architecture || lambda.Architecture.X86_64,
            handler: props.lambda_handler || 'not.required',
            environment: {
                RUST_BACKTRACE: '1',
            },
        })
            .addEventSource(discon_source);

    }
}
