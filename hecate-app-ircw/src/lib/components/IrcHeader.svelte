<script lang="ts">
	import {
		channels,
		activeChannelId,
		streamConnected,
		nick,
		activeChannelMembers
	} from '../stores/irc.js';
</script>

<div class="flex items-center gap-3 px-4 py-2.5 bg-surface-800 border-b border-surface-600 shrink-0">
	{#if $activeChannelId}
		{@const ch = $channels.find((c) => c.channel_id === $activeChannelId)}
		<span class="text-accent-400 text-sm font-mono">#{ch?.name ?? '...'}</span>
		{#if ch?.topic && ch.topic !== 'undefined'}
			<span class="text-surface-500 text-[10px] truncate">{ch.topic}</span>
		{/if}
	{:else}
		<span class="text-surface-400 text-sm">IRC Lobby</span>
	{/if}
	<div class="flex-1"></div>
	<div class="flex items-center gap-2 text-[10px]">
		{#if $nick}
			<span class="text-surface-400 font-mono">{$nick}</span>
			<div class="w-px h-3 bg-surface-600"></div>
		{/if}
		<span
			class="inline-block w-1.5 h-1.5 rounded-full {$streamConnected
				? 'bg-success-400'
				: 'bg-danger-400'}"
		></span>
		{#if $activeChannelId}
			<span class="text-surface-500">{$activeChannelMembers.length} members</span>
		{:else}
			<span class="text-surface-500">lobby</span>
		{/if}
	</div>
</div>
