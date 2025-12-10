"use client";

/**
 * Cloudflare Images helper functions
 * Generates URLs for images stored in Cloudflare Images
 */

// Get account hash from environment or fallback
function getAccountHash(): string {
  // Try to get from process.env first (server-side or build-time)
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH) {
    return process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH;
  }
  // Fallback to hardcoded value
  return 'LDTNFDrUnJY_bFTI66y-jw';
}

const CLOUDFLARE_IMAGES_DELIVERY_URL = 'https://imagedelivery.net';

/**
 * Generates Cloudflare Images URL from Image ID
 * @param imageId - Cloudflare Image ID or full URL
 * @param variant - Image variant (default: 'public')
 * @returns Full Cloudflare Images URL
 */
export function getCloudflareImageUrl(imageId: string, variant: string = 'public'): string {
  // If already a full URL, return as-is
  if (imageId.startsWith('http://') || imageId.startsWith('https://')) {
    return imageId;
  }

  // Generate Cloudflare Images URL
  const accountHash = getAccountHash();
  return `${CLOUDFLARE_IMAGES_DELIVERY_URL}/${accountHash}/${imageId}/${variant}`;
}

/**
 * Checks if value is a Cloudflare Image ID (not a full URL)
 * @param value - String to check
 * @returns True if it's an Image ID, false if it's a URL
 */
export function isCloudflareImageId(value: string): boolean {
  return !value.startsWith('http://') && !value.startsWith('https://');
}

/**
 * Extracts Image ID from Cloudflare Images URL or returns the ID if already extracted
 * @param value - Cloudflare Images URL or Image ID
 * @returns Image ID
 */
export function extractImageId(value: string): string {
  // If already an ID, return as-is
  if (isCloudflareImageId(value)) {
    return value;
  }

  // Extract ID from URL pattern: https://imagedelivery.net/{account-hash}/{image-id}/{variant}
  const match = value.match(/imagedelivery\.net\/[^\/]+\/([^\/]+)/);
  return match ? match[1] : value;
}

/**
 * Gets image URL with specific variant
 * Useful for thumbnails, responsive images, etc.
 */
export function getImageVariant(imageId: string, variant: 'public' | 'thumbnail' | 'avatar'): string {
  const id = extractImageId(imageId);
  return getCloudflareImageUrl(id, variant);
}
