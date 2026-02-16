/** @jsxImportSource @synx/jsx */
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { mapMerge } from "@synx/frp/utils/event";
import { not } from "@synx/frp/utils/reactive";
import { targetValue, Ref } from "@synx/dom";
import { defineComponent, Prop } from "@synx/dom/component";

function createEditableLabel(initial: {
  value: string;
  labelClass: any;
  inputClass: string;
}) {
  const value = Prop(initial.value);
  const labelClass = Prop<any>(initial.labelClass);
  const inputClass = Prop<string>(initial.inputClass);

  const labelRef = Ref<HTMLLabelElement>();
  const editInputRef = Ref<HTMLInputElement>();

  const labelDblClick = labelRef.outputs.dblclick;
  const editKeydown = editInputRef.outputs.keydown;
  const editInput_ = editInputRef.outputs.input;
  const editBlur = editInputRef.outputs.blur;

  const enter = E.filter(editKeydown, (e) => e.key === "Enter");
  const esc = E.filter(editKeydown, (e) => e.key === "Escape");

  const isCanceling = mapMerge([
    [labelDblClick, false],
    [esc, true],
    [enter, false],
  ], false);

  const isEditing = mapMerge([
    [labelDblClick, true],
    [esc, false],
    [enter, false],
    [editBlur, false],
  ], false);

  const currentInputValue = E.stepper(targetValue(editInput_), initial.value);

  E.effect(E.sample(value.prop, labelDblClick), (propValue) => {
    const inputEl = R.sample(editInputRef.ref);
    if (!inputEl) return;
    inputEl.value = propValue;
    inputEl.focus();
    setTimeout(() => inputEl.select(), 0);
  });

  E.effect(enter, () => {
    const inputEl = R.sample(editInputRef.ref);
    inputEl?.blur();
  });

  const commitAttempt = E.mergeAll([
    E.map(enter, () => null),
    E.map(editBlur, () => null),
  ]);

  const commit = E.whenR(not(isCanceling), commitAttempt);

  const edited = E.map(E.sample(currentInputValue, commit), (val: string) => val.trim());

  const el = (
    <div class={{ "editable-label": true, editing: isEditing }}>
      <label class={labelClass.prop} ref={labelRef}>{value.prop}</label>
      <input class={inputClass.prop} ref={editInputRef} />
    </div>
  );

  return {
    el,
    props: { value, labelClass, inputClass },
    outputs: { edited, isEditing },
  };
}

export const EditableLabel = defineComponent(createEditableLabel);
