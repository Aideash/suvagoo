<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { numericRangeForAttribute, viewBoxFromContent } from '../lib/attributeSchema'
import {
  ALL_ADDABLE_COMMANDS,
  createDefaultCommand,
  formatCommandLetter,
  formatCommandSummary,
  formatPathD,
  insertCommand,
  lastEndpoint,
  moveCommand,
  parsePathD,
  PATH_COMMAND_META,
  pathIsClosed,
  penBeforeCommand,
  removeCommand,
  toggleRelative,
  updateCommandValueAt,
  type PathCommand,
  type PathCommandType,
} from '../lib/pathAttribute'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'
import AxisControl from './AxisControl.vue'

const props = defineProps<{
  attribute: AttributeContext
  content: string
  focusCommandIndex?: number | null
}>()

const emit = defineEmits<{
  update: [value: string]
  selectCommand: [index: number | null]
}>()

const textDraft = ref(props.attribute.value)
const isEditingText = ref(false)
const selectedIndex = ref<number | null>(null)
const showAddMenu = ref(false)

const viewBox = computed(() => viewBoxFromContent(props.content))

const viewBoxCenter = computed(() => ({
  x: viewBox.value.minX + viewBox.value.width / 2,
  y: viewBox.value.minY + viewBox.value.height / 2,
}))

const parsedCommands = computed(() => {
  if (isEditingText.value) return parsePathD(props.attribute.value)
  return parsePathD(textDraft.value) ?? parsePathD(props.attribute.value)
})

const parseError = computed(() => {
  if (isEditingText.value) return false
  const trimmed = textDraft.value.trim()
  if (!trimmed) return false
  return parsedCommands.value === null
})

const selectedCommand = computed(() => {
  if (selectedIndex.value == null || !parsedCommands.value) return null
  return parsedCommands.value[selectedIndex.value] ?? null
})

function axisLabelForParam(paramLabel: string): string {
  const labels: Record<string, string> = {
    x: 'End X',
    y: 'End Y',
    x1: 'Control X₁',
    y1: 'Control Y₁',
    x2: 'Control X₂',
    y2: 'Control Y₂',
    rx: 'Radius X',
    ry: 'Radius Y',
    rotation: 'Rotation',
    'large-arc': 'Large arc',
    sweep: 'Sweep',
  }
  return labels[paramLabel] ?? paramLabel
}

const paramFields = computed(() => {
  const cmd = selectedCommand.value
  const idx = selectedIndex.value
  if (!cmd || idx == null || cmd.type === 'Z') return []

  const meta = PATH_COMMAND_META[cmd.type]
  const labels = meta.paramLabels ?? []
  const fields: { label: string; valueIndex: number; axis: 'x' | 'y' | 'scalar'; value: number }[] =
    []

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]
    if (label === 'large-arc' || label === 'sweep') {
      fields.push({
        label: axisLabelForParam(label),
        valueIndex: i,
        axis: 'scalar',
        value: cmd.values[i],
      })
    } else if (label === 'rotation') {
      fields.push({
        label: axisLabelForParam(label),
        valueIndex: i,
        axis: 'scalar',
        value: cmd.values[i],
      })
    } else if (label.startsWith('r') && label.length <= 2) {
      fields.push({
        label: axisLabelForParam(label),
        valueIndex: i,
        axis: 'scalar',
        value: cmd.values[i],
      })
    } else if (label === 'x' || label === 'x1' || label === 'x2') {
      fields.push({
        label: axisLabelForParam(label),
        valueIndex: i,
        axis: 'x',
        value: cmd.values[i],
      })
    } else {
      fields.push({
        label: axisLabelForParam(label),
        valueIndex: i,
        axis: 'y',
        value: cmd.values[i],
      })
    }
  }

  return fields
})

function defaultRangeForField(field: { axis: 'x' | 'y' | 'scalar'; value: number }) {
  if (field.axis === 'x') {
    return numericRangeForAttribute('x', viewBox.value, String(field.value))
  }
  if (field.axis === 'y') {
    return numericRangeForAttribute('y', viewBox.value, String(field.value))
  }
  return numericRangeForAttribute('r', viewBox.value, String(field.value))
}

