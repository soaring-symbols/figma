// The plugin's UI: search airlines, pick a mark, then click it to insert it
// or drag it onto the canvas. The main thread (code.ts) does the inserting.
import { type Airline, listAirlines } from 'soaring-symbols'
import {
    airlinesUrl,
    type AssetTile,
    codesLabel,
    earlierMarks,
    markTitle,
    getAssetTiles,
    isAirlineList,
    isLineRelease,
    layerName,
    RESOLVE_URL,
    searchAirlines,
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
let notice = ''
let settings: Settings = { ...DEFAULT_SETTINGS }
let current: Airline | undefined
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

// The latest airlines of the plugin's release line, read from that exact
// release, or the list bundled with the plugin when that can't be loaded or
// isn't a usable list
const loadAirlines = async (): Promise<void> => {
    try {
        const release = await resolveRelease()
        const res = await fetch(airlinesUrl(release))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: unknown = await res.json()
        if (!isAirlineList(data)) throw new Error('unexpected airlines.json')
        airlines = data
        setDataVersion(release)
    } catch (error) {
        airlines = listAirlines()
        // The bundled list's files are in every release of the line
        setDataVersion()
        notice = `Showing the airlines bundled with the plugin; couldn't load the latest list (${String(error)}).`
    }
}

/* List view */

const airlineRow = (airline: Airline) => {
    const thumb = thumbnailUrl(airline)
    const meta = [codesLabel(airline), airline.country]
        .filter(Boolean)
        .join(' · ')
    const name = el('div', { className: 'airline-name' }, airline.name)
    if (airline.defunct) {
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
    row.addEventListener('click', () => showAirline(airline))

    return row
}

const renderList = () => {
    const results = searchAirlines(airlines, search.value)
    content.replaceChildren()
    if (notice) content.append(el('div', { className: 'notice' }, notice))
    if (!airlines.length) {
        content.append(el('div', { className: 'empty' }, 'Loading airlines…'))

        return
    }
    if (!results.length) {
        content.append(
            el(
                'div',
                { className: 'empty' },
                `No airline matches “${search.value.trim()}”.`,
            ),
        )

        return
    }
    content.append(...results.map(airlineRow))
}

/* Detail view */

const markFor = async (
    airline: Airline,
    tile: AssetTile,
): Promise<MarkPayload> => {
    const source = await fetchSvg(tile.url)

    return {
        svg: tile.mono ? tintSvg(source, settings.monoColor) : source,
        name: layerName(airline, tile),
        size: settings.size,
    }
}

const tileButton = (airline: Airline, tile: AssetTile) => {
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
            title: `Insert ${layerName(airline, tile)}`,
        },
        el('span', { className: 'tile-preview' }, img),
        label,
    )

    // The last mark built for this tile, so a drop can be sent at once
    let mark: MarkPayload | undefined
    const refresh = async () => {
        try {
            mark = await markFor(airline, tile)
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
            send({ type: 'insert', mark: await markFor(airline, tile) })
        } catch (error) {
            send({
                type: 'notify',
                message: `Couldn't load ${tile.variant}.svg: ${String(error)}`,
                error: true,
            })
        }
    })
    button.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/plain', layerName(airline, tile))
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

const showAirline = (airline: Airline) => {
    current = airline
    listView.hidden = true
    detailView.hidden = false
    $('detail-name').textContent = airline.name
    $('detail-meta').textContent = [
        codesLabel(airline),
        airline.alliance,
        airline.defunct
            ? `Defunct${airline.ceased ? ` ${airline.ceased}` : ''}`
            : '',
    ]
        .filter(Boolean)
        .join(' · ')

    // The airline's one primary color (branding.primary_color), not its
    // full palette, so the button says "primary color"
    const primary = airline.branding?.primary_color
    primaryButton.hidden = !primary
    primaryButton.style.color = primary ?? ''

    const grid = (tiles: AssetTile[]) =>
        el(
            'div',
            { className: 'tiles' },
            ...tiles.map((tile) => tileButton(airline, tile)),
        )
    const tiles = getAssetTiles(airline)
    // With older marks, the current ones get a heading of their own above
    // them, newest first; without, the grid stays as it was
    const history = earlierMarks(airline)
    content.replaceChildren(
        ...(!tiles.length
            ? [
                  el(
                      'div',
                      { className: 'empty' },
                      'No marks for this airline yet.',
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
                            markTitle(airline, mark),
                        ),
                        grid(getAssetTiles(airline, mark)),
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
    const [first] = searchAirlines(airlines, search.value)
    if (first) showAirline(first)
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
