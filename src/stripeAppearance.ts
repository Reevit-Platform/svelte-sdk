import type { StripeAppearance } from './bridges/loaders';

// Ledger-themed appearance for Stripe Elements: Inter-style type, ink on paper,
// 12px radius, 48px inputs and the checkout's own input border and focus ring.
// (Stripe renders in its own iframe, so it cannot load the bundled fonts; the
// system UI face is the closest match it can use.)
export const getReevitStripeAppearance = (dark: boolean): StripeAppearance => {
  const ink = dark ? '#f4f3ee' : '#151513';
  const paper = dark ? '#1a1a18' : '#f4f3ee';
  const line = dark ? 'rgba(244, 243, 238, 0.14)' : '#d3d0c6';
  const lineStrong = dark ? 'rgba(244, 243, 238, 0.32)' : '#a8a69b';
  const field = dark ? 'rgba(244, 243, 238, 0.04)' : 'rgba(255, 255, 255, 0.6)';
  const muted = dark ? '#a3a29c' : '#6b6a64';

  return {
    theme: dark ? 'night' : 'flat',
    variables: {
      colorPrimary: ink,
      colorBackground: paper,
      colorText: ink,
      colorTextSecondary: muted,
      colorTextPlaceholder: dark ? '#6f6e69' : '#9a988f',
      colorDanger: '#ef4444',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      fontSizeBase: '16px',
      fontSizeSm: '13px',
      fontWeightNormal: '400',
      fontWeightMedium: '500',
      fontWeightBold: '600',
      borderRadius: '12px',
      spacingUnit: '4px',
      spacingGridRow: '16px',
      spacingGridColumn: '12px',
    },
    rules: {
      '.Input': {
        border: `1px solid ${line}`,
        boxShadow: 'none',
        padding: '14px',
        height: '48px',
        fontSize: '16px',
        backgroundColor: field,
      },
      '.Input:hover': { border: `1px solid ${lineStrong}` },
      '.Input:focus': {
        border: `1px solid ${ink}`,
        boxShadow: `0 0 0 1px ${ink}`,
        backgroundColor: field,
      },
      '.Input--invalid': {
        border: '1px solid #ef4444',
        boxShadow: '0 0 0 1px #ef4444',
      },
      '.Label': {
        fontSize: '13px',
        fontWeight: '500',
        marginBottom: '7px',
        color: dark ? '#d9d7cf' : '#3a3935',
      },
      '.Tab': {
        border: `1px solid ${line}`,
        backgroundColor: field,
        boxShadow: 'none',
      },
      '.Tab:hover': { border: `1px solid ${lineStrong}` },
      '.Tab--selected': {
        border: `1px solid ${ink}`,
        boxShadow: `0 0 0 1px ${ink}`,
        backgroundColor: field,
      },
      '.Block': {
        border: `1px solid ${line}`,
        backgroundColor: field,
        boxShadow: 'none',
      },
      '.CheckboxInput': { border: `1px solid ${line}` },
      '.CheckboxInput--checked': { backgroundColor: ink, borderColor: ink },
    },
  };
};
