import {
  getInstagramApiVersion,
  type InstagramCredentials
} from "./credentials";

type GraphErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

export type InstagramPageOption = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igUserId: string | null;
  igUsername: string | null;
};

export type InstagramLoginProfile = {
  igUserId: string;
  username: string | null;
  name: string | null;
  accessToken: string;
};

/** Instagram Login app only (Light CRM-IG). Do not fall back to WhatsApp App ID. */
function getInstagramAppId(): string {
  return process.env.INSTAGRAM_APP_ID || process.env.META_INSTAGRAM_APP_ID || "";
}

function getInstagramAppSecret(): string {
  return process.env.INSTAGRAM_APP_SECRET || process.env.META_INSTAGRAM_APP_SECRET || "";
}

export function getInstagramLoginScopes(): string[] {
  return [
    "instagram_business_basic",
    "instagram_business_manage_messages",
    "instagram_business_manage_comments",
    "instagram_business_content_publish"
  ];
}

export function buildInstagramLoginAuthUrl(params: {
  redirectUri: string;
  state: string;
}): string {
  const appId = getInstagramAppId();
  if (!appId) {
    throw new Error("INSTAGRAM_APP_ID не задан");
  }
  const query = new URLSearchParams({
    client_id: appId,
    redirect_uri: params.redirectUri,
    scope: getInstagramLoginScopes().join(","),
    response_type: "code",
    state: params.state
  });
  return `https://www.instagram.com/oauth/authorize?${query.toString()}`;
}

/** Exchange Instagram Login auth code → long-lived IG user token + profile. */
export async function exchangeInstagramLoginCode(params: {
  code: string;
  redirectUri: string;
}): Promise<InstagramLoginProfile> {
  const appId = getInstagramAppId();
  const appSecret = getInstagramAppSecret();
  if (!appId || !appSecret) {
    throw new Error("Задайте INSTAGRAM_APP_ID и INSTAGRAM_APP_SECRET");
  }

  const shortLivedBody = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
    code: params.code
  });

  const shortResponse = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: shortLivedBody.toString()
  });
  const shortPayload = (await shortResponse.json()) as GraphErrorPayload & {
    access_token?: string;
    user_id?: number | string;
  };
  if (!shortResponse.ok || !shortPayload.access_token) {
    const message = shortPayload.error?.message || JSON.stringify(shortPayload);
    throw new Error(`Instagram token exchange failed: ${shortResponse.status} ${message}`);
  }

  let accessToken = shortPayload.access_token;
  try {
    const longUrl = new URL("https://graph.instagram.com/access_token");
    longUrl.searchParams.set("grant_type", "ig_exchange_token");
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("access_token", accessToken);
    const longResponse = await fetch(longUrl.toString());
    const longPayload = (await longResponse.json()) as GraphErrorPayload & {
      access_token?: string;
    };
    if (longResponse.ok && longPayload.access_token) {
      accessToken = longPayload.access_token;
    }
  } catch (error) {
    console.warn("Instagram long-lived token exchange skipped", error);
  }

  const apiVersion = getInstagramApiVersion();
  const meResponse = await fetch(
    `https://graph.instagram.com/${apiVersion}/me?fields=user_id,username,name&access_token=${encodeURIComponent(accessToken)}`
  );
  const mePayload = (await meResponse.json()) as GraphErrorPayload & {
    user_id?: string;
    id?: string;
    username?: string;
    name?: string;
  };
  if (!meResponse.ok) {
    const message = mePayload.error?.message || JSON.stringify(mePayload);
    throw new Error(`Instagram profile lookup failed: ${meResponse.status} ${message}`);
  }

  const igUserId = String(mePayload.user_id || mePayload.id || shortPayload.user_id || "");
  if (!igUserId) {
    throw new Error("Instagram не вернул user_id");
  }

  return {
    igUserId,
    username: mePayload.username || null,
    name: mePayload.name || null,
    accessToken
  };
}

export async function sendInstagramTextMessage(
  credentials: InstagramCredentials,
  recipientId: string,
  text: string
): Promise<string | null> {
  const apiVersion = getInstagramApiVersion();
  // Instagram Login tokens use graph.instagram.com; Page tokens use graph.facebook.com.
  const endpoints = [
    `https://graph.instagram.com/${apiVersion}/me/messages`,
    `https://graph.facebook.com/${apiVersion}/me/messages`
  ];

  let lastError = "Instagram sendMessage failed";
  for (const url of endpoints) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.pageAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text }
      })
    });

    const payload = (await response.json()) as GraphErrorPayload & {
      message_id?: string;
    };

    if (response.ok) {
      return payload.message_id || null;
    }
    lastError = payload.error?.message || JSON.stringify(payload);
  }

  throw new Error(`Instagram sendMessage failed: ${lastError}`);
}

