// Messages between the plugin's UI (ui.ts) and its main thread (code.ts)

export interface Settings {
    /** Width and height of an inserted mark, in pixels. */
    size: number
    /** Six-digit hex color that mono marks are painted with. */
    monoColor: string
}

export const DEFAULT_SETTINGS: Settings = { size: 64, monoColor: '#000000' }

export const SIZES = [16, 24, 32, 48, 64, 96, 128, 256]

/** What an inserted or dropped mark carries from the UI. */
export interface MarkPayload {
    /** The SVG source, already tinted when mono. */
    svg: string
    name: string
    size: number
}

export type UIMessage =
    | { type: 'insert'; mark: MarkPayload }
    | { type: 'settings'; settings: Settings }
    | { type: 'notify'; message: string; error?: boolean }

export type MainMessage = { type: 'init'; settings: Settings }
