// The plugin's UI: search airlines and alliances, pick a mark, then click
// it to insert it or drag it onto the canvas. The main thread (code.ts) does
// the inserting.
import {
    type Airline,
    type Alliance,
    listAirlines,
    listAlliances,
} from 'soaring-symbols'
import {
    airlinesUrl,
    allianceLabel,
    alliancesUrl,
    type AssetTile,
    codesLabel,
    earlierMarks,
    markTitle,
    getAssetTiles,
    isAirlineList,
    isAirline,
    isAllianceList,
    isLineRelease,
    layerName,
    type MarkOwner,
    RESOLVE_URL,
    searchAirlines,
    searchAlliances,
    setDataVersion,
    thumbnailUrl,
    darkThumbnailUrl,
    tintSvg,
    typeLabel,
} from './data'
import {
    DEFAULT_SETTINGS,
    type MainMessage,
    type MarkPayload,
    SIZES,
    type Settings,
    type UIMessage,
} from './messages'

const $ = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T

const listView = $('list-view')
const detailView = $('detail-view')
const content = $('content')
const search = $<HTMLInputElement>('search')
const sizeSelect = $<HTMLSelectElement>('size')

let airlines: Airline[] = []
let alliances: Alliance[] = []
let notice = ''
let settings: Settings = { ...DEFAULT_SETTINGS }
let current: MarkOwner | undefined
// SVG sources by URL, so a tile can be inserted or dropped right away
const svgCache = new Map<string, Promise<string>>()

const send = (message: UIMessage) =>
    parent.postMessage({ pluginMessage: message }, '*')

const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Partial<HTMLElementTagNameMap[K]> = {},
    ...children: (Node | string)[]
) => {
    const node = Object.assign(document.createElement(tag), props)
    node.append(...children)

    return node
}

// The size and mono color row moves into the detail view's marks while an
// airline is shown and leaves the document with them, so it and its parts
// are found once here, never looked up by id later
const controls = $('controls')
// The mono color controls beside the size: a color picker, and a button
// that paints the mono marks in the airline's primary color
const monoField = $('mono-field')
const monoInput = $<HTMLInputElement>('mono')
const primaryButton = $<HTMLButtonElement>('primary')
const primarySwatch = $('primary-swatch')
const monoValue = $('mono-value')
// The footer's tip for each view, of which showHint shows one
const listHint = $('list-hint')
const detailHint = $('detail-hint')
const showHint = (view: 'list' | 'detail') => {
    listHint.hidden = view !== 'list'
    detailHint.hidden = view !== 'detail'
}

const fetchSvg = (url: string): Promise<string> => {
    let svg = svgCache.get(url)
    if (!svg) {
        svg = fetch(url).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            return res.text()
        })
        // Let a failed file be tried again next time
        svg.catch(() => svgCache.delete(url))
        svgCache.set(url, svg)
    }

    return svg
}

// An image that fades in once it has loaded, instead of popping in
const fadeImg = (props: Partial<HTMLImageElement>) => {
    const img = el('img', props)
    img.classList.add('fade')
    img.addEventListener('load', () => img.classList.add('loaded'))

    return img
}

const dataUrl = (svg: string) =>
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

// The release the line points at now, or undefined when jsDelivr can't say
const resolveRelease = async (): Promise<string | undefined> => {
    try {
        const res = await fetch(RESOLVE_URL)
        if (!res.ok) return undefined
        const { version } = (await res.json()) as { version?: unknown }

        return isLineRelease(version) ? version : undefined
    } catch {
        return undefined
    }
}

// The alliances of the same release as the airlines, or the ones bundled
// with the plugin, whose files every release of the line has
const fetchAlliances = async (release?: string): Promise<Alliance[]> => {
    try {
        const res = await fetch(alliancesUrl(release))
        if (!res.ok) return listAlliances()
        const data: unknown = await res.json()

        return isAllianceList(data) ? data : listAlliances()
    } catch {
        return listAlliances()
    }
}

