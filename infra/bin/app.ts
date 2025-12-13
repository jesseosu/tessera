import 'dotenv/config';
import { App } from 'aws-cdk-lib';
import { EcommerceStack } from '../lib/ecommerce-stack.js';

const app = new App();
new EcommerceStack(app, 'EcommerceStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-southeast-2'
  }
});
