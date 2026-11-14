import type {
    Airline,
    Alliance,
    AssetType,
    HistoricalMarks,
} from 'soaring-symbols'

// The npm release line the plugin reads, served by jsDelivr. Every 0.4.x
// release (new airlines, fixed SVGs) arrives without a plugin update; a
// breaking 0.5.0 never does. Move this and the soaring-symbols dependency to
// the next line in the same plugin update.
export const DATA_LINE = '0.4'

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

// alliances.json from the same release as the airlines
export const alliancesUrl = (release?: string): string =>
    `${cdnBase(isLineRelease(release) ? release : DATA_LINE)}/alliances.json`

const ASSET_TYPES: AssetType[] = ['logo', 'icon', 'tail']
// Alliances have no tail, and show their symbol far more often than a logo
// with their name, so the icon comes first
const ALLIANCE_TYPES = ['icon', 'logo'] as const

// An airline or an alliance: both name their marks the same way, under
// assets/<slug>/ or alliances/<slug>/
export type MarkOwner = Airline | Alliance

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

// An airline, rather than an alliance: only airlines have a country. (The
// check goes this way round because an airline has every field an alliance
// has, so `owner is Alliance` would leave nothing for the other branch.)
export const isAirline = (owner: MarkOwner): owner is Airline =>
    'country' in owner

// Where an airline's or an alliance's files live in the package
const markRoot = (owner: MarkOwner) =>
    isAirline(owner) ? 'assets' : 'alliances'

// A file of the current marks, or with `mark` of the older ones introduced
// in mark.since
export const assetUrl = (
    owner: MarkOwner,
    variant: string,
    mark?: HistoricalMarks,
): string =>
    `${cdnBase(dataVersion)}/${markRoot(owner)}/${owner.slug}${mark ? `/history/${mark.since}` : ''}/${variant}.svg`

// Whether fetched JSON is a usable airline or alliance list: a non-empty
// array of entries that each have a name, a slug and assets (empty for an
// alliance without marks yet). Anything else falls back to the list bundled
// with the plugin.
const isEntryList = (data: unknown): boolean =>
    Array.isArray(data) &&
    data.length > 0 &&
    data.every(
        (a) =>
            typeof a?.slug === 'string' &&
            typeof a?.name === 'string' &&
            typeof a?.assets === 'object' &&
            a.assets !== null,
    )

export const isAirlineList = (data: unknown): data is Airline[] =>
    isEntryList(data)

export const isAllianceList = (data: unknown): data is Alliance[] =>
    isEntryList(data)

// How well a name matches a query, lower is better, or -1: names that start
// with the query, then any word that does, then a match anywhere
const nameRank = (name: string, q: string): number => {
    const lower = name.toLowerCase()
    if (lower.startsWith(q)) return 1
    if (lower.split(/[\s-]+/).some((word) => word.startsWith(q))) return 2

    return lower.includes(q) ? 3 : -1
}

// The entries a rank lets through, best first; active ones before defunct
// ones at each rank, then catalog order. An empty query keeps them all.
const rankEntries = <T extends { defunct?: boolean }>(
    entries: T[],
    query: string,
    rankOf: (entry: T, q: string) => number,
): T[] => {
    const q = query.trim().toLowerCase()

    return entries
        .map((entry, index) => ({
            entry,
            index,
            score: q ? rankOf(entry, q) : 0,
        }))
        .filter(({ score }) => score >= 0)
        .sort(
            (a, b) =>
                a.score - b.score ||
                Number(Boolean(a.entry.defunct)) -
                    Number(Boolean(b.entry.defunct)) ||
                a.index - b.index,
        )
        .map(({ entry }) => entry)
}

// How well an airline matches a query, lower is better, or -1 for no match.
// An exact IATA or ICAO code wins, then names that start with the query, then
// a match anywhere in the name, slug or callsign, then a former name of a
// renamed airline (T'way Air for Trinity Airways).
const rank = (airline: Airline, q: string): number => {
    const code = q.toUpperCase()
    if (airline.iata === code || airline.icao === code) return 0
    const byName = nameRank(airline.name, q)
    if (byName > 0) return byName
    const rest = [airline.slug, airline.callsign?.toLowerCase() ?? '']
    if (rest.some((field) => field.includes(q))) return 3
    const former = (airline.former ?? []).flatMap((item) =>
        item.name ? [item.name] : [],
    )
    if (former.some((old) => old.toLowerCase().includes(q))) return 4

    return -1
}

