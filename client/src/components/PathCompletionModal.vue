<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { numericRangeForAttribute } from '../lib/attributeSchema'
import {
  absoluteEndpoints,
  commandsToAbsolute,
  formatPathD,
  type PathCommand,
} from '../lib/pathAttribute'
import {
  buildCompletion,
  completionTailD,
  maxCompletionSteps,
  type CompletionMode,
  type ConnectorStyle,
} from '../lib/pathCompletion'
import type { ViewBox } from '../lib/svgSchema'
import AxisControl from './AxisControl.vue'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{
  commands: PathCommand[]
  viewBox: ViewBox
}>()

const emit = defineEmits<{
  apply: [commands: PathCommand[]]
  close: []
}>()

const MODES: { value: CompletionMode; label: string; hint: string }[] = [
  { value: 'retrace', label: 'Retrace', hint: 'Walk the path back over itself, like a pen stroke' },
  {
    value: 'reflect',
    label: 'Reflect',
    hint: 'Mirror across the start-to-end line, like half a heart',
  },
  { value: 'copy', label: 'Copy back', hint: 'Repeat rotated half a turn, like half a rectangle' },
]

const CONNECTORS: { value: ConnectorStyle; label: string; hint: string }[] = [
  { value: 'none', label: 'None', hint: 'The two paths meet, with no width between them' },
  { value: 'line', label: 'Line', hint: 'Join the two paths with a straight edge' },
  { value: 'arc', label: 'Arc', hint: 'Join the two paths with a round cap' },
]

const mode = ref<CompletionMode>('retrace')
const connector = ref<ConnectorStyle>('none')
const traceAll = ref(true)
const stepCount = ref(1)
const fieldId = useId()
const width = ref(0)
const flip = ref(false)
const close = ref(true)

const maxSteps = computed(() => maxCompletionSteps(props.commands))

/** A sensible starting width so the first line/arc join is visible. */
const suggestedWidth = computed(
  () => Math.round(Math.min(props.viewBox.width, props.viewBox.height) / 10) || 1,
)

const options = computed(() => ({
  mode: mode.value,
  steps: traceAll.value ? null : stepCount.value,
  width: width.value,
  flip: flip.value,
  connector: connector.value,
  close: close.value,
}))

const result = computed(() => buildCompletion(props.commands, options.value))

const originalD = computed(() => formatPathD(props.commands))
const resultD = computed(() => (result.value ? formatPathD(result.value.commands) : ''))
const tailD = computed(() => (result.value ? completionTailD(result.value) : ''))

const widthRange = computed(() => numericRangeForAttribute('r', props.viewBox, String(width.value)))

const showsWidth = computed(() => connector.value !== 'none')

const noAreaWarning = computed(() => mode.value === 'retrace' && !showsWidth.value)

const partialCloseNote = computed(
  () => close.value && result.value != null && !result.value.tracedWholePath,
)