watch(
  () => props.attribute.value,
  (value) => {
    if (!isEditingText.value) textDraft.value = value
  },
)

watch(
  () => attributeIdentity(props.attribute),
  (identity, previous) => {
    if (previous !== undefined && identity === previous) return
    isEditingText.value = false
    textDraft.value = props.attribute.value
    selectedIndex.value = null
    showAddMenu.value = false
    emit('selectCommand', null)
  },
  { immediate: true },
)

watch(
  () => props.focusCommandIndex,
  (index) => {
    if (index !== undefined && index !== selectedIndex.value) {
      selectedIndex.value = index
    }
  },
)

watch(
  parsedCommands,
  (commands) => {
    if (!commands) {
      selectedIndex.value = null
      emit('selectCommand', null)
      return
    }
    if (selectedIndex.value != null && selectedIndex.value >= commands.length) {
      selectedIndex.value = commands.length > 0 ? commands.length - 1 : null
      emit('selectCommand', selectedIndex.value)
    }
  },
  { immediate: true },
)

function commit(value: string) {
  textDraft.value = value
  emit('update', value)
}

function commitCommands(commands: PathCommand[]) {
  commit(formatPathD(commands))
}

function selectCommand(index: number | null) {
  selectedIndex.value = index
  emit('selectCommand', index)
}

function onTextInput(event: Event) {
  isEditingText.value = true
  textDraft.value = (event.target as HTMLInputElement).value
}

function onTextEnter(event: KeyboardEvent) {
  const value = (event.target as HTMLInputElement).value
  isEditingText.value = false
  if (value.trim() === '') {
    commit('')
    return
  }
  const parsed = parsePathD(value)
  commit(parsed ? formatPathD(parsed) : value)
}

function onTextBlur(event: FocusEvent) {
  isEditingText.value = false
  textDraft.value = props.attribute.value
  ;(event.target as HTMLInputElement).value = props.attribute.value
}

function updateFieldValue(valueIndex: number, value: number) {
  const commands = parsedCommands.value
  if (!commands || selectedIndex.value == null) return
  const next = updateCommandValueAt(commands, selectedIndex.value, valueIndex, value)
  commitCommands(next)
}

function toggleSelectedRelative(event: MouseEvent) {
  event.stopPropagation()
  const commands = parsedCommands.value
  if (!commands || selectedIndex.value == null) return
  commitCommands(toggleRelative(commands, selectedIndex.value))
}

function onToggleRelativeChip(index: number, event: MouseEvent) {
  event.stopPropagation()
  const commands = parsedCommands.value
  if (!commands) return
  commitCommands(toggleRelative(commands, index))
}

function addCommand(type: PathCommandType) {
  const commands = parsedCommands.value ?? []
  const last = lastEndpoint(commands)
  const cmd = createDefaultCommand(type, last, viewBoxCenter.value)
  const insertAt = selectedIndex.value != null ? selectedIndex.value + 1 : commands.length
  const next = insertCommand(commands, insertAt, cmd)
  commitCommands(next)
  selectCommand(insertAt)
  showAddMenu.value = false
}

function removeSelectedCommand() {
  const commands = parsedCommands.value
  if (!commands || selectedIndex.value == null) return
  if (selectedIndex.value === 0 && commands[0]?.type === 'M') return
  const index = selectedIndex.value
  const next = removeCommand(commands, index)
  commitCommands(next)
  const newIndex = Math.min(index, next.length - 1)
  selectCommand(newIndex >= 0 ? newIndex : null)
}

function moveSelected(delta: -1 | 1) {
  const commands = parsedCommands.value
  if (!commands || selectedIndex.value == null) return
  const from = selectedIndex.value
  const to = from + delta
  if (to < 0 || to >= commands.length) return
  if (to === 0 && commands[0]?.type === 'M' && from !== 0) return
  commitCommands(moveCommand(commands, from, to))
  selectCommand(to)
}

const canAddZ = computed(() => {
  const commands = parsedCommands.value
  if (!commands || commands.length < 2) return false
  return !pathIsClosed(commands)
})

