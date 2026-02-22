import { writable, derived, get } from 'svelte/store';
import type {
	IrcChannel,
	IrcMessage,
	IrcNickChange,
	IrcPresence,
	IrcEvent,
	ChannelMember
} from '../types.js';
import { connectPluginSse, type SseStream } from '../stream.js';

// --- Plugin API ---

export interface PluginApi {
	get: <T>(path: string) => Promise<T>;
	post: <T>(path: string, body: unknown) => Promise<T>;
	del: <T>(path: string) => Promise<T>;
}

let pluginApi: PluginApi | null = null;

export function setApi(api: PluginApi): void {
	pluginApi = api;
}

// --- Stores ---

export const channels = writable<IrcChannel[]>([]);
export const joinedChannels = writable<Set<string>>(new Set());
export const activeChannelId = writable<string | null>(null);
export const messagesByChannel = writable<Record<string, IrcMessage[]>>({});
export const presenceMap = writable<Record<string, IrcPresence>>({});
export const streamConnected = writable(false);
export const unreadByChannel = writable<Record<string, number>>({});
export const membersByChannel = writable<Record<string, ChannelMember[]>>({});
export const lobbySearch = writable<string>('');

const NICK_STORAGE_KEY = 'hecate-irc-nick';
const TABS_STORAGE_KEY = 'hecate-irc-tabs';

function loadNick(): string {
	try {
		return localStorage.getItem(NICK_STORAGE_KEY) ?? '';
	} catch {
		return '';
	}
}

