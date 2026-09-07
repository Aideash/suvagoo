<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { css } from '@codemirror/lang-css'
import { EditorView, basicSetup } from 'codemirror'
import type { IndexedDocumentNode } from '../lib/svgDocument'
import {
  addCssDeclaration,
  addCssRule,
  deleteCssDeclaration,
  parseCssStylesheet,
  replaceCssRange,
  toggleCssDeclaration,
  type CssDeclaration,
  type CssRule,
} from '../lib/svgCss'

const props = defineProps<{
  node: IndexedDocumentNode
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const draft = ref(props.node.text ?? '')
const rawMode = ref(false)
const rawHost = ref<HTMLElement | null>(null)
const model = computed(() => parseCssStylesheet(draft.value))
let rawView: EditorView | null = null
let applyingExternal = false

const rawTheme = EditorView.theme({
  '&': {
    color: 'var(--text)',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    minHeight: '9rem',
  },
  '.cm-content': { caretColor: 'var(--accent)', padding: '6px 0' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)' },
})

function apply(next: string) {
  if (next === draft.value) return
  draft.value = next
  emit('update', next)
}

function updateRawEditor(value: string) {
  if (!rawView) return
  const current = rawView.state.doc.toString()
  if (current === value) return
  applyingExternal = true
  rawView.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  applyingExternal = false
}

watch(
  () => props.node.text,
  (text) => {
    const next = text ?? ''
    draft.value = next
    updateRawEditor(next)
  },
)

watch(rawMode, (enabled) => {
  if (enabled) nextTick(() => rawView?.focus())
})

onMounted(() => {
  if (!rawHost.value) return
  rawView = new EditorView({
    parent: rawHost.value,
    doc: draft.value,
    extensions: [
      basicSetup,
      css(),
      rawTheme,
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !applyingExternal) apply(update.state.doc.toString())
      }),
    ],
  })
})

onBeforeUnmount(() => {
  rawView?.destroy()
  rawView = null
})

function updateHeader(rule: CssRule, event: Event) {
  const value = (event.target as HTMLInputElement).value.trim()
  if (value) apply(replaceCssRange(draft.value, rule.headerFrom, rule.headerTo, value))
}

function updateDeclaration(declaration: CssDeclaration, field: 'name' | 'value', event: Event) {
  const value = (event.target as HTMLInputElement).value.trim()
  if (!value) return
  if (declaration.disabled) {
    const name = field === 'name' ? value : declaration.name
    const declarationValue = field === 'value' ? value : declaration.value
    apply(
      replaceCssRange(
        draft.value,
        declaration.from,
        declaration.to,
        `/* ${name}: ${declarationValue}; */`,
      ),
    )
    return
  }
  const from = field === 'name' ? declaration.nameFrom : declaration.valueFrom
  const to = field === 'name' ? declaration.nameTo : declaration.valueTo
  apply(replaceCssRange(draft.value, from, to, value))
}

function removeRule(rule: CssRule) {
  apply(replaceCssRange(draft.value, rule.from, rule.to, ''))
}
</script>

