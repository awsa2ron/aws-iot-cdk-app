import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';



export interface iotCustomAuthProps {
    lambda_name: string;
    lambda_discription?: string;
    lambda_patch: string;
    lambda_runtime?: lambda.Runtime;
    lambda_architecture?: lambda.Architecture;
    lambda_handler?: string;
    log_group?: logs.LogGroup;
}

export class iotCustomAuth extends Construct {
    constructor(scope: Construct, id: string, props: iotCustomAuthProps) {
        super(scope, id);

        // AWS Lambda function
        let custom_auth_lambda = new lambda.Function(this, props.lambda_name + 'Id', {
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
        });
    }
}