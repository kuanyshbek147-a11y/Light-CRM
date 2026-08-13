function sanitizeCampaign(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w.-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/** UTM для Meta Ads: не затирает уже заданные параметры. */
export function withLandingAdsUtm(
  publicUrl: string,
  opts?: { slug?: string; campaign?: string }
): string {
  try {
    const url = new URL(publicUrl);
    if (!url.searchParams.get("utm_source")) {
      url.searchParams.set("utm_source", "meta");
    }
    if (!url.searchParams.get("utm_medium")) {
      url.searchParams.set("utm_medium", "paid");
    }
    const campaign =
      sanitizeCampaign(opts?.campaign || "") ||
      sanitizeCampaign(opts?.slug || "") ||
      "landing";
    if (!url.searchParams.get("utm_campaign")) {
      url.searchParams.set("utm_campaign", campaign);
    }
    if (opts?.slug && !url.searchParams.get("utm_content")) {
      url.searchParams.set("utm_content", sanitizeCampaign(opts.slug) || opts.slug);
    }
    return url.toString();
  } catch {
    return publicUrl;
  }
}
