// The plugin's main thread: it owns the document. The UI (ui.ts) finds the
// marks and sends their SVG here to be placed on the canvas.
import {
    DEFAULT_SETTINGS,
    type MainMessage,
    type MarkPayload,
    type Settings,
    type UIMessage,
} from './messages'

const SETTINGS_KEY = 'settings'

figma.showUI(__html__, { width: 360, height: 560, themeColors: true })

const post = (message: MainMessage) => figma.ui.postMessage(message)

const loadSettings = async (): Promise<Settings> => {
    const saved = (await figma.clientStorage.getAsync(SETTINGS_KEY)) as
        Partial<Settings> | undefined

    return { ...DEFAULT_SETTINGS, ...saved }
}

type Container = BaseNode & ChildrenMixin

const CONTAINER_TYPES = new Set<NodeType>([
    'FRAME',
    'COMPONENT',
    'COMPONENT_SET',
    'SECTION',
])

// A single selected frame, component or section takes the new mark;
// otherwise it goes on the page
const selectedContainer = (): (Container & SceneNode) | undefined => {
    const selection = figma.currentPage.selection
    if (selection.length !== 1) return undefined
    const [node] = selection

    return CONTAINER_TYPES.has(node.type)
        ? (node as Container & SceneNode)
        : undefined
}

const createMark = (mark: MarkPayload): FrameNode => {
    const node = figma.createNodeFromSvg(mark.svg)
    node.name = mark.name
    // Marks are square (a 64 or 24 viewBox); rescale keeps the vectors
    // inside in proportion, which resize would not
    if (node.width > 0) node.rescale(mark.size / node.width)

    return node
}

const finish = (node: SceneNode) => {
    figma.currentPage.selection = [node]
    figma.notify(`Inserted ${node.name}`)
}

const insert = (mark: MarkPayload) => {
    const node = createMark(mark)
    const container = selectedContainer()

    if (container) {
        container.appendChild(node)
        // Auto layout places the child itself; anywhere else, center it
        const auto =
            'layoutMode' in container && container.layoutMode !== 'NONE'
        if (!auto && 'width' in container) {
            node.x = Math.round((container.width - node.width) / 2)
            node.y = Math.round((container.height - node.height) / 2)
        }
    } else {
        const { x, y } = figma.viewport.center
        node.x = Math.round(x - node.width / 2)
        node.y = Math.round(y - node.height / 2)
        figma.currentPage.appendChild(node)
    }

    finish(node)
}

const isMarkPayload = (data: unknown): data is MarkPayload => {
    const mark = data as MarkPayload | undefined

    return (
        typeof mark?.svg === 'string' &&
        typeof mark.name === 'string' &&
        typeof mark.size === 'number'
    )
}

// A tile dragged from the UI onto the canvas. x and y are relative to the
// node it was dropped on (the page, or a frame under the pointer)
figma.on('drop', (event: DropEvent) => {
    const mark = event.dropMetadata
    if (!isMarkPayload(mark)) return true

    const node = createMark(mark)
    const target =
        'appendChild' in event.node
            ? (event.node as Container)
            : figma.currentPage
    target.appendChild(node)
    node.x = Math.round(event.x - node.width / 2)
    node.y = Math.round(event.y - node.height / 2)
    finish(node)

    return false
})

figma.ui.onmessage = async (message: UIMessage) => {
    switch (message.type) {
        case 'insert':
            try {
                insert(message.mark)
            } catch (error) {
                figma.notify(`Couldn't insert the mark: ${String(error)}`, {
                    error: true,
                })
            }
            break
        case 'settings':
            await figma.clientStorage.setAsync(SETTINGS_KEY, message.settings)
            break
        case 'notify':
            figma.notify(message.message, { error: message.error })
            break
    }
}

loadSettings().then((settings) => post({ type: 'init', settings }))
