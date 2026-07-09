declare namespace facebook {
  interface AuthResponse {
    accessToken: string;
    expiresIn: number;
    signedRequest: string;
    userID: string;
    code?: string;
    grantedScopes?: string;
  }

  interface StatusResponse {
    status: string;
    authResponse?: AuthResponse;
  }
}

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB: {
      init: (params: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: facebook.StatusResponse) => void,
        options?: Record<string, unknown>
      ) => void;
    };
  }
}

export {};
