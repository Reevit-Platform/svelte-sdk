<script lang="ts">
  /** The Ledger method list: one row per payment method, brand marks on the right. */
  import type { PaymentMethod } from '@reevit/core';
  import { METHOD_LABEL, getMethodMarks } from '../ledger';
  import Icon from './Icon.svelte';

  interface Props {
    methods: PaymentMethod[];
    country: string;
    disabled?: boolean;
    onPick: (method: PaymentMethod) => void;
  }
  let { methods, country, disabled = false, onPick }: Props = $props();
</script>

<ul class="reevit-list" data-reevit="list" aria-label="Payment methods">
  {#each methods as method, index (method)}
    <li>
      <button
        type="button"
        class="reevit-row"
        data-reevit="row"
        data-method={method}
        data-first={index === 0 ? '' : undefined}
        {disabled}
        onclick={() => onPick(method)}
      >
        <span class="reevit-row-label">{METHOD_LABEL[method]}</span>
        <span class="reevit-marks" data-reevit="marks" aria-hidden="true">
          {#each getMethodMarks(country, method) as mark (mark.key)}
            <img src={mark.src} data-mark={mark.key} alt="" />
          {/each}
        </span>
        <span class="reevit-chevron" aria-hidden="true"><Icon name="chevron" /></span>
      </button>
    </li>
  {/each}
</ul>
<h2 class="reevit-sr" tabindex="-1" data-reevit="panel-title">Choose a payment method</h2>
