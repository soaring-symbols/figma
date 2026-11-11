import type { Airline, AssetType, HistoricalMarks } from 'soaring-symbols'

// The npm release line the plugin reads, served by jsDelivr. Every 0.3.x
// release (new airlines, fixed SVGs) arrives without a plugin update; a
// breaking 0.4.0 never does. Move this and the soaring-symbols dependency to
// the next line in the same plugin update.
export const DATA_LINE = '0.3'

// Asks jsDelivr which release the line points at now, e.g. "0.2.4"
export const RESOLVE_URL = `https://data.jsdelivr.com/v1/packages/npm/soaring-symbols/resolved?specifier=${DATA_LINE}`

// An exact release in the line, e.g. "0.2.4"
export const isLineRelease = (version: unknown): version is string =>
    typeof version === 'string' &&
    version.startsWith(`${DATA_LINE}.`) &&
    /^\d+\.\d+\.\d+$/.test(version)

// The release the airline list came from. Files load from that exact
// release, not from the line: a line URL keeps its address when a release
// changes the file behind it (a new logo), and the browser cache in Figma,
// which jsDelivr lets keep a file for 7 days, would go on showing the old
// one. The line is the fallback when the release isn't known.
let dataVersion = DATA_LINE

export const setDataVersion = (version?: string): void => {
    dataVersion = isLineRelease(version) ? version : DATA_LINE
}

export const cdnBase = (version: string): string =>
    `https://cdn.jsdelivr.net/npm/soaring-symbols@${version}/dist`

// airlines.json from `release`, or from the line when it's unknown
export const airlinesUrl = (release?: string): string =>
    `${cdnBase(isLineRelease(release) ? release : DATA_LINE)}/airlines.json`

const ASSET_TYPES: AssetType[] = ['logo', 'icon', 'tail']

export interface AssetTile {
    type: AssetType
    /** File name without extension, e.g. "logo" or "logo-mono". */
    variant: string
    url: string
    /** Drawn in currentColor, which the plugin replaces with a chosen color. */
    mono: boolean
    /** For an older mark from the airline's history, the year it was introduced. */
    since?: number
}

// A file of the current marks, or with `mark` of the older ones introduced
// in mark.since
export const assetUrl = (
    airline: Airline,
    variant: string,
    mark?: HistoricalMarks,
): string =>
    `${cdnBase(dataVersion)}/assets/${airline.slug}${mark ? `/history/${mark.since}` : ''}/${variant}.svg`

// Whether fetched JSON is a usable airline list: a non-empty array of
// airlines that each have a slug and assets. Anything else falls back to
// the list bundled with the plugin.
export const isAirlineList = (data: unknown): data is Airline[] =>
    Array.isArray(data) &&
    data.length > 0 &&
    data.every(
        (a) =>
            typeof a?.slug === 'string' &&
            typeof a?.name === 'string' &&
            typeof a?.assets === 'object' &&
            a.assets !== null,
    )

// How well an airline matches a query, lower is better, or -1 for no match.
// An exact IATA or ICAO code wins, then names that start with the query, then
// a match anywhere in the name, slug or callsign, then a former name of a
// renamed airline (T'way Air for Trinity Airways).
const rank = (airline: Airline, q: string): number => {
    const code = q.toUpperCase()
    if (airline.iata === code || airline.icao === code) return 0
    const name = airline.name.toLowerCase()
    if (name.startsWith(q)) return 1
    if (name.split(/[\s-]+/).some((word) => word.startsWith(q))) return 2
    const rest = [name, airline.slug, airline.callsign?.toLowerCase() ?? '']
    if (rest.some((field) => field.includes(q))) return 3
    const former = airline.previous_names ?? []
    if (former.some((old) => old.toLowerCase().includes(q))) return 4

    return -1
}

// Airlines matching a query by name, IATA or ICAO code, slug, callsign or
// former name,
// best match first; active airlines come before defunct ones at each rank.
// An empty query lists every airline in catalog order, defunct ones last.
export const searchAirlines = (
    airlines: Airline[],
    query: string,
): Airline[] => {
    const q = query.trim().toLowerCase()
    const scored = airlines
        .map((airline, index) => ({
            airline,
            index,
            score: q ? rank(airline, q) : 0,
        }))
        .filter(({ score }) => score >= 0)

    scored.sort(
        (a, b) =>
            a.score - b.score ||
            Number(Boolean(a.airline.defunct)) -
                Number(Boolean(b.airline.defunct)) ||
            a.index - b.index,
    )

    return scored.map(({ airline }) => airline)
}

// A tile for each file the airline ships: the color version and, when it
// exists, the -mono one (always there for single-color marks). With `mark`,
// the files of that older set from the airline's history.
export const getAssetTiles = (
    airline: Airline,
    mark?: HistoricalMarks,
): AssetTile[] =>
    ASSET_TYPES.flatMap((type) => {
        const info = (mark?.assets ?? airline.assets)[type]
        if (!info) return []

        const tile = (variant: string, mono: boolean): AssetTile => ({
            type,
            variant,
            url: assetUrl(airline, variant, mark),
            mono,
            ...(mark && { since: mark.since }),
        })
        const tiles: AssetTile[] = []
        if (info.color) tiles.push(tile(type, false))
        if (info.mono) tiles.push(tile(`${type}-mono`, true))

        return tiles
    })

// The marks the airline used before its current ones, newest first. Each
// was used from its `since` until the next one's, the newest until today's.
// Data from before 0.2.4 has no history.
export const earlierMarks = (airline: Airline): HistoricalMarks[] =>
    [...(airline.history ?? [])].reverse()

// The title of an older mark: the years it was used ("1984–2025"), after the
// name on it when that was a former name ("T'way Air · 2010–2026"). Releases
// without `until` and `name` (0.2.4 and before) give the year it came in.
export const markTitle = (airline: Airline, mark: HistoricalMarks): string => {
    const years = mark.until
        ? `${mark.since}–${mark.until}`
        : `Introduced ${mark.since}`

    return mark.name && mark.name !== airline.name
        ? `${mark.name} · ${years}`
        : years
}

// The file to show next to an airline in the list: its icon, else its logo,
// else its tail, in color when there is a color version
export const thumbnailUrl = (airline: Airline): string | undefined => {
    for (const type of ['icon', 'logo', 'tail'] as const) {
        const info = airline.assets[type]
        if (info) return assetUrl(airline, info.color ? type : `${type}-mono`)
    }

    return undefined
}

const HEX = /^#[0-9a-f]{6}$/i

// A mono SVG painted with a color instead of currentColor, which Figma would
// otherwise turn into black. Anything but a six-digit hex color is ignored.
export const tintSvg = (svg: string, color: string): string =>
    HEX.test(color) ? svg.replaceAll(/currentColor/gi, color) : svg

// The layer name of an inserted mark, e.g. "Vietnam Airlines logo (mono)",
// or for an older one "Sun PhuQuoc Airways logo (2025, mono)"
export const layerName = (airline: Airline, tile: AssetTile): string => {
    const notes = [tile.since, tile.mono && 'mono'].filter(Boolean)

    return `${airline.name} ${tile.type}${notes.length ? ` (${notes.join(', ')})` : ''}`
}

export const codesLabel = (airline: Airline): string =>
    [airline.iata, airline.icao].filter(Boolean).join(' · ')
