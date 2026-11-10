import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listAirlines, type Airline } from 'soaring-symbols'
import {
    airlinesUrl,
    assetUrl,
    cdnBase,
    getAssetTiles,
    isAirlineList,
    isLineRelease,
    layerName,
    searchAirlines,
    setDataVersion,
    thumbnailUrl,
    tintSvg,
} from '../src/data.ts'

const CDN = cdnBase('0.2')
const airlines = listAirlines()
const names = (list: Airline[]) => list.map((a) => a.name)

const fake = (overrides: Partial<Airline>): Airline => ({
    name: 'Test Air',
    iata: 'TT',
    icao: 'TST',
    country: 'VN',
    slug: 'test-air',
    assets: {},
    ...overrides,
})

describe('searchAirlines', () => {
    it('lists every airline for an empty query, defunct ones last', () => {
        const results = searchAirlines(airlines, '  ')
        assert.equal(results.length, airlines.length)
        const firstDefunct = results.findIndex((a) => a.defunct)
        if (firstDefunct >= 0) {
            assert.ok(results.slice(firstDefunct).every((a) => a.defunct))
        }
    })

    it('puts an exact IATA or ICAO code first, in any case', () => {
        assert.equal(searchAirlines(airlines, 'vn')[0].name, 'Vietnam Airlines')
        assert.equal(
            searchAirlines(airlines, 'HVN')[0].name,
            'Vietnam Airlines',
        )
    })

    it('ranks names that start with the query before other matches', () => {
        const list = [
            fake({ name: 'Royal Air', slug: 'royal-air', iata: 'R1' }),
            fake({ name: 'Air Example', slug: 'air-example', iata: 'A1' }),
            fake({ name: 'Fairways', slug: 'fairways', iata: 'F1' }),
        ]
        assert.deepEqual(names(searchAirlines(list, 'air')), [
            'Air Example',
            'Royal Air',
            'Fairways',
        ])
    })

    it('matches the callsign and slug', () => {
        const list = [fake({ callsign: 'SKY HOPPER' })]
        assert.equal(searchAirlines(list, 'hopper').length, 1)
        assert.equal(searchAirlines(list, 'test-air').length, 1)
        assert.equal(searchAirlines(list, 'nothing').length, 0)
    })

    it('puts an active airline before a defunct one at the same rank', () => {
        const list = [
            fake({ name: 'Old Air', defunct: true }),
            fake({ name: 'New Air', slug: 'new-air' }),
        ]
        assert.deepEqual(names(searchAirlines(list, 'TT')), [
            'New Air',
            'Old Air',
        ])
    })
})

describe('getAssetTiles', () => {
    it('returns color and mono tiles in logo, icon, tail order', () => {
        const airline = fake({
            assets: {
                tail: { color: true, mono: false, colors: ['#ff0000'] },
                icon: { color: false, mono: true, colors: [] },
                logo: { color: true, mono: true, colors: ['#000000'] },
            },
        })
        assert.deepEqual(
            getAssetTiles(airline).map((t) => t.variant),
            ['logo', 'logo-mono', 'icon-mono', 'tail'],
        )
        assert.equal(
            getAssetTiles(airline)[1].url,
            `${CDN}/assets/test-air/logo-mono.svg`,
        )
    })

    it('gives every bundled airline at least one tile', () => {
        for (const airline of airlines) {
            assert.ok(getAssetTiles(airline).length > 0, airline.name)
        }
    })
})

describe('thumbnailUrl', () => {
    it('prefers the icon, then the logo, in color when it can', () => {
        const airline = fake({
            assets: {
                logo: { color: true, mono: true, colors: [] },
                icon: { color: false, mono: true, colors: [] },
            },
        })
        assert.equal(thumbnailUrl(airline), assetUrl(airline, 'icon-mono'))
        assert.equal(thumbnailUrl(fake({})), undefined)
    })
})

describe('tintSvg', () => {
    const svg = '<svg fill="currentColor"><path stroke="currentcolor"/></svg>'

    it('replaces currentColor with the color', () => {
        assert.equal(
            tintSvg(svg, '#d99e09'),
            '<svg fill="#d99e09"><path stroke="#d99e09"/></svg>',
        )
    })

    it('leaves the SVG alone for anything but a six-digit hex color', () => {
        assert.equal(tintSvg(svg, 'red'), svg)
        assert.equal(tintSvg(svg, '#fff" onload="x'), svg)
    })
})

describe('isAirlineList', () => {
    it('accepts the bundled list and rejects anything else', () => {
        assert.ok(isAirlineList(airlines))
        assert.ok(!isAirlineList([]))
        assert.ok(!isAirlineList({}))
        assert.ok(!isAirlineList([{ slug: 'x' }]))
    })
})

describe('layerName', () => {
    it('names the airline, the type and a mono variant', () => {
        const airline = fake({})
        const [logo, mono] = getAssetTiles(
            fake({ assets: { logo: { color: true, mono: true, colors: [] } } }),
        )
        assert.equal(layerName(airline, logo), 'Test Air logo')
        assert.equal(layerName(airline, mono), 'Test Air logo (mono)')
    })
})

describe('exact release URLs', () => {
    const cdn = 'https://cdn.jsdelivr.net/npm/soaring-symbols'
    const air = fake({
        assets: { logo: { color: true, mono: false, colors: [] } },
    })

    it('accepts only exact releases of the line', () => {
        assert.equal(isLineRelease('0.2.4'), true)
        for (const version of [
            '0.2',
            '0.3.0',
            '0.2.4-beta',
            '10.2.4',
            undefined,
            24,
        ]) {
            assert.equal(isLineRelease(version), false, String(version))
        }
    })

    it("loads airlines.json from the release, or the line when it's unknown", () => {
        assert.equal(airlinesUrl('0.2.4'), `${cdn}@0.2.4/dist/airlines.json`)
        assert.equal(airlinesUrl(undefined), `${cdn}@0.2/dist/airlines.json`)
    })

    it('loads files from the release the list came from', () => {
        setDataVersion('0.2.4')
        assert.equal(
            assetUrl(air, 'logo'),
            `${cdn}@0.2.4/dist/assets/test-air/logo.svg`,
        )
        setDataVersion('0.3.0')
        assert.equal(
            assetUrl(air, 'logo'),
            `${cdn}@0.2/dist/assets/test-air/logo.svg`,
        )
        setDataVersion()
        assert.equal(
            assetUrl(air, 'logo'),
            `${cdn}@0.2/dist/assets/test-air/logo.svg`,
        )
    })
})