<template>
  <section class="style-adjuster" aria-labelledby="style-adjuster-heading">
    <div class="style-adjuster__header">
      <h3 id="style-adjuster-heading" class="style-adjuster__heading">Stylesheet</h3>
      <button
        type="button"
        class="ghost style-adjuster__mode"
        :class="{ active: rawMode }"
        :aria-pressed="rawMode"
        @click="rawMode = !rawMode"
      >
        {{ rawMode ? 'Rules' : 'Raw CSS' }}
      </button>
    </div>

    <p v-if="model.hasSyntaxErrors && !rawMode" class="style-adjuster__warning">
      Some CSS could not be structured. Use Raw CSS to edit it without losing source text.
    </p>

    <div v-show="rawMode" ref="rawHost" class="style-adjuster__raw" />

    <template v-if="!rawMode">
      <div v-if="model.rules.length" class="style-adjuster__rules">
        <article
          v-for="(rule, ruleIndex) in model.rules"
          :key="`${rule.from}:${rule.to}:${ruleIndex}`"
          class="style-rule"
          :style="{ marginLeft: `${rule.depth * 10}px` }"
        >
          <div class="style-rule__header">
            <input
              class="style-rule__selector"
              :value="rule.header"
              aria-label="CSS selector or at-rule"
              @change="updateHeader(rule, $event)"
            />
            <span aria-hidden="true">{</span>
            <button
              type="button"
              class="ghost style-rule__delete"
              title="Delete rule"
              aria-label="Delete CSS rule"
              @click="removeRule(rule)"
            >
              <span class="material-icons sm" aria-hidden="true">close</span>
            </button>
          </div>

          <div class="style-rule__declarations">
            <div
              v-for="(declaration, declarationIndex) in rule.declarations"
              :key="`${declaration.from}:${declarationIndex}`"
              class="style-declaration"
              :class="{ 'style-declaration--disabled': declaration.disabled }"
            >
              <input
                type="checkbox"
                :checked="!declaration.disabled"
                aria-label="Enable declaration"
                @change="apply(toggleCssDeclaration(draft, declaration))"
              />
              <input
                class="style-declaration__name"
                :value="declaration.name"
                aria-label="CSS property"
                @change="updateDeclaration(declaration, 'name', $event)"
              />
              <span aria-hidden="true">:</span>
              <input
                class="style-declaration__value"
                :value="declaration.value"
                aria-label="CSS value"
                @change="updateDeclaration(declaration, 'value', $event)"
              />
              <span aria-hidden="true">;</span>
              <button
                type="button"
                class="ghost style-declaration__delete"
                title="Delete declaration"
                aria-label="Delete CSS declaration"
                @click="apply(deleteCssDeclaration(draft, declaration))"
              >
                <span class="material-icons sm" aria-hidden="true">close</span>
              </button>
            </div>
            <button
              v-if="rule.canDeclare"
              type="button"
              class="style-rule__add"
              @click="apply(addCssDeclaration(draft, rule))"
            >
              + property
            </button>
          </div>
          <div class="style-rule__close" aria-hidden="true">}</div>
        </article>
      </div>
      <p v-else class="style-adjuster__empty">No structured rules yet.</p>
      <button type="button" class="style-adjuster__add-rule" @click="apply(addCssRule(draft))">
        <span class="material-icons sm" aria-hidden="true">add</span>
        Add rule
      </button>
    </template>
  </section>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.style-adjuster {
  padding-top: $spacing-sm;
  border-top: 1px solid $color-border;

  &__header,
  .style-rule__header,
  .style-declaration {
    display: flex;
    align-items: center;
  }

  &__header {
    justify-content: space-between;
    margin-bottom: $spacing-xs;
  }

  &__heading {
    margin: 0;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__mode {
    padding: 2px 5px;
    font-size: 0.6875rem;
  }

  &__warning,
  &__empty {
    margin: $spacing-xs 0;
    color: $color-text-muted;
    font-size: 0.6875rem;
  }

  &__warning {
    color: var(--amber);
  }

  &__rules {
    display: grid;
    gap: $spacing-xs;
  }

  &__raw {
    :deep(.cm-editor) {
      min-height: 9rem;
      font-size: 0.75rem;
    }
  }

  &__add-rule,
  .style-rule__add {
    border: 0;
    background: transparent;
    color: $color-text-muted;
    cursor: pointer;
    font-size: 0.6875rem;

    &:hover {
      color: $color-accent;
    }
  }

  &__add-rule {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-top: $spacing-sm;
  }
}

.style-rule {
  padding: $spacing-xs;
  border-left: 2px solid $color-border;
  background: color-mix(in srgb, var(--bg-input) 65%, transparent);
  font-family: $font-mono;
  font-size: 0.75rem;

  &__header {
    gap: 4px;
    color: $color-text;
  }

  &__selector,
  .style-declaration input[type='text'],
  .style-declaration__name,
  .style-declaration__value {
    min-width: 0;
    padding: 1px 2px;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    font: inherit;

    &:focus {
      outline: none;
      border-color: $color-accent;
      background: $color-surface;
    }
  }

  &__selector {
    flex: 1;
    color: var(--syntax-key);
    font-weight: 600;
  }

  &__delete,
  .style-declaration__delete {
    margin-left: auto;
    padding: 0;
    opacity: 0;
  }

  &:hover > &__header > &__delete,
  .style-declaration:hover > .style-declaration__delete {
    opacity: 1;
  }

  &__declarations {
    padding: 2px 0 2px $spacing-sm;
  }

  &__close {
    color: var(--syntax-punctuation);
  }
}

.style-declaration {
  gap: 3px;
  min-height: 22px;

  input[type='checkbox'] {
    width: 12px;
    height: 12px;
    margin: 0 2px 0 0;
  }

  &__name {
    width: 38%;
    color: var(--syntax-argument) !important;
  }

  &__value {
    flex: 1;
    color: var(--syntax-string) !important;
  }

  &--disabled {
    opacity: 0.55;

    input:not([type='checkbox']) {
      text-decoration: line-through;
    }
  }
}
</style>