// The latest airlines and alliances of the plugin's release line, read from
// that exact release, or the lists bundled with the plugin when the airlines
// can't be loaded or aren't a usable list
const loadAirlines = async (): Promise<void> => {
    try {
        const release = await resolveRelease()
        const [res, latestAlliances] = await Promise.all([
            fetch(airlinesUrl(release)),
            fetchAlliances(release),
        ])
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: unknown = await res.json()
        if (!isAirlineList(data)) throw new Error('unexpected airlines.json')
        airlines = data
        alliances = latestAlliances
        setDataVersion(release)
    } catch (error) {
        airlines = listAirlines()
        alliances = listAlliances()
        // The bundled list's files are in every release of the line
        setDataVersion()
        notice = `Showing the airlines bundled with the plugin; couldn't load the latest list (${String(error)}).`
    }
}

/* List view */

// The mark beside a row of the list, and its version for dark backgrounds
// when it has one: CSS shows the one for the theme, and the hidden one,
// being lazy, isn't loaded until a theme change shows it
const thumbNodes = (owner: MarkOwner): Node[] => {
    const light = thumbnailUrl(owner)
    if (!light) return [el('span', { className: 'thumb' })]
    const dark = darkThumbnailUrl(owner)
    const img = (src: string, className: string) =>
        fadeImg({ className, src, alt: '', loading: 'lazy' })

    return dark
        ? [img(light, 'thumb thumb-light'), img(dark, 'thumb thumb-dark')]
        : [img(light, 'thumb')]
}

// A row of the list, for an airline (its codes and country) or an alliance
const ownerRow = (owner: MarkOwner) => {
    const meta = isAirline(owner)
        ? [codesLabel(owner), owner.country].filter(Boolean).join(' · ')
        : allianceLabel(owner)
    const name = el('div', { className: 'airline-name' }, owner.name)
    // A disbanded alliance says so in its line already
    if (isAirline(owner) && owner.cargo) {
        name.append(el('span', { className: 'badge' }, 'Cargo'))
    }
    if (owner.defunct && isAirline(owner)) {
        name.append(el('span', { className: 'badge' }, 'Defunct'))
    }

    const row = el(
        'button',
        { className: 'airline', type: 'button' },
        ...thumbNodes(owner),
        el(
            'span',
            { className: 'airline-text' },
            name,
            el('div', { className: 'secondary' }, meta),
        ),
    )
    row.addEventListener('click', () => showOwner(owner))

    return row
}

// What the list shows for the search: alliances with marks that match, then
// airlines
const searchResults = () => ({
    alliances: searchAlliances(alliances, search.value),
    airlines: searchAirlines(airlines, search.value),
})

const renderList = () => {
    const { alliances: matchingAlliances, airlines: results } = searchResults()
    content.replaceChildren()
    if (notice) content.append(el('div', { className: 'notice' }, notice))
    if (!airlines.length) {
        content.append(el('div', { className: 'empty' }, 'Loading airlines…'))

        return
    }
    if (!results.length && !matchingAlliances.length) {
        content.append(
            el(
                'div',
                { className: 'empty' },
                `No airline or alliance matches “${search.value.trim()}”.`,
            ),
        )

        return
    }
    // Headings only when both kinds are listed
    if (matchingAlliances.length) {
        content.append(
            el('h2', { className: 'section-title' }, 'Alliances'),
            ...matchingAlliances.map(ownerRow),
        )
        if (results.length) {
            content.append(el('h2', { className: 'section-title' }, 'Airlines'))
        }
    }
    content.append(...results.map(ownerRow))
}

/* Detail view */

const capitalize = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`

// A 16 × 16 line icon from SVG path data
const icon = (paths: string) => {
    const span = el('span', { className: 'icon' })
    span.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${paths}</svg>`

    return span
}

// The detail view's columns: the color file, the mono one and the one for
// dark backgrounds, whose short title says the rest in its tooltip
const COLUMNS = [
    {
        key: 'color',
        title: 'Color',
        hint: "In the airline's colors",
        icon: '<path d="M8 1.75a6.25 6.25 0 0 0 0 12.5c.9 0 1.25-.6 1.25-1.2 0-.9-.75-1.1-.75-1.8 0-.6.5-1 1.1-1h1.4a3.25 3.25 0 0 0 3.25-3.25c0-2.9-2.8-5.25-6.25-5.25Z"/><circle cx="4.75" cy="7.5" r=".9" class="filled"/><circle cx="6.75" cy="4.75" r=".9" class="filled"/><circle cx="10" cy="4.75" r=".9" class="filled"/>',
        has: (tile: AssetTile) => !tile.mono && !tile.dark,
    },
    {
        key: 'mono',
        title: 'Mono',
        hint: 'In one color, picked beside the size',
        icon: '<circle cx="8" cy="8" r="6.25"/><path d="M8 1.75v12.5a6.25 6.25 0 0 0 0-12.5Z" class="filled"/>',
        has: (tile: AssetTile) => tile.mono,
    },
    {
        key: 'dark',
        title: 'Dark',
        hint: 'For dark backgrounds',
        icon: '<path d="M13.5 9.6A5.75 5.75 0 1 1 6.4 2.5a4.5 4.5 0 0 0 7.1 7.1Z"/>',
        has: (tile: AssetTile) => tile.dark,
    },
] as const

