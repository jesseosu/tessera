import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: import.meta.env.VITE_USER_POOL_ID as string,
  ClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID as string,
};

export const userPool = new CognitoUserPool(poolData);

export function login(email: string, password: string) {
  const auth = new AuthenticationDetails({ Username: email, Password: password });
  const user = new CognitoUser({ Username: email, Pool: userPool });
  return new Promise<string>((resolve, reject) => {
    user.authenticateUser(auth, {
      onSuccess: (result) => resolve(result.getIdToken().getJwtToken()),
      onFailure: reject,
    });
  });
}

export function currentSessionJwt(): Promise<string | null> {
  return new Promise((resolve) => {
    const user = userPool.getCurrentUser();
    if (!user) return resolve(null);
    user.getSession((err: any, session: any) => {
      if (err || !session?.isValid()) return resolve(null);
      resolve(session.getIdToken().getJwtToken());
    });
  });
}
