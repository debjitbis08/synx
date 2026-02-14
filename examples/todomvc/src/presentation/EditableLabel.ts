import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { mapMerge } from "@synx/frp/utils/event";
import { not } from "@synx/frp/utils/reactive";
import { targetValue, Ref } from "@synx/dom";
import { div, input, label } from "@synx/dom/tags";
import { defineComponent, Prop } from "@synx/dom/component";

function createEditableLabel(initial: {
  value: string;
  labelClass?: any;
  inputClass?: string;
}) {
  const value = Prop(initial.value);
  const labelClass = Prop<string>(initial.labelClass || "");
  const inputClass = Prop<string>(initial.inputClass || "edit");

  // Refs
  const labelRef = Ref<HTMLLabelElement>();
  const editInputRef = Ref<HTMLInputElement>();

  // Events
  const labelDblClick = labelRef.outputs.dblclick;
  const editKeydown = editInputRef.outputs.keydown;
  const editInput_ = editInputRef.outputs.input;
  const editBlur = editInputRef.outputs.blur;

  const enter = E.filter(editKeydown, (e) => e.key === "Enter");
  const esc = E.filter(editKeydown, (e) => e.key === "Escape");

  // State transitions using mapMerge
  const isCanceling = mapMerge([
    [labelDblClick, false],  // Double-click: not canceling
    [esc, true],             // Escape: canceling
    [enter, false],          // Enter: not canceling
  ], false);

  const isEditing = mapMerge([
    [labelDblClick, true],   // Double-click: start editing
    [esc, false],            // Escape: stop editing
    [enter, false],          // Enter: stop editing
    [editBlur, false],       // Blur: stop editing
  ], false);

  // Track current input value from input events
  const currentInputValue = E.stepper(
    targetValue(editInput_),
    initial.value
  );

  // Side effects using E.effect
  E.effect(E.sample(value.prop, labelDblClick), (propValue) => {
    const inputEl = R.sample(editInputRef.ref);
    if (inputEl) {
      inputEl.value = propValue;
      inputEl.focus();
      setTimeout(() => inputEl.select(), 0);
    }
  });

  E.effect(enter, () => {
    const inputEl = R.sample(editInputRef.ref);
    inputEl?.blur();
  });

  // Commit on Enter or Blur (unless canceling)
  const commitAttempt = E.mergeAll([
    E.map(enter, () => null),
    E.map(editBlur, () => null),
  ]);

  // Filter commits using reactive condition
  const commit = E.whenR(not(isCanceling), commitAttempt);

  // Sample input value when committing and trim
  const edited = E.map(
    E.sample(currentInputValue, commit),
    (val: string) => val.trim()
  );

  // DOM tree
  const el = div(
    {
      class: { "editable-label": true, editing: isEditing },
    },
    label({ class: labelClass.prop, ref: labelRef }, value.prop),
    input({ class: inputClass.prop, ref: editInputRef })
  );

  return {
    el,
    props: { value, labelClass, inputClass },
    outputs: { edited, isEditing },
  };
}

export const EditableLabel = defineComponent(createEditableLabel);
