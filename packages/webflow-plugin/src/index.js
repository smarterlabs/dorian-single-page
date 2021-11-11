const { join } = require(`path`)
const globby = require(`globby`)
const cheerio = require(`cheerio`)
const { readFile, outputFile } = require(`fs-extra`)
const posthtml = require(`posthtml`)
const posthtmlWebp = require(`posthtml-webp`)
const webp = require(`webp-converter`)
const postcss = require('postcss')
const postcssWebp = require(`webp-in-css/plugin`)
const inlineCriticalCss = require(`netlify-plugin-inline-critical-css`).onPostBuild
const imageOptim = require(`netlify-plugin-image-optim`).onPostBuild
const { SitemapStream, streamToPromise } = require( 'sitemap' )
const axios = require(`axios`)

let destinationOrigin = process.env.URL || process.env.VERCEL_URL || process.env.DEPLOY_URL
if(destinationOrigin.indexOf(`://`) === -1){
	destinationOrigin = `https://` + destinationOrigin
}
if(destinationOrigin[destinationOrigin.length - 1] !== `/`){
	destinationOrigin = destinationOrigin + `/`
}

webp.grant_permission()
let origin = process.env.WEBFLOW_URL
if(origin[origin.length - 1] !== `/`) {
	origin += `/`
}

function toBool(str){
	const type = typeof str
	if(type === `boolean`) {
		return str
	}
	if(type === `string`) {
		if(
			str === `true` ||
			str === `yes` ||
			str === `on` ||
			str === `1`
		) {
			return true
		}
		return false
	}
	return !!str
}

// Check for feature flags
let useWebp = toBool(process.env.WEBP)
let inlineCss = toBool(process.env.INLINE_CSS)