// What each kind of mark is, beside its name in the detail view
const TYPE_HINTS: Record<string, string> = {
    logo: 'Mark and name, side by side',
    'logo-stacked': 'Name under the mark',
    icon: 'The mark on its own',
    tail: 'As painted on the tail',
}

const markFor = async (
    owner: MarkOwner,
    tile: AssetTile,
): Promise<MarkPayload> => {
    const source = await fetchSvg(tile.url)

    return {
        svg: tile.mono ? tintSvg(source, settings.monoColor) : source,
        name: layerName(owner, tile),
        size: settings.size,
    }
}

const tileButton = (owner: MarkOwner, tile: AssetTile) => {
    const img = fadeImg({ alt: '' })
    const preview = el('span', { className: 'tile-preview' }, img)
    const button = el(
        'button',
        {
            className: 'tile',
            type: 'button',
            draggable: true,
            title: `Insert ${layerName(owner, tile)}`,
        },
        preview,
    )

    // The last mark built for this tile, so a drop can be sent at once
    let mark: MarkPayload | undefined
    const refresh = async () => {
        try {
            mark = await markFor(owner, tile)
            img.src = dataUrl(mark.svg)
        } catch {
            preview.replaceChildren(
                el(
                    'span',
                    { className: 'secondary' },
                    `${tile.variant}.svg couldn't be loaded`,
                ),
            )
        }
    }
    button.dataset.mono = String(tile.mono)
    button.dataset.dark = String(tile.dark)
    button.addEventListener('refresh', refresh)
    refresh()

    button.addEventListener('click', async () => {
        try {
            send({ type: 'insert', mark: await markFor(owner, tile) })
        } catch (error) {
            send({
                type: 'notify',
                message: `Couldn't load ${tile.variant}.svg: ${String(error)}`,
                error: true,
            })
        }
    })
    button.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/plain', layerName(owner, tile))
    })
    button.addEventListener('dragend', (event) => {
        // Dropped inside the plugin window, or before the SVG arrived
        if (event.view?.length === 0 || !mark) return
        parent.postMessage(
            {
                pluginDrop: {
                    clientX: event.clientX,
                    clientY: event.clientY,
                    items: [],
                    dropMetadata: { ...mark, size: settings.size },
                },
            },
            '*',
        )
    })

    return button
}

const refreshMonoTiles = () => {
    for (const tile of content.querySelectorAll<HTMLElement>(
        '.tile[data-mono="true"]',
    )) {
        tile.dispatchEvent(new Event('refresh'))
    }
}

// The line under the name in the detail view
const detailMeta = (owner: MarkOwner) =>
    isAirline(owner)
        ? [
              codesLabel(owner),
              owner.cargo ? 'Cargo' : '',
              owner.alliance,
              owner.defunct
                  ? `Defunct${owner.ceased ? ` ${owner.ceased}` : ''}`
                  : '',
          ]
              .filter(Boolean)
              .join(' · ')
        : allianceLabel(owner)

