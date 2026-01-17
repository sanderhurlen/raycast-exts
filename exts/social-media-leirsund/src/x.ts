import { OAuth } from "@raycast/api";

const clientId = "31793974";

export const client = new OAuth.PKCEClient({
  redirectMethod: OAuth.RedirectMethod.Web,
  providerName: "X",
  providerIcon: "x-logo.png",
  description: "Connect your X account…",
});

export async function authorize(): Promise<void> {
  const authRequest = await client.authorizationRequest({
    endpoint: "https://x.com/i/oauth2/authorize",
    clientId: clientId,
    scope: "tweet.read tweet.write",
  });
  const { authorizationCode } = await client.authorize(authRequest);
  await client.setTokens(await fetchTokens(authRequest, authorizationCode));
}

export async function fetchTokens(
  authRequest: OAuth.AuthorizationRequest,
  authCode: string,
): Promise<OAuth.TokenResponse> {
  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("code", authCode);
  params.append("code_verifier", authRequest.codeVerifier);
  params.append("grant_type", "authorization_code");
  params.append("redirect_uri", authRequest.redirectURI);

  const response = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", body: params });
  if (!response.ok) {
    console.error("fetch tokens error:", await response.text());
    throw new Error(response.statusText);
  }
  return (await response.json()) as OAuth.TokenResponse;
}
