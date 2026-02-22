<svelte:options customElement={{ tag: "irc-studio", shadow: "none" }} />

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		activeChannelId,
		tabOrder,
		nick,
		fetchChannels,
		connectStream,
		disconnectStream,
		partChannel,
		clearUnread,
		setApi
	} from './stores/irc.js';
	import IrcHeader from './components/IrcHeader.svelte';
	import IrcTabBar from './components/IrcTabBar.svelte';
	import IrcLobby from './components/IrcLobby.svelte';
	import IrcMessagePane from './components/IrcMessagePane.svelte';
	import IrcMemberSidebar from './components/IrcMemberSidebar.svelte';

	interface PluginApi {
		get: <T>(path: string) => Promise<T>;
		post: <T>(path: string, body: unknown) => Promise<T>;
		del: <T>(path: string) => Promise<T>;
	}

	let { api }: { api: PluginApi } = $props();

	let lobbyRef: IrcLobby | undefined = $state();
	let messagePaneRef: IrcMessagePane | undefined = $state();

	onMount(async () => {
		setApi(api);
		await fetchChannels();
		await connectStream();
		if (!$nick) {
			try {
				const resp = await api.get<{ ok: boolean; identity?: { display_name?: string; node_id?: string } }>('/api/identity');
				if (resp.ok && resp.identity?.display_name) {
					nick.set(resp.identity.display_name);
				} else if (resp.ok && resp.identity?.node_id) {
					nick.set(resp.identity.node_id.slice(0, 12));
				} else {
					nick.set('hecate');
				}
			} catch {
				nick.set('hecate');
			}
		}
	});

	onDestroy(() => {
		disconnectStream();
	});

	$effect(() => {
		if ($activeChannelId) {
			clearUnread($activeChannelId);
		}
	});

	function handleGlobalKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

		if (e.ctrlKey && e.key === 'w') {
			e.preventDefault();
			if ($activeChannelId) {
				partChannel($activeChannelId);
			}
			return;
		}

		if (e.altKey && e.key >= '1' && e.key <= '9') {
			e.preventDefault();
			const idx = parseInt(e.key) - 1;
			const tabs = $tabOrder;
			if (idx < tabs.length) {
				activeChannelId.set(tabs[idx]);
				clearUnread(tabs[idx]);
			}
			return;
		}

		if (e.key === 'Escape') {
			if ($activeChannelId) {
				activeChannelId.set(null);
			}
			return;
		}

		if (!isInput && e.key === '/' && !$activeChannelId) {
			e.preventDefault();
			lobbyRef?.focusInput();
			return;
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="flex flex-col h-full">
	<IrcHeader />

	<div class="flex flex-1 min-h-0">
		{#if $activeChannelId}
			<div class="flex-1 flex flex-col min-w-0 min-h-0">
				<IrcTabBar />
				<div class="flex flex-1 min-h-0">
					<IrcMessagePane bind:this={messagePaneRef} />
					<IrcMemberSidebar />
				</div>
			</div>
		{:else}
			<IrcLobby bind:this={lobbyRef} />
		{/if}
	</div>
</div>
