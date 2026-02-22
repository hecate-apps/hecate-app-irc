// --- IRC Types ---

export interface IrcChannel {
	channel_id: string;
	name: string;
	topic: string | null;
	opened_by: string | null;
	status: number;
	status_label: string;
	opened_at: number;
}

// IRC channel status bit flags
export const IRC_INITIATED = 1;
export const IRC_ARCHIVED = 2;

export type IrcMessageType = 'message' | 'action' | 'system';

export interface IrcMessage {
	type: IrcMessageType;
	channel_id: string;
	nick: string;
	content: string;
	timestamp: number;
	/** Client-generated ID for optimistic dedup */
	clientId?: string;
}

export interface IrcPresence {
	type: 'presence';
	node_id: string;
	display_name: string;
	timestamp: number;
}

export interface IrcNickChange {
	type: 'nick_change';
	old_nick: string;
	new_nick: string;
}

export interface ChannelMember {
	node_id: string;
	nick: string;
	online: boolean;
}

export type IrcEvent =
	| IrcMessage
	| IrcPresence
	| IrcNickChange
	| { type: 'joined'; channel_id: string }
	| { type: 'parted'; channel_id: string }
	| { type: 'members_changed'; channel_id: string };
