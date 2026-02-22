<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		activeChannelId,
		activeChannelMembers,
		fetchChannelMembers
	} from '../stores/irc.js';

	const POLL_INTERVAL_MS = 15000;
	let pollTimer: ReturnType<typeof setInterval> | undefined;

	// Fetch members when active channel changes
	$effect(() => {
		if ($activeChannelId) {
			const channelId = $activeChannelId;
			fetchChannelMembers(channelId);
			// Re-fetch shortly after in case join hasn't propagated yet
			const initialTimer = setTimeout(() => fetchChannelMembers(channelId), 1500);
			// Set up polling
			clearInterval(pollTimer);
			pollTimer = setInterval(() => {
				fetchChannelMembers(channelId);
			}, POLL_INTERVAL_MS);
			return () => clearTimeout(initialTimer);
		} else {
			clearInterval(pollTimer);
		}
	});

	onDestroy(() => {
		clearInterval(pollTimer);
	});
</script>

<div class="w-40 shrink-0 bg-surface-850 border-l border-surface-600 flex flex-col">
	<div class="px-3 py-2">
		<span class="text-[10px] text-surface-500 uppercase tracking-wider font-medium">
			Members ({$activeChannelMembers.length})
		</span>
	</div>
	<div class="flex-1 overflow-y-auto">
		{#each $activeChannelMembers as member}
			<div class="flex items-center gap-1.5 px-3 py-1">
				<span
					class="w-1.5 h-1.5 rounded-full shrink-0 {member.online
						? 'bg-success-400'
						: 'bg-surface-600'}"
				></span>
				<span class="text-[10px] text-surface-300 truncate">{member.nick}</span>
			</div>
		{/each}

		{#if $activeChannelMembers.length === 0}
			<div class="px-3 py-2 text-[10px] text-surface-500 italic">No members</div>
		{/if}
	</div>
</div>
