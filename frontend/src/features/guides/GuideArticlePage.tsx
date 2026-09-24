import { useLayoutEffect } from "react";
import kazakhstanMarkdown from "./crm-whatsapp-kazakhstan.md?raw";
import chatHistoryMarkdown from "./whatsapp-chat-history-in-deal.md?raw";
import "./guideArticle.css";
import {
  GUIDE_PATH,
  STATIC_GUIDES,
  buildGuideDocument,
  guideForPath,
  guideHeadTags,
  type GuideDocument,
  type GuideHeadTag
} from "./guideArticle";

const MARKDOWN_BY_FILE: Record<string, string> = {
  "crm-whatsapp-kazakhstan.md": kazakhstanMarkdown,
  "whatsapp-chat-history-in-deal.md": chatHistoryMarkdown
};

const documents = new Map<string, GuideDocument>(
  STATIC_GUIDES.map((guide) => {
    const markdown = MARKDOWN_BY_FILE[guide.sourceFile];
    if (!markdown) {
      throw new Error(`Guide markdown not found: ${guide.sourceFile}`);
    }
    return [
      guide.path,
      buildGuideDocument(markdown, {
        canonicalUrl: guide.canonicalUrl,
        description: guide.description
      })
    ];
  })
);
const JSON_LD_ID = "guide-faq-jsonld";

function upsertMeta(attr: "name" | "property", key: string, content: string): void {
  let element = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!(element instanceof HTMLMetaElement)) {
    element = document.createElement("meta");
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function upsertCanonical(href: string): void {
  let element = document.head.querySelector('link[rel="canonical"]');
  if (!(element instanceof HTMLLinkElement)) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
}

function upsertJsonLd(json: string): void {
  const existing = document.getElementById(JSON_LD_ID);
  const element = existing instanceof HTMLScriptElement ? existing : document.createElement("script");
  if (!(existing instanceof HTMLScriptElement)) {
    element.id = JSON_LD_ID;
    element.type = "application/ld+json";
    document.head.appendChild(element);
  }
  element.text = json;
}

function applyHeadTag(tag: GuideHeadTag): void {
  if (tag.kind === "meta") {
    upsertMeta(tag.attr, tag.key, tag.content);
    return;
  }
  if (tag.kind === "link" && tag.rel === "canonical") {
    upsertCanonical(tag.href);
    return;
  }
  if (tag.kind === "jsonld") {
    upsertJsonLd(tag.json);
  }
}

export function GuideArticlePage() {
  const guide = guideForPath(window.location.pathname);
  const documentModel = documents.get(guide?.path ?? GUIDE_PATH) ?? documents.get(GUIDE_PATH);

  useLayoutEffect(() => {
    if (!documentModel) return;
    document.title = documentModel.title;
    for (const tag of guideHeadTags(documentModel)) {
      applyHeadTag(tag);
    }
  }, [documentModel]);

  if (!documentModel) {
    return null;
  }

  return <div dangerouslySetInnerHTML={{ __html: documentModel.bodyHtml }} />;
}
