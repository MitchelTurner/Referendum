import type { ItemType } from './schemas';

/**
 * SPEC-GAP: default review chains per item type. A body may override by passing
 * its own labels; there is no template table in §4.
 */
export const DEFAULT_REVIEW_CHAIN: Record<ItemType, string[]> = {
  CONSENT: ['Clerk'],
  PUBLIC_HEARING: ['Planner', 'Director', 'Manager', 'Attorney'],
  NEW_BUSINESS: ['Staff', 'Manager', 'Attorney'],
  UNFINISHED_BUSINESS: ['Staff', 'Manager'],
  REPORT: ['Staff'],
  PRESENTATION: [],
  CORRESPONDENCE: ['Clerk'],
  OTHER: ['Staff'],
};

export function reviewChainFor(type: ItemType, override?: string[]): string[] {
  if (override) return override;
  return DEFAULT_REVIEW_CHAIN[type];
}
