export type NavSection = 'recipients' | 'compose' | 'dispatch' | 'history';

export type DeliveryProvider = 'gmail' | 'smtp';

export type RecipientValidity = 'valid' | 'invalid' | 'duplicate';

export type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

export type ComposeMode = 'visual' | 'html' | 'text';

export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  base64Content: string;
}

export interface KeyValueItem {
  id: string;
  label: string;
  value: string;
}

export interface FooterLinkItem {
  id: string;
  label: string;
  url: string;
}

export type EmailBlock =
  | {
      id: string;
      type: 'header';
      companyName: string;
      kicker: string;
      rightLabel: string;
      logoUrl: string;
    }
  | {
      id: string;
      type: 'text';
      content: string;
      muted: boolean;
    }
  | {
      id: string;
      type: 'key_value_grid';
      items: KeyValueItem[];
    }
  | {
      id: string;
      type: 'cta_banner';
      heading: string;
      subtext: string;
      badgeSymbol: string;
      buttonLabel: string;
      buttonUrl: string;
    }
  | {
      id: string;
      type: 'footer';
      links: FooterLinkItem[];
      websiteUrl: string;
      linkedinUrl: string;
      xUrl: string;
      youtubeUrl: string;
      disclaimer: string;
    };

export interface VisualEmailDesign {
  accentColor: string;
  backgroundColor: string;
  blocks: EmailBlock[];
}

export interface RecipientRecord {
  id: string;
  rowIndex: number;
  email: string;
  validity: RecipientValidity;
  included: boolean;
  data: Record<string, string>;
}

export interface DeliveryResult {
  recipientId: string;
  email: string;
  status: DeliveryStatus;
  messageId?: string;
  error?: string;
  sentAt?: string;
  attempts?: number;
}

export interface EmailTemplate {
  subject: string;
  body: string;
  isHtml: boolean;
  composeMode: ComposeMode;
  visualDesign: VisualEmailDesign;
  attachments: EmailAttachment[];
  replyTo: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export interface WorkbookState {
  fileName: string;
  sheetNames: string[];
  activeSheet: string;
  headers: string[];
  rawRows: Record<string, string>[];
}

export interface CampaignRun {
  id: string;
  createdAt: string;
  fileName: string;
  sheetName: string;
  provider: DeliveryProvider;
  senderLabel: string;
  subject: string;
  body: string;
  isHtml: boolean;
  totalTargeted: number;
  sentCount: number;
  failedCount: number;
  headers?: string[];
  rows?: Record<string, string>[];
  results?: Record<string, DeliveryResult>;
}
