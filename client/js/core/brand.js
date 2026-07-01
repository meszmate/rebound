/*
 * Rebound brand mark.
 * The "bounce" monogram — a ball dropped upper-left that bounces with decaying
 * humps and settles flat. Geometry mirrors the Branding Figma file's Primary
 * mark (fileKey ExF7F6OQea07IneHpInnXU, node 5:7). It inherits `currentColor`,
 * so the surrounding CSS `color` (normally var(--rb-accent)) tints it and it
 * follows the active theme.
 */
;(function (R) {
  'use strict';

  var MARK =
    '<svg class="rb-mark" viewBox="0 0 170 155" fill="none" aria-hidden="true" focusable="false">' +
      '<path d="M27.05 44.82C31.68 92.21 39.67 115.91 51 115.91C66.45 58.73 83.45 58.73 98.91 115.91C108.18 85 115.91 85 123.64 115.91C129.82 103.55 134.45 103.55 139.09 115.91" stroke="currentColor" stroke-width="10.05" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="27.05" cy="34" r="11.59" fill="currentColor"/>' +
    '</svg>';

  R.brand = { MARK: MARK };
})(window.Rebound = window.Rebound || {});
