import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { mapMerge } from "@synx/frp/utils/event";
import { not } from "@synx/frp/utils/reactive";
import { on, targetValue } from "@synx/dom";
import { div, input, label } from "@synx/dom/tags";
import { defineComponent, Prop } from "@synx/dom/component";

function createEditableLabel(initial: {
  value: string;
  labelClass?: any;
  inputClass?: string;
}) {
  const value = Prop(initial.value);

  const labelEl = label({ class: initial.labelClass || "" }, value.prop);
  const labelDblClick = on(labelEl, "dblclick");

  // Input element - uncontrolled (browser manages value while editing)
  const editInput = input({ class: initial.inputClass || "edit" });

  const editKeydown = on(editInput, "keydown");
  const editInput_ = on(editInput, "input");
  const editBlur = on(editInput, "blur");

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

  // Side effects using E.effect (clean and simple!)
  E.effect(E.sample(value.prop, labelDblClick), (propValue) => {
    editInput.value = propValue;
    editInput.focus();
    setTimeout(() => editInput.select(), 0);
  });

  E.effect(enter, () => {
    editInput.blur();
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

  // Wrap label and input in a container
  const el = div(
    {
      class: { "editable-label": true, editing: isEditing },
    },
    labelEl,
    editInput
  );

  return {
    el,
    props: { value },
    outputs: { edited, isEditing },
  };
}

export const EditableLabel = defineComponent(createEditableLabel);
