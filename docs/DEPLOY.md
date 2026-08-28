# Deploying meet-dot.pages.dev

**Pushing to GitHub does not deploy anything.** Confirmed 2026-08-28:

```
$ npx wrangler pages project list
│ Project Name │ Project Domains    │ Git Provider │
│ meet-dot     │ meet-dot.pages.dev │ No           │
```

`meet-dot` is a Cloudflare Pages **Direct Upload** project. It has no git
connection, so a push to `master` triggers no build, and a pushed branch gets no
preview URL — `https://<branch-slug>.meet-dot.pages.dev` returns 404 forever.
Both were observed for seven minutes before the cause was found.

## To deploy

```
cd web
npm run build
npx wrangler pages deploy dist --project-name=meet-dot --branch=main
```

Wrangler prints a unique immutable URL per deployment
(e.g. `https://ff267532.meet-dot.pages.dev`) alongside the live
`https://meet-dot.pages.dev`. The unique one is useful for handing someone an
exact build.

## Verify after every deploy

The same-origin CODAP proxy is a Pages **Function**
(`web/functions/codap/[[path]].js`), not a static file. It is picked up from
`web/functions/` because the deploy runs from `web/` — deploying from the repo
root would silently ship a site whose `/codap/` 404s and whose every page looks
fine until CODAP fails to load.

```
curl -s -o /dev/null -w "%{http_code}\n" https://meet-dot.pages.dev/codap/
```

Expect `200`. Also confirm the built bundle carries what you think it does —
and use `python3`, not `grep`: the bundle is ~165 KB across ~112 lines, and BSD
grep silently finds nothing in lines that long. That produced a false "the
feature is missing from the build" report on 2026-08-28.

```
python3 -c "d=open('dist/assets/codap-main-<hash>.js').read(); print(d.count('wonderings'))"
```

## Entry points

`web/vite.config.js` lists every page as a build input — `home`, `index`,
`codapSame`, `codap`, `injectTest`. Vite builds only `index.html` by default, so
a page missing from that list 404s in production while working perfectly in dev.

It pins **no port**, so the `:5199` quoted in the goal statements and plans is
whatever Vite picked that day; it commonly comes up on 5173/5174.