// Airlines matching a query by name, IATA or ICAO code, slug, callsign or
// former name,
// best match first; active airlines come before defunct ones at each rank.
// An empty query lists every airline in catalog order, defunct ones last.
export const searchAirlines = (airlines: Airline[], query: string): Airline[] =>
    rankEntries(airlines, query, rank)

// The alliances that have marks and match a query by name or slug, best
// match first (names that start with it, then any word, then anywhere),
// active ones before disbanded ones. An alliance without marks yet has
// nothing to insert, so it is left out. An empty query lists them all.
export const searchAlliances = (
    alliances: Alliance[],
    query: string,
): Alliance[] =>
    rankEntries(alliances.filter(hasMarks), query, (alliance, q) => {
        const byName = nameRank(alliance.name, q)

        return byName > 0 || !alliance.slug.includes(q) ? byName : 3
    })

// Whether an airline or alliance ships any mark at all
export const hasMarks = (owner: MarkOwner): boolean =>
    Object.values(owner.assets).some(Boolean)

// A tile for each file the airline or alliance ships: the color version
// and, when it exists, the -mono one (always there for single-color marks).
// With `mark`, the files of that older set from its history.
export const getAssetTiles = (
    owner: MarkOwner,
    mark?: HistoricalMarks,
): AssetTile[] =>
    (isAirline(owner) ? ASSET_TYPES : ALLIANCE_TYPES).flatMap((type) => {
        // An alliance's map has no tail, which it never asks for
        const assets: Airline['assets'] = mark?.assets ?? owner.assets
        const info = assets[type]
        if (!info) return []

        const tile = (variant: string, mono: boolean): AssetTile => ({
            type,
            variant,
            url: assetUrl(owner, variant, mark),
            mono,
            ...(mark && { since: mark.since }),
        })
        const tiles: AssetTile[] = []
        if (info.color) tiles.push(tile(type, false))
        if (info.mono) tiles.push(tile(`${type}-mono`, true))

        return tiles
    })

// The marks the airline or alliance used before its current ones, newest
// first. Each was used from its `since` until the next one's, the newest
// until today's. Data from before 0.2.4 has no history.
export const earlierMarks = (owner: MarkOwner): HistoricalMarks[] =>
    [...(owner.history ?? [])].reverse()

// The title of an older mark: the years it was used ("1984–2025"), after the
// name on it when that was a former name ("T'way Air · 2010–2026"). Releases
// without `until` and `name` (0.2.4 and before) give the year it came in.
export const markTitle = (owner: MarkOwner, mark: HistoricalMarks): string => {
    const years = mark.until
        ? `${mark.since}–${mark.until}`
        : `Introduced ${mark.since}`

    return mark.name && mark.name !== owner.name
        ? `${mark.name} · ${years}`
        : years
}

// The file to show next to an airline or alliance in the list: its icon,
// else its logo, else its tail, in color when there is a color version
export const thumbnailUrl = (owner: MarkOwner): string | undefined => {
    const assets: Airline['assets'] = owner.assets
    for (const type of ['icon', 'logo', 'tail'] as const) {
        const info = assets[type]
        if (info) return assetUrl(owner, info.color ? type : `${type}-mono`)
    }

    return undefined
}

const HEX = /^#[0-9a-f]{6}$/i

// A mono SVG painted with a color instead of currentColor, which Figma would
// otherwise turn into black. Anything but a six-digit hex color is ignored.
export const tintSvg = (svg: string, color: string): string =>
    HEX.test(color) ? svg.replaceAll(/currentColor/gi, color) : svg

// The layer name of an inserted mark, e.g. "Vietnam Airlines logo (mono)",
// "SkyTeam icon", or for an older one "Sun PhuQuoc Airways logo (2025, mono)"
export const layerName = (owner: MarkOwner, tile: AssetTile): string => {
    const notes = [tile.since, tile.mono && 'mono'].filter(Boolean)

    return `${owner.name} ${tile.type}${notes.length ? ` (${notes.join(', ')})` : ''}`
}

export const codesLabel = (airline: Airline): string =>
    [airline.iata, airline.icao].filter(Boolean).join(' · ')

// "Airline alliance · 1997", or "Airline alliance · 2016–2023 · Disbanded"
// for one that was dissolved: the line under an alliance's name
export const allianceLabel = (alliance: Alliance): string => {
    const { founded, ceased, defunct } = alliance
    const years = ceased
        ? `${founded ?? '?'}–${ceased}`
        : founded
          ? String(founded)
          : ''

    return ['Airline alliance', years, defunct && 'Disbanded']
        .filter(Boolean)
        .join(' · ')
}
