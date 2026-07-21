export type Conversation = {
  id: string;
  contact_name: string;
  phone: string;
  is_group?: boolean;
  city?: string | null;
  inquiry_reason?: string | null;
  client_type?: string | null;
  category?: string | null;
  channel: "whatsapp" | "telegram" | "instagram" | "web" | "email";
  status: "open" | "closed";
  priority?: "low" | "normal" | "high" | "urgent";
  first_response_due_at?: string | null;
  unread_count?: number;
  sla_overdue?: boolean;
  sla_escalated?: boolean;
  has_sla_follow_up?: boolean;
  updated_at: string;
  assigned_manager_id: string;
  assigned_manager_name?: string | null;
  assigned_manager_color?: string | null;
  stage: string | null;
  amount: string | null;
  last_message_body: string | null;
  last_message_direction: "incoming" | "outgoing" | null;
};

export type Message = {
  id: string;
  direction: "incoming" | "outgoing";
  body: string;
  attachment_url?: string | null;
  attachment_type?: "image" | "video" | "audio" | "document" | null;
  attachment_name?: string | null;
  meta_media_id?: string | null;
  created_at: string;
};

export type MessageScript = {
  id: string;
  title: string;
  category: string | null;
  body: string;
  created_at: string;
};

export type KnowledgeArticle = {
  id: string;
  title: string;
  url: string;
  category: string | null;
  summary: string | null;
  body?: string | null;
  public_slug?: string | null;
  share_url?: string | null;
  created_at: string;
};

export type ContactCard = {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  inquiry_reason: string | null;
  client_type: string | null;
  category: string | null;
  channel: "whatsapp" | "telegram" | "instagram" | "web" | "email";
  external_id: string | null;
};

export type InboxFilters = {
  city: string;
  inquiryReason: string;
  clientType: string;
  category: string;
  priority: string;
  attention: "" | "unread" | "overdue" | "escalated";
};

export type SavedInboxFilterPreset = {
  id: string;
  name: string;
  filters: InboxFilters;
};

export type QuickActionManager = {
  id: string;
  full_name: string;
  color?: string | null;
};