function loadTabs(): string[] {
	try {
		const raw = localStorage.getItem(TABS_STORAGE_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

function saveTabs(tabs: string[]): void {
	try {
		localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
	} catch {
		// localStorage unavailable
	}
}

export const nick = writable<string>(loadNick());
export const tabOrder = writable<string[]>(loadTabs());

// Persist nick changes to localStorage
nick.subscribe((value) => {
	try {
		if (value) localStorage.setItem(NICK_STORAGE_KEY, value);
	} catch {
		// localStorage unavailable
	}
});

// Persist tab order to localStorage
tabOrder.subscribe((tabs) => {
	saveTabs(tabs);
});

const MAX_MESSAGES_PER_CHANNEL = 500;
const DEDUP_WINDOW_MS = 2000;

// --- Derived ---

export const activeMessages = derived(
	[activeChannelId, messagesByChannel],
	([$activeChannelId, $messagesByChannel]) => {
		if (!$activeChannelId) return [];
		return $messagesByChannel[$activeChannelId] ?? [];
	}
);

const PRESENCE_TIMEOUT_MS = 45000;

export const onlinePeers = derived(presenceMap, ($presenceMap) => {
	const now = Date.now();
	return Object.values($presenceMap).filter((p) => now - p.timestamp < PRESENCE_TIMEOUT_MS);
});

export const lobbyChannels = derived(
	[channels, lobbySearch, membersByChannel],
	([$channels, $lobbySearch, $membersByChannel]) => {
		const query = $lobbySearch.toLowerCase().trim();
		return $channels
			.filter(
				(c) =>
					!query ||
					c.name.toLowerCase().includes(query) ||
					(c.topic && c.topic.toLowerCase().includes(query))
			)
			.map((c) => ({
				...c,
				memberCount: ($membersByChannel[c.channel_id] ?? []).length
			}));
	}
);

export const activeChannelMembers = derived(
	[activeChannelId, membersByChannel],
	([$activeChannelId, $membersByChannel]) => {
		if (!$activeChannelId) return [];
		return $membersByChannel[$activeChannelId] ?? [];
	}
);

// --- Tab management ---

export function addTab(channelId: string): void {
	tabOrder.update((tabs) => {
		if (tabs.includes(channelId)) return tabs;
		return [...tabs, channelId];
	});
}

export function removeTab(channelId: string): void {
	tabOrder.update((tabs) => tabs.filter((id) => id !== channelId));
	// If closing the active tab, switch to the previous or next tab
	const currentActive = get(activeChannelId);
	if (currentActive === channelId) {
		const tabs = get(tabOrder);
		activeChannelId.set(tabs.length > 0 ? tabs[tabs.length - 1] : null);
	}
}

export function clearUnread(channelId: string): void {
	unreadByChannel.update((u) => {
		const next = { ...u };
		delete next[channelId];
		return next;
	});
}

// --- Stream management ---

let sseStream: SseStream | null = null;

export async function connectStream(): Promise<void> {
	if (sseStream) return;

	sseStream = connectPluginSse<IrcEvent>(
		'irc',
		'/api/irc/stream',
		(event) => {
			if (!get(streamConnected)) streamConnected.set(true);
			handleIrcEvent(event);
		},
		undefined,
		(error) => {
			console.error('[irc] stream error:', error);
			streamConnected.set(false);
		}
	);

	// Re-join persisted tabs
	await rejoinPersistedTabs();
}

async function rejoinPersistedTabs(): Promise<void> {
	const tabs = get(tabOrder);
	if (tabs.length === 0) return;
	console.log('[irc] re-joining %d persisted tabs', tabs.length);
	for (const channelId of tabs) {
		try {
			await joinChannel(channelId);
		} catch (e) {
			console.error('[irc] re-join failed for', channelId, e);
		}
	}
}

export function disconnectStream(): void {
	sseStream?.stop();
	sseStream = null;
	streamConnected.set(false);
}

function handleIrcEvent(evt: IrcEvent): void {
	switch (evt.type) {
		case 'message': {
			const msg = evt as IrcMessage;
			// Convert /me-prefixed messages from SSE into action type
			if (msg.content.startsWith('/me ')) {
				addMessage({ ...msg, type: 'action', content: msg.content.slice(4) });
			} else {
				addMessage(msg);
			}
			break;
		}
		case 'presence':
			updatePresence(evt as IrcPresence);
			break;
		case 'nick_change': {
			const nc = evt as IrcNickChange;
			// Update all presence entries that match the old nick
			presenceMap.update((m) => {
				const updated = { ...m };
				for (const [, p] of Object.entries(updated)) {
					if (p.display_name === nc.old_nick) {
						updated[p.node_id] = { ...p, display_name: nc.new_nick };
					}
				}
				return updated;
			});
			break;
		}
		case 'joined':
			joinedChannels.update((s) => {
				const next = new Set(s);
				next.add(evt.channel_id);
				return next;
			});
			addTab(evt.channel_id);
			break;
		case 'parted':
			joinedChannels.update((s) => {
				const next = new Set(s);
				next.delete(evt.channel_id);
				return next;
			});
			removeTab(evt.channel_id);
			// Refresh channel list — backend may have auto-closed the empty channel
			fetchChannels();
			break;
		case 'members_changed':
			fetchChannelMembers(evt.channel_id);
			break;
	}
}

function addMessage(msg: IrcMessage): void {
	messagesByChannel.update((byChannel) => {
		const existing = byChannel[msg.channel_id] ?? [];

		// Deduplicate: skip if a message with same nick+content exists within DEDUP_WINDOW_MS
		if (msg.type === 'message' || msg.type === 'action') {
			const isDup = existing.some(
				(m) =>
					m.nick === msg.nick &&
					m.content === msg.content &&
					Math.abs(m.timestamp - msg.timestamp) < DEDUP_WINDOW_MS
			);
			if (isDup) return byChannel;
		}

		const updated = [...existing, msg];
		const trimmed =
			updated.length > MAX_MESSAGES_PER_CHANNEL
				? updated.slice(updated.length - MAX_MESSAGES_PER_CHANNEL)
				: updated;
		return { ...byChannel, [msg.channel_id]: trimmed };
	});

	// Increment unread count for non-active channels
	const currentActive = get(activeChannelId);
	if (msg.channel_id !== currentActive && msg.type !== 'system') {
		unreadByChannel.update((u) => ({
			...u,
			[msg.channel_id]: (u[msg.channel_id] ?? 0) + 1
		}));
	}
}

function updatePresence(p: IrcPresence): void {
	presenceMap.update((m) => ({ ...m, [p.node_id]: p }));
}

// --- System messages ---

export function addSystemMessage(channelId: string, text: string): void {
	const msg: IrcMessage = {
		type: 'system',
		channel_id: channelId,
		nick: '',
		content: text,
		timestamp: Date.now()
	};
	addMessage(msg);
}

// --- Optimistic send ---

export async function sendMessageOptimistic(
	channelId: string,
	content: string,
	senderNick: string
): Promise<void> {
	const msg: IrcMessage = {
		type: 'message',
		channel_id: channelId,
		nick: senderNick,
		content,
		timestamp: Date.now()
	};
	addMessage(msg);

	try {
		await pluginApi!.post('/api/irc/channels/' + channelId + '/messages', {
			content,
			nick: senderNick
		});
	} catch (e) {
		console.error('[irc] sendMessage failed:', e);
	}
}

// --- Action messages (/me) ---

export async function sendAction(
	channelId: string,
	action: string,
	senderNick: string
): Promise<void> {
	const msg: IrcMessage = {
		type: 'action',
		channel_id: channelId,
		nick: senderNick,
		content: action,
		timestamp: Date.now()
	};
	addMessage(msg);

	// Send as /me-prefixed content — backend passes through as-is
	try {
		await pluginApi!.post('/api/irc/channels/' + channelId + '/messages', {
			content: `/me ${action}`,
			nick: senderNick
		});
	} catch (e) {
		console.error('[irc] sendAction failed:', e);
	}
}

// --- Slash command parser ---

const HELP_TEXT = [
	'Available commands:',
	'  /nick <name>   -- Change your nickname',
	'  /join <channel> -- Join or create a channel',
	'  /part, /leave   -- Leave current channel',
	'  /list           -- Browse channels (lobby)',
	'  /me <action>    -- Send an action message',
	'  /topic          -- Show current channel topic',
	'  /clear          -- Clear message history',
	'  /help           -- Show this help text',
	'',
	'Keyboard shortcuts:',
	'  Ctrl+W         -- Close current channel',
	'  Alt+1..9       -- Switch to channel N',
	'  Escape         -- Back to lobby',
	'  Ctrl+Tab       -- Switch studio (global)'
].join('\n');

export async function parseAndExecute(input: string, channelId: string | null): Promise<void> {
	const parts = input.trim().split(/\s+/);
	const cmd = parts[0].toLowerCase();
	const args = parts.slice(1).join(' ');
	const currentNick = get(nick) || 'anon';

	switch (cmd) {
		case '/nick': {
			if (!args) {
				if (channelId) addSystemMessage(channelId, 'Usage: /nick <name>');
				return;
			}
			const oldNick = currentNick;
			nick.set(args);
			if (channelId) addSystemMessage(channelId, `You are now known as ${args} (was ${oldNick})`);
			// Tell the backend so presence heartbeats use the new nick
			try {
				await pluginApi!.post('/api/irc/nick', { nick: args });
			} catch (e) {
				console.error('[irc] change nick failed:', e);
			}
			return;
		}

		case '/join': {
			if (!args) {
				if (channelId) addSystemMessage(channelId, 'Usage: /join <channel>');
				return;
			}
			const channelName = args.replace(/^#/, '');
			// Find existing channel or create it
			const existing = get(channels).find(
				(c) => c.name.toLowerCase() === channelName.toLowerCase()
			);
			if (existing) {
				activeChannelId.set(existing.channel_id);
				if (!get(joinedChannels).has(existing.channel_id)) {
					await joinChannel(existing.channel_id);
				}
				addSystemMessage(existing.channel_id, `Joined #${existing.name}`);
			} else {
				const ch = await openChannel(channelName);
				if (ch) {
					activeChannelId.set(ch.channel_id);
					await joinChannel(ch.channel_id);
					addSystemMessage(ch.channel_id, `Joined #${channelName}`);
				} else if (channelId) {
					addSystemMessage(channelId, `Failed to join #${channelName}`);
				}
			}
			return;
		}

		case '/part':
		case '/leave': {
			if (!channelId) return;
			const ch = get(channels).find((c) => c.channel_id === channelId);
			addSystemMessage(channelId, `Left #${ch?.name ?? channelId}`);
			await partChannel(channelId);
			activeChannelId.set(null);
			return;
		}

		case '/list': {
			await fetchChannels();
			activeChannelId.set(null);
			return;
		}

		case '/me': {
			if (!channelId || !args) {
				if (channelId) addSystemMessage(channelId, 'Usage: /me <action>');
				return;
			}
			await sendAction(channelId, args, currentNick);
			return;
		}

		case '/topic': {
			if (!channelId) return;
			const channel = get(channels).find((c) => c.channel_id === channelId);
			const topic = channel?.topic ?? '(no topic set)';
			addSystemMessage(channelId, `Topic: ${topic}`);
			return;
		}

		case '/clear': {
			if (!channelId) return;
			messagesByChannel.update((byChannel) => ({
				...byChannel,
				[channelId]: []
			}));
			return;
		}

		case '/help': {
			if (!channelId) return;
			addSystemMessage(channelId, HELP_TEXT);
			return;
		}

		default: {
			if (channelId) addSystemMessage(channelId, `Unknown command: ${cmd}`);
			return;
		}
	}
}

// --- API functions ---

export async function fetchChannels(): Promise<void> {
	try {
		const resp = await pluginApi!.get<{ ok: boolean; channels: IrcChannel[] }>('/api/irc/channels');
		if (resp.ok && resp.channels) {
			channels.set(resp.channels);
		}
	} catch {
		channels.set([]);
	}
}

export async function openChannel(name: string, topic?: string): Promise<IrcChannel | null> {
	try {
		const body: Record<string, string> = { name };
		if (topic) body.topic = topic;
		const resp = await pluginApi!.post<{ ok: boolean } & IrcChannel>('/api/irc/channels/open', body);
		if (resp.ok) {
			await fetchChannels();
			return resp;
		}
		return null;
	} catch (e) {
		console.error('[irc] openChannel failed:', e);
		return null;
	}
}

export async function joinChannel(channelId: string): Promise<void> {
	try {
		await pluginApi!.post('/api/irc/channels/' + channelId + '/join', {});
	} catch (e) {
		console.error('[irc] joinChannel failed:', e);
	}
}

export async function partChannel(channelId: string): Promise<void> {
	try {
		await pluginApi!.post('/api/irc/channels/' + channelId + '/part', {});
	} catch (e) {
		console.error('[irc] partChannel failed:', e);
	}
}

export async function fetchChannelMembers(channelId: string): Promise<void> {
	try {
		const resp = await pluginApi!.get<{
			ok: boolean;
			channel_id: string;
			members: ChannelMember[];
		}>('/api/irc/channels/' + channelId + '/members');
		if (resp.ok && resp.members) {
			membersByChannel.update((m) => ({ ...m, [channelId]: resp.members }));
		}
	} catch (e) {
		console.error('[irc] fetchChannelMembers failed:', e);
	}
}

export async function sendMessage(
	channelId: string,
	content: string,
	senderNick: string
): Promise<void> {
	try {
		await pluginApi!.post('/api/irc/channels/' + channelId + '/messages', {
			content,
			nick: senderNick
		});
	} catch (e) {
		console.error('[irc] sendMessage failed:', e);
	}
}