const showOwner = (owner: MarkOwner) => {
    current = owner
    listView.hidden = true
    detailView.hidden = false
    showHint('detail')
    $('detail-name').textContent = owner.name
    $('detail-meta').textContent = detailMeta(owner)

    // The airline's or alliance's one primary color
    // (branding.primary_color), not its full palette
    const primary = owner.branding?.primary_color
    primaryButton.hidden = !primary
    primarySwatch.style.background = primary ?? ''
    primaryButton.title = `Paint the mono marks in the primary color (${primary})`
    primaryButton.ariaLabel = primaryButton.title

    const history = earlierMarks(owner)
    const sets = [
        { title: 'Current', tiles: getAssetTiles(owner) },
        ...history.map((mark) => ({
            title: markTitle(owner, mark),
            tiles: getAssetTiles(owner, mark),
        })),
    ]
    if (!sets[0].tiles.length) {
        monoField.hidden = true
        content.replaceChildren(
            el(
                'div',
                { className: 'empty' },
                `No marks for ${owner.name} yet.`,
            ),
        )
        content.scrollTop = 0
        $('back').focus()

        return
    }

    // One column per kind of file any of the marks has, in the same place
    // on every row, so a row with no mono or dark version leaves a gap
    const all = sets.flatMap((set) => set.tiles)
    const columns = COLUMNS.filter((column) => all.some(column.has))
    const row = (...cells: Node[]) => {
        const node = el('div', { className: 'tiles' }, ...cells)
        node.style.gridTemplateColumns = `repeat(${columns.length}, 1fr)`

        return node
    }
    // The mono color only matters when there are mono marks
    monoField.hidden = !columns.some((column) => column.key === 'mono')
    const heading = row(
        ...columns.map((column) =>
            el(
                'div',
                { className: 'column-title', title: column.hint },
                icon(column.icon),
                el('span', {}, column.title),
            ),
        ),
    )
    heading.classList.add('column-titles')
    // The column names, then the size and mono color, stay in view while
    // the marks scroll
    const head = el('div', { className: 'detail-head' }, heading, controls)

    // Each set of marks (the current ones, then older ones newest first)
    // has a row per mark type; the set's title only when there is history
    content.replaceChildren(
        head,
        ...sets.flatMap((set) => [
            ...(history.length
                ? [el('h2', { className: 'section-title' }, set.title)]
                : []),
            ...[...new Set(set.tiles.map((tile) => tile.type))].flatMap(
                (type) => {
                    const tiles = set.tiles.filter((tile) => tile.type === type)

                    return [
                        el(
                            'div',
                            { className: 'type-title' },
                            el('h3', {}, capitalize(typeLabel(type))),
                            el(
                                'span',
                                { className: 'secondary' },
                                TYPE_HINTS[type] ?? '',
                            ),
                        ),
                        row(
                            ...columns.map((column) => {
                                const tile = tiles.find(column.has)

                                return tile
                                    ? tileButton(owner, tile)
                                    : el('span', { className: 'tile-missing' })
                            }),
                        ),
                    ]
                },
            ),
        ]),
    )
    content.scrollTop = 0
    $('back').focus()
}

const showList = () => {
    current = undefined
    detailView.hidden = true
    listView.hidden = false
    showHint('list')
    renderList()
    search.focus()
    search.select()
}

/* Settings */

const saveSettings = (next: Partial<Settings>) => {
    settings = { ...settings, ...next }
    send({ type: 'settings', settings })
}

// The picker's swatch, and its hex beside it
const showMono = (color: string) => {
    monoInput.value = color
    monoValue.textContent = color.toUpperCase()
}

const applySettings = () => {
    sizeSelect.value = String(settings.size)
    showMono(settings.monoColor)
}

sizeSelect.append(
    ...SIZES.map((size) => el('option', { value: String(size) }, `${size} px`)),
)
sizeSelect.addEventListener('change', () =>
    saveSettings({ size: Number(sizeSelect.value) }),
)
monoInput.addEventListener('input', () => {
    settings.monoColor = monoInput.value
    showMono(monoInput.value)
    refreshMonoTiles()
})
monoInput.addEventListener('change', () =>
    saveSettings({ monoColor: monoInput.value }),
)
primaryButton.addEventListener('click', () => {
    const primary = current?.branding?.primary_color
    if (!primary) return
    showMono(primary)
    saveSettings({ monoColor: primary })
    refreshMonoTiles()
})

/* Events */

search.addEventListener('input', renderList)
search.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    // Otherwise the same key press clicks the back button, which takes focus
    event.preventDefault()
    const found = searchResults()
    const first: MarkOwner | undefined = found.alliances[0] ?? found.airlines[0]
    if (first) showOwner(first)
})
$('back').addEventListener('click', showList)
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && current) showList()
})

onmessage = (event: MessageEvent<{ pluginMessage?: MainMessage }>) => {
    const message = event.data.pluginMessage
    if (message?.type === 'init') {
        settings = { ...DEFAULT_SETTINGS, ...message.settings }
        applySettings()
        if (current) refreshMonoTiles()
    }
}

applySettings()
renderList()
loadAirlines().then(() => {
    if (!current) renderList()
})
