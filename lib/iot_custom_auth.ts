import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cfninc from 'aws-cdk-lib/cloudformation-include';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';



export interface iotCustomAuthProps {
    authorizerName: string;
    lambdaName: string;
    lambdaDiscription?: string;
    lambdaPatch: string;
    lambdaRuntime?: lambda.Runtime;
    lambdaArchitecture?: lambda.Architecture;
    lambdaHandler?: string;
    lambdaEnv?: { [key: string]: string };
    logGroup?: logs.LogGroup;
}

export class iotCustomAuthentication extends Construct {
    constructor(scope: Construct, id: string, props: iotCustomAuthProps) {
        super(scope, id);

        // Create the Lambda function
        let authorizer = new lambda.Function(this, props.lambdaName, {
            functionName: props.lambdaName,
            description: props.lambdaDiscription || 'on' + props.lambdaArchitecture,
            code: lambda.Code.fromAsset(
                props.lambdaPatch,
            ),
            runtime: props.lambdaRuntime || lambda.Runtime.PROVIDED_AL2,
            architecture: props.lambdaArchitecture || lambda.Architecture.ARM_64,
            handler: props.lambdaHandler || 'not.required',
            environment: props.lambdaEnv || {
                RUST_BACKTRACE: '1',
            },
        });

        // Create AWS IoT authorizer
        new cfninc.CfnInclude(this, 'CustomAuthorizer', {
            templateFile: 'customAuthorizerCfn.json',
            preserveLogicalIds: false,
            parameters: {
                'AuthorizerName': props.authorizerName,
                'AuthorizerFunctionArn': authorizer.functionArn,
            },
        });

    }
}