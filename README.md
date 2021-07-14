# CryoLayer: Single Page Version

CryoLayer is a tool for deploying your Webflow site as a static site on Netlify. This is just the free single page version. [Get a license here for the infinite-page version](https://cryolayer.com/).

CryoLayer is a no code tool by default, but read on if you're a developer.

## Usage

Make sure you have 2 environment variables set:

- `URL`: The destination URL
- `WEBFLOW_URL`: The original source URL to be scraped

To do this, you can create a `.env` file with the contents of `.env.template`. and fill in the variables.

Then run:

```bash
yarn build
```

It should output the files to the `dist` folder in the project root. You can test the site out locally by running:

```bash
yarn serve
```