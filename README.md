# CryoLayer

CryoLayer is a tool for deploying your Webflow site as a static site on Netlify. This is just the free single page version. [Get a license here for the infinite-page version](https://cryolayer.com/).

CryoLayer is a no code tool by default, but read on if you're a developer.

## Usage

Set environment variables for the destination URL, Webflow URL, and any optimization settings you may want.

- `URL`: The destination URL (required), example: "https://your-new-website.com/"
- `WEBFLOW_URL`: The original source URL to be scraped (required), example: "https://your-webflow-site.webflow.io/"
- `INLINE_CSS`: "true" or "false"
- `REPLACE_ROBOTS_TXT`: "enabled" or "disabled"
- `REPLACE_SITEMAP`: "true" or "false"
- `WEBP`: "true" or "false"
- `REMOVE_WEBFLOW_BRANDING`: "true" or "false"
- `OPTIMIZE_IMAGES`: "true" or "false"

To do this, you can create a `.env` file with the contents of `.env.template`. and fill in the variables.

Then run:

```bash
yarn build
```

It should output the files to the `public` folder in the project root. You can test the site out locally by running:

```bash
yarn serve
```