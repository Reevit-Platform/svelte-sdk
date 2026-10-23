/**
 * Ghana mobile money number helpers used by MobileMoneyForm.
 *
 * `@reevit/core`'s `validatePhone(phone, country)` takes a country, not a network,
 * so it cannot tell MTN from Telecel; these match the operator codes instead.
 */

/** Validate a Ghana mobile money number, optionally against one network. */
export function validatePhone(phone: string, network?: string): boolean {
  const cleaned = phone.replace(/[\s-]/g, '');

  const patterns = {
    mtn: /^(0|233|\+233)?(24|54|55|59)\d{7}$/,
    telecel: /^(0|233|\+233)?(20|50)\d{7}$/,
    airteltigo: /^(0|233|\+233)?(26|27|56|57)\d{7}$/,
  };

  if (network && patterns[network as keyof typeof patterns]) {
    return patterns[network as keyof typeof patterns].test(cleaned);
  }

  return Object.values(patterns).some((pattern) => pattern.test(cleaned));
}

/**
 * Detect the mobile money network from a Ghana phone number.
 * Accepts local (0XXXXXXXXX) and international (233… / +233…) formats,
 * then matches the two-digit operator code.
 */
export function detectNetwork(phone: string): string | null {
  let cleaned = phone.replace(/[\s-]/g, '');

  // Normalise any supported format to local 0XXXXXXXXX form.
  if (cleaned.startsWith('+233')) {
    cleaned = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('233')) {
    cleaned = '0' + cleaned.slice(3);
  }

  if (!cleaned.startsWith('0') || cleaned.length < 3) {
    return null;
  }

  // The operator code is the two digits after the leading 0.
  const code = cleaned.slice(1, 3);

  // Operator codes kept in sync with @reevit/core's detectNetwork.
  const operatorCodes: Record<string, string[]> = {
    mtn: ['24', '25', '53', '54', '55', '59'],
    telecel: ['20', '50'],
    airteltigo: ['26', '27', '56', '57'],
  };

  for (const [network, codes] of Object.entries(operatorCodes)) {
    if (codes.includes(code)) {
      return network;
    }
  }

  return null;
}