const addableCommands = computed(() =>
  ALL_ADDABLE_COMMANDS.filter((t) => t !== 'Z' || canAddZ.value),
)

function penLabel(index: number): string {
  const commands = parsedCommands.value
  if (!commands) return ''
  const pen = penBeforeCommand(commands, index)
  return `(${Math.round(pen.x * 10) / 10}, ${Math.round(pen.y * 10) / 10})`
}
</script>

<template>
  <div class="path-adjuster">
    <input
      :value="textDraft"
      type="text"
      class="input path-adjuster__text"
      spellcheck="false"
      aria-label="d attribute value"
      @input="onTextInput"
      @keydown.enter="onTextEnter"
      @blur="onTextBlur"
    />

    <p v-if="parseError" class="path-adjuster__warn">
      Could not parse path — check command letters and numbers.
    </p>

    <template v-else-if="parsedCommands && parsedCommands.length > 0">
      <div class="path-adjuster__commands" role="listbox" aria-label="Path commands">
        <button
          v-for="(cmd, index) in parsedCommands"
          :key="index"
          type="button"
          role="option"
          class="path-adjuster__cmd"
          :class="{ 'path-adjuster__cmd--selected': selectedIndex === index }"
          :aria-selected="selectedIndex === index"
          @click="selectCommand(index)"
        >
          <span class="path-adjuster__cmd-left">
            <span class="path-adjuster__cmd-letter">{{ formatCommandLetter(cmd) }}</span>
            <span class="path-adjuster__cmd-hint">{{ PATH_COMMAND_META[cmd.type].hint }}</span>
            <button
              v-if="cmd.type !== 'Z'"
              type="button"
              class="path-adjuster__rel-badge"
              :title="cmd.relative ? 'Switch to absolute' : 'Switch to relative'"
              @click="onToggleRelativeChip(index, $event)"
            >
              {{ cmd.relative ? 'relative' : 'absolute' }}
            </button>
          </span>
          <span class="path-adjuster__cmd-summary">{{ formatCommandSummary(cmd) }}</span>
        </button>
      </div>

      <div class="path-adjuster__ops">
        <div class="path-adjuster__add-wrap">
          <button
            type="button"
            class="path-adjuster__op-btn"
            title="Add command"
            @click="showAddMenu = !showAddMenu"
          >
            +
          </button>
          <div v-if="showAddMenu" class="path-adjuster__add-menu">
            <button
              v-for="type in addableCommands"
              :key="type"
              type="button"
              class="path-adjuster__add-option"
              @click="addCommand(type)"
            >
              <span class="path-adjuster__add-letter">{{ type }}</span>
              <span class="path-adjuster__add-hint">{{ PATH_COMMAND_META[type].hint }}</span>
            </button>
          </div>
        </div>
        <button
          type="button"
          class="path-adjuster__op-btn"
          title="Remove selected command"
          :disabled="
            selectedIndex == null || (selectedIndex === 0 && parsedCommands[0]?.type === 'M')
          "
          @click="removeSelectedCommand"
        >
          −
        </button>
        <button
          type="button"
          class="path-adjuster__op-btn"
          title="Move command earlier"
          :disabled="
            selectedIndex == null ||
            selectedIndex <= 0 ||
            (selectedIndex === 1 && parsedCommands[0]?.type === 'M')
          "
          @click="moveSelected(-1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="path-adjuster__op-btn"
          title="Move command later"
          :disabled="selectedIndex == null || selectedIndex >= parsedCommands.length - 1"
          @click="moveSelected(1)"
        >
          ↓
        </button>
      </div>

      <template v-if="selectedCommand && selectedCommand.type !== 'Z'">
        <p v-if="selectedCommand.relative" class="path-adjuster__pen-hint">
          Pen at {{ penLabel(selectedIndex!) }} · values are relative to pen
        </p>
        <template v-for="field in paramFields" :key="field.valueIndex">
          <AxisControl
            v-if="field.axis === 'x' || field.axis === 'y'"
            :label="field.label"
            :value="field.value"
            :default-min="defaultRangeForField(field).min"
            :default-max="defaultRangeForField(field).max"
            :default-step="defaultRangeForField(field).step"
            @update="updateFieldValue(field.valueIndex, $event)"
          />
          <div v-else class="path-adjuster__scalar-field">
            <label class="path-adjuster__scalar-label">{{ field.label }}</label>
            <input
              :value="field.value"
              type="number"
              class="input path-adjuster__scalar-input"
              step="any"
              @change="
                updateFieldValue(
                  field.valueIndex,
                  Number(($event.target as HTMLInputElement).value),
                )
              "
            />
            <template v-if="field.label === 'Large arc' || field.label === 'Sweep'">
              <span class="path-adjuster__scalar-note">{{
                field.label === 'Large arc' ? '0 or 1' : '0 or 1'
              }}</span>
            </template>
          </div>
        </template>
        <button type="button" class="path-adjuster__rel-toggle" @click="toggleSelectedRelative">
          Switch to {{ selectedCommand.relative ? 'absolute' : 'relative' }}
        </button>
      </template>
    </template>

    <p v-else-if="!parseError" class="path-adjuster__empty-hint">
      Path is empty — use + to add a Move to (M) command.
    </p>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.path-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__text {
    width: 100%;
    font-family: $font-mono;
    font-size: 0.8125rem;
  }

  &__warn,
  &__empty-hint,
  &__pen-hint {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;
  }

  &__warn {
    color: var(--red);
  }

  &__commands {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }

  &__cmd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-sm;
    width: 100%;
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

    &--selected {
      border-color: $color-accent;
      background: color-mix(in srgb, $color-accent 10%, $color-bg);
    }
  }

  &__cmd-left {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.05rem;
    min-width: 0;
  }

  &__cmd-letter {
    font-family: $font-mono;
    font-size: 0.875rem;
    font-weight: 700;
    color: $color-accent;
    line-height: 1.2;
  }

  &__cmd-hint {
    font-size: 0.625rem;
    color: $color-text-muted;
    line-height: 1.2;
  }

  &__rel-badge {
    margin-top: 0.1rem;
    padding: 0;
    border: none;
    background: none;
    font-size: 0.5625rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: $color-text-muted;
    cursor: pointer;
    opacity: 0.75;

    &:hover {
      color: $color-accent;
      opacity: 1;
    }
  }

  &__cmd-summary {
    flex-shrink: 0;
    font-family: $font-mono;
    font-size: 0.6875rem;
    color: $color-text;
    text-align: right;
    max-width: 55%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__ops {
    display: flex;
    gap: $spacing-xs;
    align-items: flex-start;
  }

  &__add-wrap {
    position: relative;
  }

  &__add-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    min-width: 160px;
    padding: $spacing-xs;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: var(--bg-raised);
    box-shadow: 0 4px 12px color-mix(in srgb, $color-text 12%, transparent);
  }

  &__add-option {
    display: flex;
    align-items: baseline;
    gap: $spacing-xs;
    padding: 0.25rem 0.35rem;
    border: none;
    border-radius: $radius-sm;
    background: none;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: color-mix(in srgb, $color-accent 10%, transparent);
    }
  }

  &__add-letter {
    font-family: $font-mono;
    font-weight: 700;
    font-size: 0.75rem;
    color: $color-accent;
    min-width: 1rem;
  }

  &__add-hint {
    font-size: 0.6875rem;
    color: $color-text-muted;
  }

  &__op-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    color: $color-text;
    font-size: 0.875rem;
    line-height: 1;
    cursor: pointer;
    transition:
      border-color 0.12s,
      color 0.12s;

    &:hover:not(:disabled) {
      border-color: $color-accent;
      color: $color-accent;
    }

    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
  }

  &__scalar-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: $spacing-xs;
    border-top: 1px solid $color-border;
  }

  &__scalar-label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__scalar-input {
    font-family: $font-mono;
    font-size: 0.8125rem;
  }

  &__scalar-note {
    font-size: 0.625rem;
    color: $color-text-muted;
  }

  &__rel-toggle {
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
  }
}
</style>
