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

export async function sendInstagramTextMessage(
  credentials: InstagramCredentials,
  recipientId: string,
  text: string
): Promise<string | null> {
  const apiVersion = getInstagramApiVersion();
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/me/messages`, {
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

  if (!response.ok) {
    const message = payload.error?.message || JSON.stringify(payload);
    throw new Error(`Instagram sendMessage failed: ${response.status} ${message}`);
  }

  return payload.message_id || null;
}

export async function validateInstagramPageToken(
  credentials: Pick<InstagramCredentials, "pageId" | "pageAccessToken" | "igUserId">
): Promise<{
  pageName: string | null;
  igUsername: string | null;
  igUserId: string | null;
}> {
  const apiVersion = getInstagramApiVersion();
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
    throw new Error(`Instagram page validation failed: ${pageResponse.status} ${message}`);
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
