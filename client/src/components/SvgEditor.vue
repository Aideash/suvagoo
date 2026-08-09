<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EditorView, basicSetup } from "codemirror";
import { xml } from "@codemirror/lang-xml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  cursorChange: [offset: number];
}>();

const container = ref<HTMLElement | null>(null);
let view: EditorView | null = null;
let applyingExternal = false;

const editorTheme = EditorView.theme({
  "&": { color: "var(--text)", backgroundColor: "var(--bg-input)", height: "100%" },
  ".cm-content": { caretColor: "var(--accent)", padding: "8px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--selection) !important",
  },
});

const highlighting = HighlightStyle.define([
  { tag: [tags.tagName, tags.propertyName], color: "var(--syntax-key)" },
  { tag: tags.attributeName, color: "var(--syntax-argument)" },
  { tag: tags.string, color: "var(--syntax-string)" },
  { tag: [tags.number, tags.integer, tags.float], color: "var(--syntax-number)" },
  {
    tag: [tags.bool, tags.null, tags.atom, tags.keyword],
    color: "var(--syntax-literal)",
  },
  {
    tag: [tags.punctuation, tags.brace, tags.angleBracket, tags.squareBracket],
    color: "var(--syntax-punctuation)",
  },
  { tag: [tags.comment, tags.lineComment], color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: tags.invalid, color: "var(--red)" },
]);

function emitCursor() {
  if (!view) return;
  emit("cursorChange", view.state.selection.main.head);
}

onMounted(() => {
  if (!container.value) return;

  view = new EditorView({
    parent: container.value,
    doc: props.modelValue,
    extensions: [
      basicSetup,
      xml(),
      editorTheme,
      syntaxHighlighting(highlighting),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !applyingExternal) {
          emit("update:modelValue", update.state.doc.toString());
        }
        if (update.selectionSet || update.docChanged) {
          emitCursor();
        }
      }),
    ],
  });
  emitCursor();
});

watch(
  () => props.modelValue,
  (value) => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      applyingExternal = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
      applyingExternal = false;
    }
  }
);

function setCursor(cursor: number) {
  if (!view) return;
  const safeCursor = Math.max(0, Math.min(cursor, view.state.doc.length));
  view.dispatch({
    selection: { anchor: safeCursor },
    scrollIntoView: true,
  });
  emitCursor();
}

function applyChange(newContent: string, cursor: number) {
  if (!view) return;
  applyingExternal = true;
  const safeCursor = Math.max(0, Math.min(cursor, newContent.length));
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: newContent },
    selection: { anchor: safeCursor },
    scrollIntoView: true,
  });
  applyingExternal = false;
  emit("update:modelValue", newContent);
  emitCursor();
}

defineExpose({ applyChange, setCursor });

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});
</script>

<template>
  <div ref="container" class="svg-editor" />
</template>

<style scoped lang="scss">
@use "../styles/variables" as *;

.svg-editor {
  height: 100%;
  overflow: hidden;
  border-radius: $radius-md;
  border: 1px solid $color-border;

  :deep(.cm-editor) {
    height: 100%;
  }

  :deep(.cm-scroller) {
    overflow: auto;
  }
}
</style>
