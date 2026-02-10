import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { on } from "@synx/dom";
import { div, input, label } from "@synx/dom/tags";
import { defineComponent, Prop } from "@synx/dom/component";

function createEditableLabel(initial: {
  value: string;
  labelClass?: any;
  inputClass?: string;
}) {
  const value = Prop(initial.value);

  const labelEl = label({ class: initial.labelClass || "" }, value.prop);
  const editInput = input({ class: initial.inputClass || "edit" });

  const labelDblClick = on(labelEl, "dblclick");
  const editKeydown = on(editInput, "keydown");
  const editBlur = on(editInput, "blur");

  const enter = E.filter(editKeydown, (e) => e.key === "Enter");
  const esc = E.filter(editKeydown, (e) => e.key === "Escape");

  const isCanceling = E.fold(
    E.mergeAll([
      E.map(labelDblClick, () => false),
      E.map(esc, () => true),
      E.map(enter, () => false),
    ]),
    false,
    (_, flag) => flag
  );

  const isEditing = E.fold(
    E.mergeAll([
      E.map(labelDblClick, () => true),
      E.map(esc, () => false),
      E.map(enter, () => false),
      E.map(editBlur, () => false),
    ]),
    false,
    (_, editing) => editing
  );

  // Show/hide based on editing state
  R.effect(isEditing, (editing) => {
    labelEl.hidden = editing;
    editInput.hidden = !editing;
  });

  // Enter edit mode: set value, focus, and select text
  R.effect(isEditing, (editing) => {
    if (editing) {
      editInput.value = R.get(value.prop);
      editInput.focus();
      setTimeout(() => editInput.select(), 0);
    }
  });

  // Blur on Enter
  R.effect(E.fold(enter, 0, (c) => c + 1), (count) => {
    if (count > 0) editInput.blur();
  });

  // Commit on Enter or Blur (unless canceling)
  const commit = E.filter(
    E.mergeAll([E.map(enter, () => null), E.map(editBlur, () => null)]),
    () => !R.get(isCanceling)
  );

  const edited = E.map(commit, () => editInput.value.trim());

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
