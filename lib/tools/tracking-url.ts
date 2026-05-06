/**
 * Build a public tracking URL for a given carrier + tracking number.
 * Returns null if the carrier isn't recognized so callers can fall back
 * to displaying the bare number.
 */
export function buildTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined
): string | null {
  if (!carrier || !trackingNumber) return null;
  const c = carrier.trim().toUpperCase();
  const num = encodeURIComponent(trackingNumber.trim());

  switch (c) {
    case 'UPS':
      return `https://www.ups.com/track?tracknum=${num}`;
    case 'FEDEX':
    case 'FED EX':
      return `https://www.fedex.com/fedextrack/?trknbr=${num}`;
    case 'USPS':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${num}`;
    default:
      return null;
  }
}
