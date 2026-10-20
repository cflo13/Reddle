# Chaouls demo website

A one-page static site (HTML, CSS, a little JavaScript). No build step.

## Swapping in real photos

1. Put the photos in `images/` as `hero.jpg` and `sue-and-chaoul.jpg` (portrait shape works best).
2. In `index.html`, each placeholder has a comment above it. Replace the placeholder `<div>` with the `<img>` line from the comment.

## Adding real reviews

In `index.html`, find the three `<figure class="review is-placeholder">` blocks. For each one:
- paste the review text into `<blockquote>` and the reviewer's first name into `<figcaption>`,
- delete the `<p class="placeholder-tag">` line,
- remove ` is-placeholder` from the class.

## Before going live

Remove the `noindex` line in `index.html`, delete `_headers`, and remove the "Preview website" line in the footer.

## Deploy

Cloudflare Pages project `chaoulspreview`, uploaded straight from this folder:

    npx wrangler pages deploy . --project-name chaoulspreview --branch main
