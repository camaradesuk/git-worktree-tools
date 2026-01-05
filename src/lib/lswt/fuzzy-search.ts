/**
 * Fuzzy search functionality for lswt interactive mode
 */

import type { WorktreeDisplay } from './types.js';

/**
 * Simple fuzzy match - checks if characters appear in order
 * Returns a score (higher = better match) or -1 if no match
 */
export function fuzzyScore(pattern: string, text: string): number {
  const patternLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();

  if (patternLower.length === 0) {
    return 0; // Empty pattern matches everything
  }

  if (patternLower.length > textLower.length) {
    return -1; // Pattern longer than text can't match
  }

  // Check for exact substring match first (highest score)
  const exactIndex = textLower.indexOf(patternLower);
  if (exactIndex !== -1) {
    // Bonus for match at start
    const startBonus = exactIndex === 0 ? 100 : 0;
    return 1000 + startBonus - exactIndex;
  }

  // Fuzzy match - characters must appear in order
  let score = 0;
  let patternIndex = 0;
  let consecutiveMatches = 0;
  let lastMatchIndex = -2;

  for (let i = 0; i < textLower.length && patternIndex < patternLower.length; i++) {
    if (textLower[i] === patternLower[patternIndex]) {
      // Score based on position and consecutive matches
      if (lastMatchIndex === i - 1) {
        consecutiveMatches++;
        score += 10 * consecutiveMatches; // Bonus for consecutive matches
      } else {
        consecutiveMatches = 0;
        score += 1;
      }

      // Bonus for matching at word boundaries
      if (i === 0 || text[i - 1] === ' ' || text[i - 1] === '-' || text[i - 1] === '_') {
        score += 20;
      }

      lastMatchIndex = i;
      patternIndex++;
    }
  }

  // Return -1 if not all pattern characters matched
  if (patternIndex < patternLower.length) {
    return -1;
  }

  return score;
}

/**
 * Get searchable text from a worktree for fuzzy matching
 */
export function getSearchableText(worktree: WorktreeDisplay): string {
  const parts: string[] = [];

  // Branch name is primary search target
  if (worktree.branch) {
    parts.push(worktree.branch);
  }

  // PR title and number for PR worktrees
  if (worktree.prNumber) {
    parts.push(`PR#${worktree.prNumber}`);
    parts.push(`#${worktree.prNumber}`);
  }

  if (worktree.prTitle) {
    parts.push(worktree.prTitle);
  }

  // PR state
  if (worktree.prState) {
    parts.push(worktree.prState);
  }

  // Type
  parts.push(worktree.type);

  return parts.join(' ');
}

/**
 * Filter worktrees by fuzzy search pattern
 * Returns worktrees sorted by match score (best first)
 */
export function filterWorktrees(
  worktrees: WorktreeDisplay[],
  pattern: string
): { worktree: WorktreeDisplay; score: number; originalIndex: number }[] {
  if (!pattern || pattern.trim().length === 0) {
    return worktrees.map((wt, i) => ({ worktree: wt, score: 0, originalIndex: i }));
  }

  const results: { worktree: WorktreeDisplay; score: number; originalIndex: number }[] = [];

  for (let i = 0; i < worktrees.length; i++) {
    const wt = worktrees[i];
    const searchText = getSearchableText(wt);
    const score = fuzzyScore(pattern, searchText);

    if (score >= 0) {
      results.push({ worktree: wt, score, originalIndex: i });
    }
  }

  // Sort by score (highest first)
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Highlight matched characters in text
 */
export function highlightMatches(
  text: string,
  pattern: string,
  highlightFn: (s: string) => string
): string {
  if (!pattern || pattern.length === 0) {
    return text;
  }

  const patternLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();

  // Try exact substring first
  const exactIndex = textLower.indexOf(patternLower);
  if (exactIndex !== -1) {
    return (
      text.substring(0, exactIndex) +
      highlightFn(text.substring(exactIndex, exactIndex + pattern.length)) +
      text.substring(exactIndex + pattern.length)
    );
  }

  // Fuzzy highlight - highlight matched characters
  const result: string[] = [];
  let patternIndex = 0;

  for (let i = 0; i < text.length; i++) {
    if (patternIndex < patternLower.length && textLower[i] === patternLower[patternIndex]) {
      result.push(highlightFn(text[i]));
      patternIndex++;
    } else {
      result.push(text[i]);
    }
  }

  return result.join('');
}
