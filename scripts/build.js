// Builds the plugin into dist/: code.js for the main thread, and ui.html with
// the bundled ui.ts inlined, since Figma loads the UI as a single HTML string.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')
const OUT = 'dist'

// Figma's main thread runs an older JavaScript engine than its UI iframe
const shared = { bundle: true, minify: !watch, logLevel: 'info' }

const inlineUI = {
    name: 'inline-ui',
    setup(build) {
        build.onEnd(async (result) => {
            if (result.errors.length) return
            const [script] = result.outputFiles
            const html = await readFile('src/ui.html', 'utf8')
            const placeholder = /<script>[\s\S]*?<\/script>/
            if (!placeholder.test(html)) {
                throw new Error('src/ui.html has no <script> placeholder')
            }
            // A function replacement, so "$&" and the like in the bundle stay
            // as they are; "</script" inside it must not close the tag
            const code = script.text.replaceAll('</script', '<\\/script')
            await mkdir(OUT, { recursive: true })
            await writeFile(
                `${OUT}/ui.html`,
                html.replace(placeholder, () => `<script>${code}</script>`),
            )
        })
    },
}

const contexts = await Promise.all([
    esbuild.context({
        ...shared,
        entryPoints: ['src/code.ts'],
        outfile: `${OUT}/code.js`,
        target: 'es2017',
    }),
    esbuild.context({
        ...shared,
        entryPoints: ['src/ui.ts'],
        write: false,
        outfile: `${OUT}/ui.js`,
        target: 'es2020',
        format: 'iife',
        plugins: [inlineUI],
    }),
])

if (watch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()))
} else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()))
    await Promise.all(contexts.map((ctx) => ctx.dispose()))
}
