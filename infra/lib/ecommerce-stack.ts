import {
  Stack,
  StackProps,
  CfnOutput,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaCore from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

export class EcommerceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ─── Authentication ────────────────────────────────────────────
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: false },
      },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      authFlows: { userPassword: true, userSrp: true },
      preventUserExistenceErrors: true,
    });

    // ─── DynamoDB Tables ───────────────────────────────────────────
    const productTable = new dynamodb.Table(this, 'ProductTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    const userTable = new dynamodb.Table(this, 'UserTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    const cartTable = new dynamodb.Table(this, 'CartTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl', // Auto-expire abandoned carts after 7 days
    });

    const orderTable = new dynamodb.Table(this, 'OrderTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES, // Enable streams for CDC
    });

    // ─── Kinesis Analytics Stream ──────────────────────────────────
    const analyticsStream = new kinesis.Stream(this, 'AnalyticsStream', {
      streamMode: kinesis.StreamMode.ON_DEMAND,
      retentionPeriod: Duration.hours(24),
    });

    // ─── SQS: Order Processing Queue + Dead Letter Queue ──────────
    const orderDLQ = new sqs.Queue(this, 'OrderDLQ', {
      queueName: 'ecommerce-order-dlq',
      retentionPeriod: Duration.days(14),
    });

    const orderQueue = new sqs.Queue(this, 'OrderQueue', {
      queueName: 'ecommerce-order-queue.fifo',
      fifo: true,
      contentBasedDeduplication: false,
      visibilityTimeout: Duration.seconds(60),
      deadLetterQueue: {
        queue: orderDLQ,
        maxReceiveCount: 3, // Retry 3 times before sending to DLQ
      },
    });

    // ─── EventBridge: Custom Event Bus ─────────────────────────────
    const eventBus = new events.EventBus(this, 'EcommerceEventBus', {
      eventBusName: 'ecommerce-events',
    });

    // ─── SNS: Order Notifications ──────────────────────────────────
    const orderNotificationTopic = new sns.Topic(this, 'OrderNotifications', {
      topicName: 'ecommerce-order-notifications',
    });

    // EventBridge rule: route ORDER_CONFIRMED events to SNS
    new events.Rule(this, 'OrderConfirmedRule', {
      eventBus,
      eventPattern: {
        source: ['ecommerce.orders'],
        detailType: ['ORDER_CONFIRMED'],
      },
      targets: [new targets.SnsTopic(orderNotificationTopic)],
    });

    // ─── Lambda Shared Configuration ───────────────────────────────
    const sharedEnvironment = {
      PRODUCT_TABLE: productTable.tableName,
      USER_TABLE: userTable.tableName,
      CART_TABLE: cartTable.tableName,
      ORDER_TABLE: orderTable.tableName,
      ANALYTICS_STREAM: analyticsStream.streamName,
      ORDER_QUEUE_URL: orderQueue.queueUrl,
      EVENT_BUS_NAME: eventBus.eventBusName,
      LOG_LEVEL: 'INFO',
      NODE_OPTIONS: '--enable-source-maps',
    };

    const lambdaDefaults: Partial<lambda.NodejsFunctionProps> = {
      runtime: lambdaCore.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.seconds(15),
      tracing: lambdaCore.Tracing.ACTIVE, // AWS X-Ray tracing
      bundling: {
        externalModules: ['@aws-sdk/*'],
        sourceMap: true,
        minify: true,
      },
      environment: sharedEnvironment,
    };

    // ─── Lambda Functions ──────────────────────────────────────────
    const productFn = new lambda.NodejsFunction(this, 'ProductFn', {
      entry: path.join(__dirname, '../../services/product/src/handler.ts'),
      ...lambdaDefaults,
      description: 'Product CRUD operations',
    });
    productTable.grantReadWriteData(productFn);

    const userFn = new lambda.NodejsFunction(this, 'UserFn', {
      entry: path.join(__dirname, '../../services/user/src/handler.ts'),
      ...lambdaDefaults,
      description: 'User profile management',
    });
    userTable.grantReadWriteData(userFn);

    const cartFn = new lambda.NodejsFunction(this, 'CartFn', {
      entry: path.join(__dirname, '../../services/cart/src/handler.ts'),
      ...lambdaDefaults,
      description: 'Shopping cart operations',
    });
    cartTable.grantReadWriteData(cartFn);
    productTable.grantReadData(cartFn);

    const checkoutFn = new lambda.NodejsFunction(this, 'CheckoutFn', {
      entry: path.join(__dirname, '../../services/checkout/src/handler.ts'),
      ...lambdaDefaults,
      timeout: Duration.seconds(30), // Checkout needs more time for transact writes
      description: 'Order checkout and order history',
    });
    orderTable.grantReadWriteData(checkoutFn);
    cartTable.grantReadWriteData(checkoutFn);
    productTable.grantReadData(checkoutFn);
    orderQueue.grantSendMessages(checkoutFn);

    const analyticsFn = new lambda.NodejsFunction(this, 'AnalyticsFn', {
      entry: path.join(__dirname, '../../services/analytics/src/handler.ts'),
      ...lambdaDefaults,
      description: 'Analytics event ingestion to Kinesis',
    });
    analyticsStream.grantWrite(analyticsFn);

    const searchFn = new lambda.NodejsFunction(this, 'SearchFn', {
      entry: path.join(__dirname, '../../services/search/src/handler.ts'),
      ...lambdaDefaults,
      timeout: Duration.seconds(30), // AI calls can be slow
      memorySize: 512,
      description: 'Product search with AI-powered recommendations',
      environment: {
        ...sharedEnvironment,
        BEDROCK_MODEL_ID: 'amazon.titan-text-lite-v1',
      },
    });
    productTable.grantReadData(searchFn);
    searchFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // ─── Order Processor (SQS Consumer) ────────────────────────────
    const orderProcessorFn = new lambda.NodejsFunction(this, 'OrderProcessorFn', {
      entry: path.join(__dirname, '../../services/order-processor/src/handler.ts'),
      ...lambdaDefaults,
      timeout: Duration.seconds(60),
      description: 'Async order processing: stock decrement, status update, event publishing',
    });
    orderTable.grantReadWriteData(orderProcessorFn);
    productTable.grantReadWriteData(orderProcessorFn);
    eventBus.grantPutEventsTo(orderProcessorFn);

    // Wire SQS -> Lambda trigger
    orderProcessorFn.addEventSource(
      new lambdaEventSources.SqsEventSource(orderQueue, {
        batchSize: 1, // Process one order at a time for consistency
        reportBatchItemFailures: true,
      })
    );

    // ─── API Gateway ───────────────────────────────────────────────
    const api = new apigw.RestApi(this, 'HttpApi', {
      restApiName: 'ecommerce-api',
      description: 'CloudNative E-Commerce REST API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['Authorization', 'Content-Type'],
      },
      deployOptions: {
        stageName: 'prod',
        tracingEnabled: true, // X-Ray on API Gateway
        metricsEnabled: true,
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        throttlingRateLimit: 100,
        throttlingBurstLimit: 50,
      },
    });

    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'CognitoAuth', {
      cognitoUserPools: [userPool],
    });
    const authConfig = { authorizer, authorizationType: apigw.AuthorizationType.COGNITO };

    // Product routes
    const product = api.root.addResource('product');
    product.addMethod('GET', new apigw.LambdaIntegration(productFn));
    product.addMethod('POST', new apigw.LambdaIntegration(productFn), authConfig);
    product.addMethod('PATCH', new apigw.LambdaIntegration(productFn), authConfig);

    const products = api.root.addResource('products');
    products.addMethod('GET', new apigw.LambdaIntegration(productFn));
    products.addMethod('POST', new apigw.LambdaIntegration(productFn), authConfig);

    // User routes
    const user = api.root.addResource('user');
    user.addMethod('GET', new apigw.LambdaIntegration(userFn), authConfig);
    user.addMethod('POST', new apigw.LambdaIntegration(userFn), authConfig);
    user.addMethod('PUT', new apigw.LambdaIntegration(userFn), authConfig);

    // Cart routes
    const cart = api.root.addResource('cart');
    cart.addMethod('GET', new apigw.LambdaIntegration(cartFn), authConfig);
    cart.addMethod('POST', new apigw.LambdaIntegration(cartFn), authConfig);
    cart.addMethod('DELETE', new apigw.LambdaIntegration(cartFn), authConfig);
    cart.addMethod('PATCH', new apigw.LambdaIntegration(cartFn), authConfig);

    // Checkout + orders routes
    const checkout = api.root.addResource('checkout');
    checkout.addMethod('POST', new apigw.LambdaIntegration(checkoutFn), authConfig);

    const orders = api.root.addResource('orders');
    orders.addMethod('GET', new apigw.LambdaIntegration(checkoutFn), authConfig);

    const order = api.root.addResource('order');
    order.addMethod('GET', new apigw.LambdaIntegration(checkoutFn), authConfig);

    // Search routes
    const search = api.root.addResource('search');
    search.addMethod('GET', new apigw.LambdaIntegration(searchFn));
    search.addMethod('POST', new apigw.LambdaIntegration(searchFn), authConfig);

    // Analytics
    const analytics = api.root.addResource('analytics');
    analytics.addMethod('POST', new apigw.LambdaIntegration(analyticsFn));

    // ─── Static Hosting (S3 + CloudFront) ──────────────────────────
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    const oai = new cloudfront.OriginAccessIdentity(this, 'OAI');
    siteBucket.grantRead(
      new iam.CanonicalUserPrincipal(oai.cloudFrontOriginAccessIdentityS3CanonicalUserId)
    );

    const distribution = new cloudfront.Distribution(this, 'SpaDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
      ],
    });

    // ─── CloudWatch Alarms ─────────────────────────────────────────
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: 'ecommerce-alarms',
    });

    // Alarm: checkout errors > 5 in 5 minutes
    new cloudwatch.Alarm(this, 'CheckoutErrorAlarm', {
      metric: checkoutFn.metricErrors({ period: Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'Checkout Lambda error rate too high',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cwActions.SnsAction(alarmTopic));

    // Alarm: DLQ has messages (orders failing to process)
    new cloudwatch.Alarm(this, 'OrderDLQAlarm', {
      metric: orderDLQ.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Orders in dead letter queue — processing failures detected',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cwActions.SnsAction(alarmTopic));

    // Alarm: API Gateway 5xx errors
    new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      metric: api.metricServerError({ period: Duration.minutes(5) }),
      threshold: 10,
      evaluationPeriods: 1,
      alarmDescription: 'API Gateway 5xx error rate elevated',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cwActions.SnsAction(alarmTopic));

    // ─── CloudWatch Dashboard ──────────────────────────────────────
    const dashboard = new cloudwatch.Dashboard(this, 'EcommerceDashboard', {
      dashboardName: 'EcommercePlatform',
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Requests',
        left: [
          api.metricCount({ period: Duration.minutes(5) }),
          api.metricServerError({ period: Duration.minutes(5) }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration (p99)',
        left: [
          productFn.metricDuration({ statistic: 'p99', period: Duration.minutes(5) }),
          checkoutFn.metricDuration({ statistic: 'p99', period: Duration.minutes(5) }),
          searchFn.metricDuration({ statistic: 'p99', period: Duration.minutes(5) }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: [
          productFn.metricErrors({ period: Duration.minutes(5) }),
          cartFn.metricErrors({ period: Duration.minutes(5) }),
          checkoutFn.metricErrors({ period: Duration.minutes(5) }),
          orderProcessorFn.metricErrors({ period: Duration.minutes(5) }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Order Queue Depth',
        left: [
          orderQueue.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(1) }),
          orderDLQ.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(1) }),
        ],
        width: 12,
      }),
    );

    // ─── Stack Outputs ─────────────────────────────────────────────
    new CfnOutput(this, 'ApiUrl', { value: api.url });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, 'SpaUrl', { value: `https://${distribution.domainName}` });
    new CfnOutput(this, 'OrderQueueUrl', { value: orderQueue.queueUrl });
    new CfnOutput(this, 'EventBusName', { value: eventBus.eventBusName });
    new CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=EcommercePlatform`,
    });
  }
}
