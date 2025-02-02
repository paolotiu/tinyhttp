import { App } from '@tinyhttp/app'
import serve from 'sirv'
import { markdownStaticHandler as md } from '@tinyhttp/markdown'
import { logger } from '@tinyhttp/logger'
import { createReadStream } from 'fs'
import fetchCache from 'node-fetch-cache'
import hljs from 'highlight.js'
import * as eta from 'eta'
import { EtaConfig } from 'eta/dist/types/config'
import marked from 'marked'

const fetch = fetchCache(`${__dirname}/.cache`)

const app = new App<EtaConfig>({
  settings: {
    networkExtensions: true
  },
  noMatchHandler: (_, res) => {
    res.format({
      text: (_, res) => res.sendStatus(404),
      html: (_, res) => res.sendFile(`${process.cwd()}/static/404.html`)
    })
  }
})

const PORT = parseInt(process.env.PORT, 10) || 3000

const NON_MW_PKGS: string[] = [
  'app',
  'etag',
  'cookie',
  'cookie-signature',
  'dotenv',
  'send',
  'router',
  'req',
  'res',
  'type-is',
  'content-disposition',
  'forwarded',
  'proxy-addr',
  'accepts',
  'cli'
]

app
  .engine('eta', eta.renderFile)
  .use(
    logger({
      ip: true,
      timestamp: true,
      output: {
        callback: console.log,
        color: false
      }
    })
  )
  .use(
    serve('static', {
      dev: process.env.NODE_ENV !== 'production',
      immutable: process.env.NODE_ENV === 'production'
    })
  )
  .get('/mw', async (req, res, next) => {
    try {
      const request = await fetch('https://api.github.com/repos/talentlessguy/tinyhttp/contents/packages')

      const json = await request.json()

      let pkgs = json.filter((e) => !NON_MW_PKGS.includes(e.name))

      if (req.query.q) {
        pkgs = json.filter((el: any) => {
          const query = req.query.q as string

          return el.name.indexOf(query.toLowerCase()) > -1
        })
      }

      res.render(
        'pages/search.eta',
        {
          title: 'Middleware',
          pkgTemplates: pkgs
            .map(
              (mw) => `
<a class="mw_preview" href="/mw/${mw.name}">
  <div>
    <h3>${mw.name}</h3>
  </div>
</a>
`,
              pkgs
            )
            .join('<br />'),
          head: `<link rel="stylesheet" href="/css/search.css" />`
        },
        { renderOptions: { autoEscape: false } }
      )
    } catch (e) {
      next(e)
    }
  })
  .get('/mw/:mw', async (req, res, next) => {
    if (NON_MW_PKGS.includes(req.params.mw)) {
      next()
    } else {
      let json: any, status: number

      try {
        const res = await fetch(`https://registry.npmjs.org/@tinyhttp/${req.params.mw}`)

        status = res.status
        json = await res.json()
      } catch (e) {
        next(e)
      }

      if (status === 404) res.sendStatus(status)
      else {
        const name = json.name
        const version = json['dist-tags'].latest

        const pkgBody = json.versions[version]

        const readme = marked(json.readme || '', {
          highlight(code, language) {
            if (!language) language = 'txt'

            return hljs.highlight(code, { language }).value
          }
        })

        const repo = pkgBody.repository

        const dir = repo.directory

        const link = repo.url.replace(repo.type + '+', '').replace('.git', '')

        res.render(
          `pages/mw.eta`,
          {
            link,
            dir,
            readme,
            pkg: name,
            version,
            title: `${name} | tinyhttp`,
            head: `<link rel="stylesheet" href="/css/mw.css" />`
          },
          { renderOptions: { autoEscape: false } }
        )
      }
    }
  })
  .use(
    md('static', {
      stripExtension: true,

      markedOptions: {
        highlight(code, language) {
          if (!language) language = 'txt'

          return hljs.highlight(code, { language }).value
        },
        headerIds: true
      },
      caching: {
        maxAge: 3600 * 24 * 365,
        immutable: true
      }
    })
  )

  .listen(3000, () =>
    console.log(`Running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`)
  )
