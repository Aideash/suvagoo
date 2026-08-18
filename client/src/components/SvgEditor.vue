<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Compartment } from '@codemirror/state'
import { EditorView, basicSetup } from 'codemirror'
import { xml } from '@codemirror/lang-xml'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import PopMenu from './PopMenu.vue'
import { copyText } from '../lib/clipboard'
import { cursorOffsetForPath, findElementAtOffset } from '../lib/svgDocument'
import { buildSvgCopy, type SvgCopyFormat } from '../lib/svgCopy'
import { formatSvgSource, type SvgFormatLayout } from '../lib/svgFormat'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  cursorChange: [offset: number]
  formatError: [message: string]
  copyError: [message: string]
}>()

const COPY_OPTIONS: { format: SvgCopyFormat; name: string; hint: string }[] = [
  { format: 'pretty', name: 'Pretty', hint: 'Indented, one attribute per line' },
  { format: 'compact', name: 'Compact', hint: 'Indented, one element per line' },
  { format: 'single', name: 'Single line', hint: 'The whole document, no newlines' },
  {
    format: 'dataUri',
    name: 'CSS data URI',
    hint: 'Encoded for url(); comments omitted',
  },
]

const COPIED_FEEDBACK_MS = 1600

const container = ref<HTMLElement | null>(null)
const lineWrap = ref(false)
const showEditor = ref(true)
/** Only lights up the button that was last used; formatting is never automatic. */
const lastLayout = ref<SvgFormatLayout | null>(null)
const copied = ref(false)
const wrapCompartment = new Compartment()
let view: EditorView | null = null
let applyingExternal = false
let copiedTimer: ReturnType<typeof setTimeout> | undefined

const editorTheme = EditorView.theme({
  '&': { color: 'var(--text)', backgroundColor: 'var(--bg-input)', height: '100%' },
  '.cm-content': { caretColor: 'var(--accent)', padding: '8px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection) !important',
  },
})

const highlighting = HighlightStyle.define([
  { tag: [tags.tagName, tags.propertyName], color: 'var(--syntax-key)' },
  { tag: tags.attributeName, color: 'var(--syntax-argument)' },
  { tag: tags.string, color: 'var(--syntax-string)' },
  { tag: [tags.number, tags.integer, tags.float], color: 'var(--syntax-number)' },
  {
    tag: [tags.bool, tags.null, tags.atom, tags.keyword],
    color: 'var(--syntax-literal)',
  },
  {
    tag: [tags.punctuation, tags.brace, tags.angleBracket, tags.squareBracket],
    color: 'var(--syntax-punctuation)',
  },
  { tag: [tags.comment, tags.lineComment], color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: tags.invalid, color: 'var(--red)' },
])

function toggleLineWrap() {
  if (!view) return
  lineWrap.value = !lineWrap.value
  view.dispatch({
    effects: wrapCompartment.reconfigure(lineWrap.value ? EditorView.lineWrapping : []),
  })
}

/**
 * Re-applying the active layout is a deliberate feature: it reflows the
 * document after hand edits without making the user switch layouts.
 */
function applyFormat(layout: SvgFormatLayout) {
  if (!view) return

  const current = view.state.doc.toString()
  const formatted = formatSvgSource(current, layout)
  if (formatted == null) {
    emit('formatError', 'Could not format the document. Check for unclosed or mismatched tags.')
    return
  }

  lastLayout.value = layout
  if (formatted === current) return

  const head = view.state.selection.main.head
  const path = findElementAtOffset(current, head)?.path
  const cursor = (path ? cursorOffsetForPath(formatted, path) : null) ?? head
  applyChange(formatted, cursor)
}

/** Copies a rendering of the document; the document itself is left alone. */
async function copy(format: SvgCopyFormat) {
  const source = view?.state.doc.toString() ?? props.modelValue
  const text = buildSvgCopy(source, format)
  if (text == null) {
    emit('copyError', 'Could not copy the document. Check for unclosed or mismatched tags.')
    return
  }

  try {
    await copyText(text)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = false), COPIED_FEEDBACK_MS)
  } catch (caught) {
    emit('copyError', `Copy failed: ${caught instanceof Error ? caught.message : String(caught)}`)
  }
}

function emitCursor() {
  if (!view) return
  emit('cursorChange', view.state.selection.main.head)
}

onMounted(() => {
  if (!container.value) return

  view = new EditorView({
    parent: container.value,
    doc: props.modelValue,
    extensions: [
      basicSetup,
      xml(),
      editorTheme,
      syntaxHighlighting(highlighting),
      wrapCompartment.of([]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !applyingExternal) {
          emit('update:modelValue', update.state.doc.toString())
        }
        if (update.selectionSet || update.docChanged) {
          emitCursor()
        }
      }),
    ],
  })
  emitCursor()
})

watch(
  () => props.modelValue,
  (value) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (value !== current) {
      applyingExternal = true
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
      applyingExternal = false
    }
  },
)

function setCursor(cursor: number) {
  if (!view) return
  const safeCursor = Math.max(0, Math.min(cursor, view.state.doc.length))
  view.dispatch({
    selection: { anchor: safeCursor },
    scrollIntoView: true,
  })
  emitCursor()
}

