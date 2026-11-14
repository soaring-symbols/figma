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
    tintSvg,
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
const monoInput = $<HTMLInputElement>('mono-color')
const primaryButton = $<HTMLButtonElement>('primary-color')

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

// A row of the list, for an airline (its codes and country) or an alliance
const ownerRow = (owner: MarkOwner) => {
    const thumb = thumbnailUrl(owner)
    const meta = isAirline(owner)
        ? [codesLabel(owner), owner.country].filter(Boolean).join(' · ')
        : allianceLabel(owner)
    const name = el('div', { className: 'airline-name' }, owner.name)
    // A disbanded alliance says so in its line already
    if (owner.defunct && isAirline(owner)) {
        name.append(el('span', { className: 'badge' }, 'Defunct'))
    }

    const row = el(
        'button',
        { className: 'airline', type: 'button' },
        thumb
            ? el('img', {
                  className: 'thumb',
                  src: thumb,
                  alt: '',
                  loading: 'lazy',
              })
            : el('span', { className: 'thumb' }),
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
    const img = el('img', { alt: '' })
    const label = el(
        'span',
        { className: 'secondary' },
        `${tile.type[0].toUpperCase()}${tile.type.slice(1)}${tile.mono ? ' · mono' : ''}`,
    )
    const button = el(
        'button',
        {
            className: 'tile',
            type: 'button',
            draggable: true,
            title: `Insert ${layerName(owner, tile)}`,
        },
        el('span', { className: 'tile-preview' }, img),
        label,
    )

    // The last mark built for this tile, so a drop can be sent at once
    let mark: MarkPayload | undefined
    const refresh = async () => {
        try {
            mark = await markFor(owner, tile)
            img.src = dataUrl(mark.svg)
        } catch {
            label.textContent = `${tile.variant}.svg couldn't be loaded`
        }
    }
    button.dataset.mono = String(tile.mono)
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
    $('detail-name').textContent = owner.name
    $('detail-meta').textContent = detailMeta(owner)

    // The airline's or alliance's one primary color
    // (branding.primary_color), not its full palette, so the button says
    // "primary color"
    const primary = owner.branding?.primary_color
    primaryButton.hidden = !primary
    primaryButton.style.color = primary ?? ''

    const grid = (tiles: AssetTile[]) =>
        el(
            'div',
            { className: 'tiles' },
            ...tiles.map((tile) => tileButton(owner, tile)),
        )
    const tiles = getAssetTiles(owner)
    // With older marks, the current ones get a heading of their own above
    // them, newest first; without, the grid stays as it was
    const history = earlierMarks(owner)
    content.replaceChildren(
        ...(!tiles.length
            ? [
                  el(
                      'div',
                      { className: 'empty' },
                      `No marks for ${owner.name} yet.`,
                  ),
              ]
            : history.length
              ? [
                    el('h2', { className: 'section-title' }, 'Current'),
                    grid(tiles),
                    ...history.flatMap((mark) => [
                        el(
                            'h2',
                            { className: 'section-title' },
                            markTitle(owner, mark),
                        ),
                        grid(getAssetTiles(owner, mark)),
                    ]),
                ]
              : [grid(tiles)]),
    )
    content.scrollTop = 0
    $('back').focus()
}

const showList = () => {
    current = undefined
    detailView.hidden = true
    listView.hidden = false
    renderList()
    search.focus()
    search.select()
}

/* Settings */

const saveSettings = (next: Partial<Settings>) => {
    settings = { ...settings, ...next }
    send({ type: 'settings', settings })
}

const applySettings = () => {
    sizeSelect.value = String(settings.size)
    monoInput.value = settings.monoColor
}

sizeSelect.append(
    ...SIZES.map((size) =>
        el('option', { value: String(size) }, `${size} × ${size}`),
    ),
)
sizeSelect.addEventListener('change', () =>
    saveSettings({ size: Number(sizeSelect.value) }),
)
monoInput.addEventListener('input', () => {
    settings.monoColor = monoInput.value
    refreshMonoTiles()
})
monoInput.addEventListener('change', () =>
    saveSettings({ monoColor: monoInput.value }),
)
primaryButton.addEventListener('click', () => {
    const primary = current?.branding?.primary_color
    if (!primary) return
    monoInput.value = primary
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
