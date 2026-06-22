/**
 * Site-level docs configuration used by link rewriting and CI comments.
 *
 * Edit these values when installing the vitepress-docs skill.
 */

/** @type {string} Public GitHub repository URL (no trailing slash). */
export const repoUrl = 'https://github.com/headzoo/harborclient-service-hub';

/** @type {string} Default git branch for blob links. */
export const defaultBranch = 'main';

/** @type {string} GitHub blob URL prefix for source file links. */
export const repoBlobUrl = `${repoUrl}/blob/${defaultBranch}`;