function applyChange(newContent: string, cursor: number) {
  if (!view) return
  applyingExternal = true
  const safeCursor = Math.max(0, Math.min(cursor, newContent.length))
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: newContent },
    selection: { anchor: safeCursor },
    scrollIntoView: true,
  })
  applyingExternal = false
  emit('update:modelValue', newContent)
  emitCursor()
}

defineExpose({ applyChange, setCursor })

onBeforeUnmount(() => {
  clearTimeout(copiedTimer)
  view?.destroy()
  view = null
})
</script>

<template>
  <div class="svg-editor" :class="{ 'svg-editor__content-hidden': !showEditor }">
    <div class="svg-editor__toolbar">
      <button
        type="button"
        class="svg-editor__tool"
        :class="{ active: lineWrap }"
        :title="lineWrap ? 'Disable line wrap' : 'Enable line wrap'"
        @click="toggleLineWrap"
      >
        <span class="material-icons sm">wrap_text</span>
        <span class="svg-editor__tool-label">{{ lineWrap ? 'Wrap on' : 'Wrap off' }}</span>
      </button>
      <span class="svg-editor__divider" />
      <button
        type="button"
        class="svg-editor__tool"
        :class="{ active: lastLayout === 'pretty' }"
        title="Format: one attribute per line, long values split"
        @click="applyFormat('pretty')"
      >
        <span class="material-icons sm">unfold_more</span>
        <span class="svg-editor__tool-label">Pretty</span>
      </button>
      <button
        type="button"
        class="svg-editor__tool"
        :class="{ active: lastLayout === 'compact' }"
        title="Format: one element per line"
        @click="applyFormat('compact')"
      >
        <span class="material-icons sm">unfold_less</span>
        <span class="svg-editor__tool-label">Compact</span>
      </button>
      <span class="svg-editor__divider" />
      <span class="svg-editor__copy">
        <PopMenu
          :icon="copied ? 'check' : 'content_copy'"
          :label="copied ? 'Copied' : 'Copy SVG'"
          title="Copy the document to the clipboard"
          :width="300"
          align="right"
        >
          <template #default="{ close }">
            <button
              v-for="option in COPY_OPTIONS"
              :key="option.format"
              type="button"
              class="copy-option"
              :title="`${option.name} — ${option.hint}`"
              @click="(copy(option.format), close())"
            >
              <span class="copy-option__name">{{ option.name }}</span>
              <span class="copy-option__hint">{{ option.hint }}</span>
            </button>
          </template>
        </PopMenu>
      </span>
      <span class="svg-editor__divider" />
      <button
        type="button"
        class="ghost svg-editor__preview-toggle"
        :title="showEditor ? 'Switch to editor mode' : 'Switch to preview mode'"
        @click="showEditor = !showEditor"
      >
        <span class="material-icons sm">{{ showEditor ? 'expand_less' : 'expand_more' }}</span>
      </button>
    </div>
    <div ref="container" class="svg-editor__content" />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.svg-editor {
  display: grid;
  grid-template-rows: min-content 1fr;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-radius: $radius-md;
  border: 1px solid $color-border;
  background: $color-surface;
  transition: grid-template-rows 0.3s ease-in-out;

  &__toolbar {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    flex-shrink: 0;
    padding: $spacing-xs $spacing-sm;
    border-bottom: 1px solid $color-border;

    .svg-editor__copy {
      margin-left: auto;
    }
  }

  &__divider {
    width: 1px;
    height: 16px;
    background: $color-border;
  }

  /* The menu trigger is a shared ghost button; this sizes it like a tool. */
  &__copy :deep(button) {
    padding: 2px $spacing-sm;
    font-size: 0.75rem;
    font-weight: 500;
  }

  &__tool {
    display: inline-flex;
    align-items: center;
    gap: $spacing-xs;
    padding: 2px $spacing-sm;
    border: 1px solid transparent;
    border-radius: $radius-sm;
    background: transparent;
    color: $color-text-muted;
    font-size: 0.75rem;
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s,
      border-color 0.12s;

    &:hover {
      background: $color-surface-hover;
      color: $color-text;
    }

    &.active {
      color: $color-accent;
      border-color: color-mix(in srgb, var(--accent) 35%, transparent);
      background: color-mix(in srgb, var(--accent) 8%, transparent);
    }
  }

  &__tool-label {
    font-weight: 500;
  }

  &__content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  &__content :deep(.cm-editor) {
    height: 100%;
  }

  &__content :deep(.cm-scroller) {
    overflow: auto;
  }

  &__content-hidden {
    grid-template-rows: min-content 0fr;
    overflow: hidden;
  }
}

/* Teleported into the pop menu, so it sits outside .svg-editor. */
.copy-option {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  padding: 6px 8px;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius);

  &:hover {
    background: $color-surface-hover;
  }

  &__name {
    font-size: 0.8125rem;
    color: $color-text;
  }

  &__hint {
    font-size: 0.6875rem;
    color: var(--text-faint);
  }
}
</style>
