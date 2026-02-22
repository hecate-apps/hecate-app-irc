<script lang="ts">
	import {
		tabOrder,
		channels,
		activeChannelId,
		unreadByChannel,
		clearUnread,
		partChannel
	} from '../stores/irc.js';

	async function handleSelectTab(channelId: string) {
		activeChannelId.set(channelId);
		clearUnread(channelId);
	}

	async function handleCloseTab(e: Event, channelId: string) {
		e.stopPropagation();
		await partChannel(channelId);
		// Tab removal happens via SSE 'parted' event -> store removeTab
	}
</script>

{#if $tabOrder.length > 0}
	<div class="flex items-center border-b border-surface-600 bg-surface-800/50 shrink-0 overflow-x-auto">
		{#each $tabOrder as tabId}
			{@const ch = $channels.find((c) => c.channel_id === tabId)}
			{@const isActive = $activeChannelId === tabId}
			{@const unread = $unreadByChannel[tabId] ?? 0}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				onclick={() => handleSelectTab(tabId)}
				onkeydown={() => {}}
				class="group relative flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors whitespace-nowrap cursor-pointer
          {isActive
					? 'bg-surface-700 text-surface-100 border-b-2 border-hecate-500'
					: 'text-surface-400 hover:bg-surface-700/50 border-b-2 border-transparent'}"
			>
				<span class="font-mono text-[10px] text-surface-500">#</span>
				<span>{ch?.name ?? '...'}</span>
				{#if unread > 0 && !isActive}
					<span class="w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0"></span>
				{/if}
				<button
					onclick={(e) => handleCloseTab(e, tabId)}
					class="ml-1 opacity-0 group-hover:opacity-100 text-surface-500 hover:text-danger-400 text-[10px] transition-opacity"
					title="Close tab (Ctrl+W)"
				>
					x
				</button>
			</div>
		{/each}
	</div>
{/if}