module.exports = function webflowPlugin(){
	let excludeFromSitemap = []

	return function(){
		
		// Parse CSS for webp images
		if(useWebp){
			this.on(`parseCss`, async ({ data }) => {
				const result = await postcss([postcssWebp({
					rename: oldName => {
						// Extracts url from CSS string background image
						const oldUrl = oldName.match(/url\(['"]?([^'"]+)['"]?\)/)[1]
						const newUrl = `${oldUrl}.webp`
						const newName = oldName.replace(oldUrl, newUrl)
						return newName
					}
				})])``
					 .process(data, { from: undefined })
				return result.css
			})
		}

		this.on(`parseHtml`, ({ $, url }) => {
			const $body = $(`body`)
			const $head = $(`head`)
			const $html = $(`html`)

			// Add lang attrbute
			if(!$html.attr(`lang`)){
				$html.attr(`lang`, `en`)
			}

			// Polyfill for webp
			if(useWebp){
				$body.append(`<script>document.body.classList.remove('no-js');var i=new Image;i.onload=i.onerror=function(){document.body.classList.add(i.height==1?"webp":"no-webp")};i.src="data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";</script>`)
			}

			// Removes the "Powered by Webflow" link for paid accounts
			$html.removeAttr(`data-wf-domain`)

			// Remove generator meta tag
			$head.find(`meta[name="generator"]`).remove()

			// Add CryoLayer generator meta tag
			$head.append(`<meta name="generator" content="CryoLayer" />`)

			// Make webfonts.js async
			// let webfontsJs = `{}`
			// let webfontsSrc = ``
			// $(`script`).each((i, el) => {
			// 	const $el = $(el)
			// 	const src = $el.attr(`src`)
			// 	const contents = get(el, `children.0.data`, ``)
			// 	if (
			// 		src &&
			// 		src.indexOf(`googleapis.com`) > -1 &&
			// 		src.indexOf(`webfont.js`) > -1
			// 	) {
			// 		webfontsSrc = src
			// 		$el.remove()
			// 	}
			// 	if(contents && contents.indexOf(`WebFont.load({`) === 0){
			// 		webfontsJs = contents.replace(`WebFont.load(`, ``).replace(`);`, ``)
			// 		$el.remove()
			// 	}
			// })
			// $head.append(`<script>WebFontConfig=${webfontsJs},function(e){var o=e.createElement("script"),t=e.scripts[0];o.src="${webfontsSrc}",o.async=!0,t.parentNode.insertBefore(o,t)}(document);</script>`)

			// Fix cross-origin links
			$(`a`).each((i, el) => {
				const $el = $(el)
				const href = $el.attr(`href`)
				if(href){
					if (href.indexOf(`://`) > -1) {
						$el.attr(`rel`, `noopener noreferrer`)
					}
					// Make internal links external
					else if (!process.env.BCP) {
						$el.attr(`href`, `${origin}${href.replace(`/`, ``)}`)
					}
				}
			})

			// Find links to remove from sitemap
			let includeInSitemap = $body.attr(`sitemap`)
			if(includeInSitemap){
				$body.removeAttr(`sitemap`)
			}
			if(includeInSitemap === `false` || includeInSitemap === `0` || includeInSitemap === `no`){
				includeInSitemap = false
			}
			else{
				includeInSitemap = true
			}
			if(!includeInSitemap){
				excludeFromSitemap.push(url)
			}


		})

		// Need to output as `{{name}}.html` instead of `index.html` for pretty URLs
		this.on(`writeFile`, async obj => {
			const dist = this.dist
			let { outputPath } = obj
			
			// Split path into parts
			const parts = outputPath.replace(dist, ``).split(`/`)
			const name = parts.pop()
			const dir = parts.pop()
			if(name === `index.html` && dir){
				obj.outputPath = dist + parts.join(`/`) + `/` + dir + `.html`
			}
		})

		this.on(`complete`, async () => {
			const dist = this.dist
			const PUBLISH_DIR = join(process.cwd(), dist)

			// Inline critical CSS
			if(inlineCss){
				console.log(`Inlining critical CSS...`)
				await inlineCriticalCss({
					inputs: {
						fileFilter: ['*.html'],
						directoryFilter: ['!node_modules'],
						minify: true,
						extract: true,
						dimensions: [
							{
								width: 414,
								height: 896,
							},
							{
								width: 1920,
								height: 1080,
							},
						],
					},
					constants: {
						PUBLISH_DIR,
					},
					utils: {
						build: {
							failBuild: (msg, { error }) => {
								console.error(msg)
								console.error(error)
								// process.exit(1)
							},
						},
					},
				}).catch(err => {
					console.log(`ERROR`)
					console.error(err)
				})
			}

			// Optimize images
			const optimizeImages = toBool(process.env.OPTIMIZE_IMAGES)
			if(optimizeImages){
				console.log(`Optimizing images...`)
				await imageOptim({
					constants: {
						PUBLISH_DIR,
					},
				}).catch((err) => {
					console.error(err)
					// process.exit(1)
				})
			}
			
			

			// Create robots.txt if it doesn't exist
			const robotsTxt = process.env.REPLACE_ROBOTS_TXT
			if (robotsTxt === `enabled`) {
				console.log(`Creating search index enabled robots.txt...`)
				await outputFile(join(dist, `robots.txt`), ``)
			}
			else if(robotsTxt === `disabled`){
				console.log(`Creating search index disabled robots.txt...`)
				await outputFile(join(dist, `robots.txt`), `User-agent: *\nDisallow: /`)
			}


			if(useWebp){
				// Add webp support to HTML files
				console.log(`Adding webp support...`)
				const htmlFiles = await globby(`${dist}/**/*.html`)
				for(let file of htmlFiles){
					let html = await readFile(file, `utf8`)
					// Add webp support to image tags
					let result
					try{
						result = await posthtml()
							.use(posthtmlWebp({
								extensionIgnore: [`svg`],
							}))
							.process(html)
						html = result.html
						await outputFile(file, html)
					}
					catch(err){
						console.log(`Couldn't process WebP`)
						console.error(err)
					}
				}

				// Create webp images
				console.log(`Creating webp images...`)
				const images = await globby(`${dist}/**/*.{jpg,jpeg,png,gif}`)
				for(let file of images){
					const newPath = file + `.webp`
					await webp.cwebp(file, newPath, `-q 90`)
				}
			}

			const replaceSitemap = toBool(process.env.REPLACE_SITEMAP)
			if(replaceSitemap){
				// Create sitemap from final URLs list
				console.log(`Creating sitemap...`)

				// Create a stream to write to
				const stream = new SitemapStream({
					hostname: destinationOrigin,
				})
			 
				// Loop over your links and add them to your stream
				this.finalUrls.forEach( link => {
					// Remove origin from link
					link = link.replace(process.env.WEBFLOW_URL, ``)
					return stream.write({
						url: link,
					})
				})
				stream.end()
			 
				const sitemapRes = await streamToPromise(stream).then( data => data.toString() )
				const sitemapPath = join(dist, `sitemap.xml`)
				console.log(`Writing new replacement sitemap...`)
				await outputFile(sitemapPath, sitemapRes)
				
			}


			// Remove excluded pages from sitemap
			excludeFromSitemap = excludeFromSitemap.map(url => {
				url = this.convertUrl(url)
				return url
			})
			const xmlFiles = await globby(join(dist, `**/*.xml`))

			for(let xmlPath of xmlFiles){
				const xmlStr = await readFile(xmlPath, `utf8`)
				const $ = cheerio.load(xmlStr, {
					decodeEntities: false,
					xmlMode: true,
				})
				$(`url`).each((_, el) => {
					const $url = $(el)
					const loc = $url.find(`loc`)
					const url = loc.text().trim()
					if(excludeFromSitemap.indexOf(url) > -1){
						$url.remove()
					}
				})
				const newXml = $.xml()
				console.log(`Writing new Sitemap with excluded pages...`)
				await outputFile(xmlPath, newXml)
			}

			// Remove Webflow branding
			if(toBool(process.env.REMOVE_WEBFLOW_BRANDING)){
				console.log(`Removing Webflow branding...`)
				const globPath = join(this.dist, `**/*.js`)
				const jsFiles = await globby(globPath)
				console.log(`jsFiles`, jsFiles)

				const oldStr = `(e=e||(n=t('<a class="w-webflow-badge"></a>')`
				const newStr = `(true||(n=t('<a class="w-webflow-badge"></a>')`

				const fullOldStr = `var shouldBrand = $html.attr('data-wf-status');`
				const fullNewStr = `var shouldBrand = false;`

				for(let filePath of jsFiles){
					const jsStr = await readFile(filePath, `utf8`)
					if(jsStr.indexOf(oldStr) > -1){
						console.log(`Replacing Webflow branding...`)
						const result = jsStr.replace(oldStr, newStr)
						await outputFile(filePath, result)
					}
					else if(jsStr.indexOf(fullOldStr) > -1){
						console.log(`Replacing Webflow branding...`)
						const result = jsStr.replace(fullOldStr, fullNewStr)
						await outputFile(filePath, result)
					}
					else{
						console.log(`Webflow branding not found in "${filePath}"`)
					}
				}
			}


			// Write redirects file
			if(process.env.SITE_ID){
				const redirectsRes = await axios({
					method: `get`,
					url: `https://app.cryolayer.com/api/redirects/${process.env.SITE_ID}`,
				}).catch(err => {
					console.log(`No redirects found`)
					// console.error(err)
				})
				const redirects = redirectsRes.data || []
				console.log(`redirects`, redirects)
				const redirectsStr = redirects.map(redirect => {
					return `${redirect.from}\t${redirect.to}\t${redirect.statusCode || 301}`
				}).join(`\n`)
				console.log(`Writing redirects file...`)
				console.log(redirectsStr)
				await outputFile(join(dist, `_redirects`), redirectsStr)
			}
			else{
				console.log(`No Netlify site ID found`)
			}


		})
	}
}

