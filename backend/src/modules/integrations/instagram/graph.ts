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