export async function validateInstagramPageToken(
  credentials: Pick<InstagramCredentials, "pageId" | "pageAccessToken" | "igUserId">
): Promise<{
  pageName: string | null;
  igUsername: string | null;
  igUserId: string | null;
}> {
  const apiVersion = getInstagramApiVersion();

  // Instagram Login user token
  const igMe = await fetch(
    `https://graph.instagram.com/${apiVersion}/me?fields=user_id,username,name&access_token=${encodeURIComponent(credentials.pageAccessToken)}`
  );
  if (igMe.ok) {
    const mePayload = (await igMe.json()) as {
      user_id?: string;
      id?: string;
      username?: string;
      name?: string;
    };
    const igUserId = String(mePayload.user_id || mePayload.id || credentials.igUserId || "");
    return {
      pageName: mePayload.name || mePayload.username || null,
      igUsername: mePayload.username || null,
      igUserId: igUserId || null
    };
  }

  const pageResponse = await fetch(
    `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(credentials.pageId)}?fields=name,instagram_business_account{id,username}`,
    {
      headers: {
        Authorization: `Bearer ${credentials.pageAccessToken}`
      }
    }
  );

  const pagePayload = (await pageResponse.json()) as GraphErrorPayload & {
    name?: string;
    instagram_business_account?: { id?: string; username?: string };
  };

  if (!pageResponse.ok) {
    const message = pagePayload.error?.message || JSON.stringify(pagePayload);
    throw new Error(`Instagram token validation failed: ${pageResponse.status} ${message}`);
  }

  const igUserId = pagePayload.instagram_business_account?.id || credentials.igUserId || null;
  const igUsername = pagePayload.instagram_business_account?.username || null;

  return {
    pageName: pagePayload.name || null,
    igUsername,
    igUserId
  };
}

export async function listInstagramPagesForUserToken(userAccessToken: string): Promise<InstagramPageOption[]> {
  const apiVersion = getInstagramApiVersion();
  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100`,
    {
      headers: {
        Authorization: `Bearer ${userAccessToken}`
      }
    }
  );

  const payload = (await response.json()) as GraphErrorPayload & {
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id?: string; username?: string };
    }>;
  };

  if (!response.ok) {
    const message = payload.error?.message || JSON.stringify(payload);
    throw new Error(`Instagram pages lookup failed: ${response.status} ${message}`);
  }

  return (payload.data || [])
    .filter((page) => page.id && page.access_token)
    .map((page) => ({
      pageId: page.id as string,
      pageName: page.name || page.id || "",
      pageAccessToken: page.access_token as string,
      igUserId: page.instagram_business_account?.id || null,
      igUsername: page.instagram_business_account?.username || null
    }));
}

export async function subscribeInstagramPageToApp(
  pageId: string,
  pageAccessToken: string
): Promise<boolean> {
  const apiVersion = getInstagramApiVersion();
  const params = new URLSearchParams({
    subscribed_fields: "messages,messaging_postbacks,message_deliveries,message_reads",
    access_token: pageAccessToken
  });

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(pageId)}/subscribed_apps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    }
  );

  const payload = (await response.json()) as GraphErrorPayload & { success?: boolean };
  if (!response.ok) {
    const message = payload.error?.message || JSON.stringify(payload);
    throw new Error(`Instagram page subscribe failed: ${response.status} ${message}`);
  }

  return Boolean(payload.success);
}

/** Publish image+caption to Instagram feed (Content Publishing API). Requires public image URL. */
export async function publishInstagramFeedImage(params: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<string> {
  const apiVersion = getInstagramApiVersion();
  const createParams = new URLSearchParams({
    image_url: params.imageUrl,
    caption: params.caption.slice(0, 2200),
    access_token: params.accessToken
  });

  const createResponse = await fetch(
    `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(params.igUserId)}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createParams.toString()
    }
  );
  const createPayload = (await createResponse.json()) as GraphErrorPayload & { id?: string };
  if (!createResponse.ok || !createPayload.id) {
    const message = createPayload.error?.message || JSON.stringify(createPayload);
    throw new Error(`Instagram media create failed: ${createResponse.status} ${message}`);
  }

  const publishParams = new URLSearchParams({
    creation_id: createPayload.id,
    access_token: params.accessToken
  });
  const publishResponse = await fetch(
    `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(params.igUserId)}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishParams.toString()
    }
  );
  const publishPayload = (await publishResponse.json()) as GraphErrorPayload & { id?: string };
  if (!publishResponse.ok || !publishPayload.id) {
    const message = publishPayload.error?.message || JSON.stringify(publishPayload);
    throw new Error(`Instagram media publish failed: ${publishResponse.status} ${message}`);
  }
  return publishPayload.id;
}

export { getInstagramAppId, getInstagramAppSecret };
