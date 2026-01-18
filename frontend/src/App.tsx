import { Outlet } from 'react-router-dom';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/Toast';

export default function App() {
  return (
    <div>
      <Header />
      <main className="main-content">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="app-footer">
        <p>
          Cloud-Native E-Commerce — Built with AWS CDK, Lambda, DynamoDB,
          SQS, EventBridge, Kinesis, Bedrock, Cognito, CloudFront
        </p>
      </footer>
      <ToastContainer />
    </div>
  );
}
