import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { model, on } from "@synx/dom";
import { li, div, input, label, button } from "@synx/dom/tags";
import { defineComponent, Prop } from "@synx/dom/component";
import { Todo } from "../domain/Todo";

function createTodo(initial: { todo: Todo }) {
  const todo = Prop(initial.todo);

  const todoId = R.map(todo.prop, (value) => value.id);
  const isCompleted = R.map(todo.prop, (value) => value.completed);
  const title = R.map(todo.prop, (value) => value.title);

  const toggleInput = input({
    class: "toggle w-[30] h-[30] rounded-[30] appearance-none border border-gray-400 checked:before:content-['✓'] before:text-xl before:pl-[5px] before:text-green-600",
    type: "checkbox",
    checked: isCompleted,
  });

  const titleLabel = label(
    {
      class: {
        "grow text-2xl transition-colors delay-150 duration-300 ease-in-out": true,
        "line-through": isCompleted,
        "text-gray-500": isCompleted,
      },
    },
    title
  );

  const destroyButton = button(
    {
      class: "destroy cursor-pointer group-hover:block hidden text-red-600",
      type: "button",
    },
    "✖"
  );

  const labelDblClick = on(titleLabel, "dblclick");
  const beginEditing = E.map(labelDblClick, () => true);

  const editInput = input({
    class: "edit",
  });

  const editBlur = on(editInput, "blur");
  const editKeydown = on(editInput, "keydown");

  const enterPressed = E.filter(editKeydown, (event) => event.key === "Enter");
  const escapePressed = E.filter(editKeydown, (event) => event.key === "Escape");

  const ignoreNextBlur = E.stepper(
    E.mergeAll([
      E.map(enterPressed, () => true),
      E.map(escapePressed, () => true),
      E.map(editBlur, () => false),
    ]),
    false
  );

  const blurSave = E.filter(editBlur, () => !R.get(ignoreNextBlur));
  const enterSave = E.map(enterPressed, () => true);
  const cancelEdit = E.map(escapePressed, () => true);

  const blurRequest = E.fold(E.mergeAll([enterPressed, escapePressed]), 0, (count) => count + 1);
  R.effect(blurRequest, (count) => {
    if (count === 0) return;
    editInput.blur();
  });

  const stopEditing = E.mergeAll([
    E.map(enterSave, () => false),
    E.map(blurSave, () => false),
    E.map(cancelEdit, () => false),
  ]);
  const isEditing = E.stepper(
    E.mergeAll([
      beginEditing,
      stopEditing,
    ]),
    false
  );

  R.effect(isEditing, (editing) => {
    if (!editing) return;
      editInput.focus();
      editInput.select();
  });


  const editDraftSeed = E.map(labelDblClick, () => R.get(title));
  const editDraft = E.stepper(
    E.mergeAll([
      editDraftSeed,
      model(editInput),
    ]),
    R.get(title)
  );
  const editValue = R.chain(isEditing, (editing) => (editing ? editDraft : title));
  editInput.value = R.get(editValue);
  R.effect(editValue, (nextValue) => {
    editInput.value = nextValue;
  });

  const completed = E.map(on(toggleInput, "input"), () => R.get(todo.prop).id);
  const deletedByButton = E.map(on(destroyButton, "click"), () => R.get(todo.prop).id);
  const editedTitle = E.map(
    E.mergeAll([enterSave, E.map(blurSave, () => true)]),
    () => R.get(editDraft).trim()
  );
  const deletedByEmptyEdit = E.map(
    E.filter(editedTitle, (nextTitle) => nextTitle.length === 0),
    () => R.get(todo.prop).id
  );
  const edited = E.map(
    E.filter(editedTitle, (nextTitle) => nextTitle.length > 0),
    (nextTitle) => ({ id: R.get(todo.prop).id, title: nextTitle })
  );
  const deleted = E.mergeAll([deletedByButton, deletedByEmptyEdit]);

  const el = li(
    { class: { todo: true, completed: isCompleted, editing: isEditing }, id: todoId },
    div({ class: "view flex justify-between gap-2 items-center p-4 group" }, toggleInput, titleLabel, destroyButton),
    editInput
  );

  return {
    el,
    props: {
      todo,
    },
    outputs: { completed, deleted, edited },
  };
}

export const TodoItem = defineComponent(createTodo);
