export type Embed = {
  title: string;
  url?: string;
  footer: {
    text?: string;
  };
  color: 5814783 | 16074818;
  timestamp: Date;
};

export type Mascot = {
  name: string;
  online?: [string] | [string, string];
};

export type MascotEmbed = {
  id: string | number;
  mascot: Mascot;
};

export type OnlineType = undefined | [string] | [string, string];

export type WebhookMessage = {
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  embeds: Embed[];
};
