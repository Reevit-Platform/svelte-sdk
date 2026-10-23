<script lang="ts">
  import { ReevitCheckout } from '../src';

  const params = new URLSearchParams(location.search);
  const events: string[] = [];
  (window as unknown as { __events: string[] }).__events = events;
  let open = $state(true);
</script>

<ReevitCheckout
  bind:isOpen={open}
  sessionSecret={params.get('session') || ''}
  apiBaseUrl={params.get('api') || 'http://localhost:8080'}
  reference="ORD-24817"
  paymentMethods={['card', 'mobile_money']}
  successDelayMs={600000}
  theme={{ companyName: 'Kente & Co.' }}
  on:success={(e) => events.push(`success:${e.detail.paymentId}`)}
  on:error={(e) => events.push(`error:${e.detail.code}`)}
  on:close={() => events.push('close')}
/>
