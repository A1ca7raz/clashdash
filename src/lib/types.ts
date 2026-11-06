export type SubscriptionMode = "inline" | "provider";

export interface RenameRule {
  pattern: string;
  target: string;
}

/**
 * Mirrors what a mihomo proxy-provider can express natively, applied in mihomo's order:
 * exclude-filter and filter (on the original name), then override.proxy-name in order
 * (rename rules, then flag rules), then additional-prefix, then additional-suffix.
 */
export interface Processing {
  include?: string;
  exclude?: string;
  rename?: RenameRule[];
  flag?: boolean;
  prefix?: string;
  suffix?: string;
}

export interface ProviderOptions {
  interval?: number;
  healthCheck?: {
    enable: boolean;
    url?: string;
    interval?: number;
    lazy?: boolean;
  };
}

export interface UserInfo {
  upload: number;
  download: number;
  total: number;
  expire?: number;
}

export interface MihomoProxy {
  name: string;
  type: string;
  [key: string]: unknown;
}

export const GROUP_TYPES = ["select", "url-test", "fallback", "load-balance", "relay"] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

export interface GroupOptions {
  url?: string;
  interval?: number;
  tolerance?: number;
  timeout?: number;
  lazy?: boolean;
  strategy?: "consistent-hashing" | "round-robin" | "sticky-sessions";
  hidden?: boolean;
  icon?: string;
  disableUdp?: boolean;
}

export interface GroupMembers {
  /** Ordered explicit members: group names, builtin policies, or inline/manual node names. */
  items: string[];
  sources: {
    /** All subscriptions selected by the profile. */
    all: boolean;
    subscriptions: number[];
    manual: boolean;
  };
  include?: string;
  exclude?: string;
}

export const BUILTIN_POLICIES = ["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE"] as const;

export const RULE_TYPES = [
  "DOMAIN",
  "DOMAIN-SUFFIX",
  "DOMAIN-KEYWORD",
  "DOMAIN-REGEX",
  "DOMAIN-WILDCARD",
  "GEOSITE",
  "IP-CIDR",
  "IP-CIDR6",
  "IP-SUFFIX",
  "IP-ASN",
  "GEOIP",
  "SRC-GEOIP",
  "SRC-IP-ASN",
  "SRC-IP-CIDR",
  "SRC-IP-SUFFIX",
  "DST-PORT",
  "SRC-PORT",
  "IN-PORT",
  "IN-TYPE",
  "IN-USER",
  "IN-NAME",
  "PROCESS-PATH",
  "PROCESS-PATH-REGEX",
  "PROCESS-NAME",
  "PROCESS-NAME-REGEX",
  "UID",
  "NETWORK",
  "DSCP",
  "RULE-SET",
  "AND",
  "OR",
  "NOT",
  "SUB-RULE",
  "MATCH",
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export const NO_RESOLVE_RULE_TYPES: readonly string[] = [
  "IP-CIDR",
  "IP-CIDR6",
  "IP-SUFFIX",
  "IP-ASN",
  "GEOIP",
  "RULE-SET",
];

export const RULE_PROVIDER_BEHAVIORS = ["domain", "ipcidr", "classical"] as const;
export const RULE_PROVIDER_FORMATS = ["yaml", "text", "mrs"] as const;

export const LISTENER_TYPES = [
  "mixed",
  "socks",
  "http",
  "redir",
  "tproxy",
  "tun",
  "tunnel",
  "shadowsocks",
  "vmess",
  "vless",
  "trojan",
  "tuic",
  "hysteria2",
  "anytls",
] as const;
export type ListenerType = (typeof LISTENER_TYPES)[number];
