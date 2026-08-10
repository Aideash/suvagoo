<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Compartment } from '@codemirror/state'
import { EditorView, basicSetup } from 'codemirror'
import { xml } from '@codemirror/lang-xml'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  cursorChange: [offset: number]
}>()

const container = ref<HTMLElement | null>(null)
const lineWrap = ref(false)
const showEditor = ref(true)
const wrapCompartment = new Compartment()
let view: EditorView | null = null
let applyingExternal = false

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
  view?.destroy()
  view = null
})
</script>

<template>
  <div class="svg-editor" :class="{ 'svg-editor__content-hidden': !showEditor }">
    <div class="svg-editor__toolbar">
      <button
        type="button"
        class="svg-editor__wrap-toggle"
        :class="{ active: lineWrap }"
        :title="lineWrap ? 'Disable line wrap' : 'Enable line wrap'"
        @click="toggleLineWrap"
      >
        <span class="material-icons sm">wrap_text</span>
        <span class="svg-editor__wrap-label">{{ lineWrap ? 'Wrap on' : 'Wrap off' }}</span>
      </button>
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
    flex-shrink: 0;
    padding: $spacing-xs $spacing-sm;
    border-bottom: 1px solid $color-border;

    .svg-editor__preview-toggle {
      margin-left: auto;
    }
  }

  &__wrap-toggle {
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

  &__wrap-label {
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
</style>