/** Frame the result without clipping, while keeping the document for context. */
const previewViewBox = computed(() => {
  const box = props.viewBox
  let minX = box.minX
  let minY = box.minY
  let maxX = box.minX + box.width
  let maxY = box.minY + box.height

  if (result.value) {
    const absolute = commandsToAbsolute(result.value.commands)
    const points: { x: number; y: number }[] = []
    for (const point of absoluteEndpoints(absolute)) {
      if (point) points.push(point)
    }
    for (const cmd of absolute) {
      if (cmd.type !== 'C' && cmd.type !== 'S' && cmd.type !== 'Q') continue
      for (let i = 0; i + 1 < cmd.values.length - 2; i += 2) {
        points.push({ x: cmd.values[i], y: cmd.values[i + 1] })
      }
    }
    for (const point of points) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  }

  const pad = Math.max(maxX - minX, maxY - minY, 1) * 0.06
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`
})

function setConnector(next: ConnectorStyle) {
  connector.value = next
  if (next !== 'none' && width.value === 0) width.value = suggestedWidth.value
}

function onApply() {
  if (!result.value) return
  emit('apply', result.value.commands)
}
</script>

<template>
  <ModalDialog title="Complete path" :width="440" @close="emit('close')">
    <div class="path-completion">
      <div class="path-completion__preview">
        <svg
          :viewBox="previewViewBox"
          class="path-completion__canvas"
          role="img"
          aria-label="Preview of the completed path"
        >
          <path v-if="resultD" :d="resultD" class="path-completion__fill" />
          <path :d="originalD" class="path-completion__original" />
          <path v-if="tailD" :d="tailD" class="path-completion__tail" />
        </svg>
      </div>

      <fieldset class="path-completion__group">
        <legend class="path-completion__legend">Completion</legend>
        <div class="path-completion__choices">
          <button
            v-for="option in MODES"
            :key="option.value"
            type="button"
            class="path-completion__choice"
            :class="{ 'path-completion__choice--active': mode === option.value }"
            :aria-pressed="mode === option.value"
            @click="mode = option.value"
          >
            <span class="path-completion__choice-label">{{ option.label }}</span>
            <span class="path-completion__choice-hint">{{ option.hint }}</span>
          </button>
        </div>
      </fieldset>

      <fieldset class="path-completion__group">
        <legend class="path-completion__legend">Trace back</legend>
        <div class="path-completion__row">
          <label class="path-completion__check" :for="`${fieldId}-trace-all`">
            <input :id="`${fieldId}-trace-all`" v-model="traceAll" type="checkbox" />
            <span>All {{ maxSteps }} commands</span>
          </label>
          <label v-if="!traceAll" class="path-completion__steps" :for="`${fieldId}-steps`">
            <span>Steps</span>
            <input
              :id="`${fieldId}-steps`"
              v-model.number="stepCount"
              type="number"
              class="input path-completion__number"
              min="1"
              :max="maxSteps"
              step="1"
            />
          </label>
        </div>
      </fieldset>

      <fieldset class="path-completion__group">
        <legend class="path-completion__legend">Join</legend>
        <div class="path-completion__choices">
          <button
            v-for="option in CONNECTORS"
            :key="option.value"
            type="button"
            class="path-completion__choice"
            :class="{ 'path-completion__choice--active': connector === option.value }"
            :aria-pressed="connector === option.value"
            @click="setConnector(option.value)"
          >
            <span class="path-completion__choice-label">{{ option.label }}</span>
            <span class="path-completion__choice-hint">{{ option.hint }}</span>
          </button>
        </div>
      </fieldset>

      <fieldset v-if="showsWidth" class="path-completion__group">
        <legend class="path-completion__legend">Width</legend>
        <AxisControl
          :value="width"
          :default-min="widthRange.min"
          :default-max="widthRange.max"
          :default-step="widthRange.step"
          @update="width = $event"
        />
        <button
          type="button"
          class="path-completion__flip"
          :aria-pressed="flip"
          @click="flip = !flip"
        >
          Flip to the other side
        </button>
      </fieldset>

      <label class="path-completion__check" :for="`${fieldId}-close`">
        <input :id="`${fieldId}-close`" v-model="close" type="checkbox" />
        <span>Close the shape</span>
      </label>

      <p v-if="noAreaWarning" class="path-completion__note">
        Retracing with no width doubles back over the original, so the result encloses no area. Pick
        a line or arc join to give it width.
      </p>
      <p v-if="partialCloseNote" class="path-completion__note">
        A partial trace closes with the join rather than a Z, since Z would run back to the very
        start of the path.
      </p>
      <p v-if="!result" class="path-completion__warn">This path cannot be completed.</p>

      <output v-if="resultD" class="path-completion__result">{{ resultD }}</output>
    </div>

    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn--primary" :disabled="!result" @click="onApply">
        Apply
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.path-completion {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;

  &__preview {
    display: flex;
    justify-content: center;
    padding: $spacing-sm;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
  }

  &__canvas {
    width: 100%;
    height: 150px;
  }

  &__fill {
    fill: color-mix(in srgb, $color-accent 18%, transparent);
    stroke: none;
  }

  &__original,
  &__tail {
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  &__original {
    stroke: $color-text-muted;
  }

  &__tail {
    stroke: $color-accent;
  }

  &__group {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
    margin: 0;
    padding: 0;
    border: none;
  }

  &__legend {
    padding: 0;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__choices {
    display: flex;
    gap: $spacing-xs;
  }

  &__choice {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 0.35rem 0.5rem;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.12s,
      background 0.12s;

    &:hover {
      border-color: $color-accent;
    }

    &--active {
      border-color: $color-accent;
      background: color-mix(in srgb, $color-accent 10%, $color-bg);
    }
  }

  &__choice-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: $color-text;
  }

  &__choice-hint {
    font-size: 0.625rem;
    line-height: 1.3;
    color: $color-text-muted;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-sm;
  }

  &__check,
  &__steps {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    font-size: 0.8125rem;
    color: $color-text;
    cursor: pointer;
  }

  &__steps {
    color: $color-text-muted;
  }

  &__number {
    width: 4.5rem;
    padding: 0.15rem $spacing-xs;
    font-family: $font-mono;
    font-size: 0.8125rem;
  }

  &__flip {
    align-self: flex-start;
    padding: 0.15rem 0.4rem;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: none;
    font-size: 0.6875rem;
    color: $color-text-muted;
    cursor: pointer;

    &:hover {
      border-color: $color-accent;
      color: $color-accent;
    }

    &[aria-pressed='true'] {
      border-color: $color-accent;
      color: $color-accent;
    }
  }

  &__note,
  &__warn {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.4;
    color: $color-text-muted;
  }

  &__warn {
    color: var(--red);
  }

  &__result {
    display: block;
    max-height: 5rem;
    overflow-y: auto;
    padding: $spacing-xs;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    font-family: $font-mono;
    font-size: 0.6875rem;
    line-height: 1.4;
    color: $color-text-muted;
    overflow-wrap: anywhere;
  }
}
</style>
