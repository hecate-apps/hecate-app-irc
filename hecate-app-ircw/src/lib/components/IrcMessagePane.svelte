<script lang="ts">
	import {
		channels,
		activeChannelId,
		activeMessages,
		nick,
		sendMessageOptimistic,
		parseAndExecute
	} from '../stores/irc.js';

	let inputText = $state('');
	let messagesEnd: HTMLDivElement | undefined = $state();
	let inputRef: HTMLTextAreaElement | undefined = $state();

	// Auto-scroll when new messages arrive
	$effect(() => {
		if ($activeMessages.length && messagesEnd) {
			messagesEnd.scrollIntoView({ behavior: 'smooth' });
		}
	});

	// Auto-focus input when channel changes
	$effect(() => {
		if ($activeChannelId && inputRef) {
			inputRef.focus();
		}
	});

	function handleSend() {
		const id = $activeChannelId;
		const text = inputText.trim();
		if (!id || !text) return;

		inputText = '';

		if (text.startsWith('/')) {
			parseAndExecute(text, id);
			inputRef?.focus();
			return;
		}

		sendMessageOptimistic(id, text, $nick || 'anon');
		inputRef?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	function formatTime(ts: number): string {
		const d = new Date(ts);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	export function focusInput() {
		inputRef?.focus();
	}
</script>

<div class="flex-1 flex flex-col min-w-0 min-h-0">
	<!-- Messages -->
	<div class="flex-1 overflow-y-auto px-4 py-2">
		{#if $activeMessages.length === 0}
			<div class="flex items-center justify-center h-full">
				<div class="text-center text-surface-500">
					<div class="text-2xl mb-2">#</div>
					<div class="text-xs">No messages yet</div>
					<div class="text-[10px] mt-1 text-surface-600">Type /help for available commands</div>
				</div>
			</div>
		{:else}
			{#each $activeMessages as msg}
				{#if msg.type === 'system'}
					<div class="py-1 px-1">
						<span class="text-[10px] text-surface-500 italic whitespace-pre-wrap"
							>{msg.content}</span
						>
					</div>
				{:else if msg.type === 'action'}
					<div class="flex gap-2 py-1 hover:bg-surface-800/30 rounded px-1">
						<span class="text-[10px] text-surface-600 shrink-0 pt-0.5 w-12 text-right"
							>{formatTime(msg.timestamp)}</span
						>
						<span class="text-xs text-purple-400 italic">* {msg.nick} {msg.content}</span>
					</div>
				{:else}
					<div class="flex gap-2 py-1 hover:bg-surface-800/30 rounded px-1">
						<span class="text-[10px] text-surface-600 shrink-0 pt-0.5 w-12 text-right"
							>{formatTime(msg.timestamp)}</span
						>
						<span class="text-xs font-medium text-accent-400 shrink-0">{msg.nick}</span>
						<span class="text-xs text-surface-200 break-words min-w-0">{msg.content}</span>
					</div>
				{/if}
			{/each}
			<div bind:this={messagesEnd}></div>
		{/if}
	</div>

	<!-- Input bar -->
	<div class="px-4 py-3 border-t border-surface-600 bg-surface-800">
		<textarea
			bind:this={inputRef}
			bind:value={inputText}
			onkeydown={handleKeydown}
			placeholder="Message #{$channels.find((c) => c.channel_id === $activeChannelId)?.name ?? '...'} -- /help for commands"
			rows="1"
			class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
        text-xs text-surface-100 placeholder-surface-500
        focus:outline-none focus:border-accent-500/50
        resize-none min-h-[32px] max-h-[120px]"
		></textarea>
	</div>
</div>
