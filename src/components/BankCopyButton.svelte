<script lang="ts">
  /** A real Copy button: copies the plain value, reads "Copied", or "Press ⌘C" where the clipboard is blocked. */
  import { onDestroy } from 'svelte';
  import { copyText, pasteHint } from '../direct/format';
  import Icon from './Icon.svelte';

  interface Props {
    label: string;
    value: string;
    onCopied: (message: string) => void;
  }
  let { label, value, onCopied }: Props = $props();

  const COPIED_MS = 2000;
  let phase = $state<'idle' | 'done' | 'failed'>('idle');
  let timer: ReturnType<typeof setTimeout> | null = null;
  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });

  async function copy(): Promise<void> {
    const ok = await copyText(value);
    phase = ok ? 'done' : 'failed';
    onCopied(ok ? `${label.toLowerCase()} copied` : 'Copy failed');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (phase = 'idle'), COPIED_MS);
  }
</script>

<button
  type="button"
  class="reevit-copy"
  data-reevit="copy"
  data-copy={label.toLowerCase()}
  data-done={phase === 'done' ? '1' : undefined}
  aria-label={`Copy ${label.toLowerCase()}`}
  onclick={() => void copy()}
>
  <Icon name="copy" /><span>{phase === 'done' ? 'Copied' : phase === 'failed' ? pasteHint() : 'Copy'}</span>
</button>
