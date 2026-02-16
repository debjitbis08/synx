/** @jsxImportSource @synx/jsx */
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { Ref } from "@synx/dom";
import { defineComponent, Prop } from "@synx/dom/component";
import { Todo } from "../domain/Todo";
import { EditableLabel } from "./EditableLabel";

function createTodo(initial: { todo: Todo }) {
  const todo = Prop(initial.todo);

  const todoId = R.map(todo.prop, (value) => value.id);
  const isCompleted = R.map(todo.prop, (value) => value.completed);
  const title = R.map(todo.prop, (value) => value.title);

  const toggleInputRef = Ref<HTMLInputElement>();
  const destroyButtonRef = Ref<HTMLButtonElement>();

  const editableLabel = EditableLabel({
    value: title,
    labelClass: {
      "grow text-2xl transition-colors delay-150 duration-300 ease-in-out": true,
      "line-through": isCompleted,
      "text-gray-500": isCompleted,
    },
    inputClass: "edit",
  });

  const editedTitle = editableLabel.outputs.edited as E.Event<string>;
  const commitTitles = E.map(editedTitle, (value) =>
    value.length > 0 ? value : ""
  );

  const completed = E.map(toggleInputRef.outputs.input, () => R.get(todo.prop).id);
  const deletedByButton = E.map(destroyButtonRef.outputs.click, () => R.get(todo.prop).id);
  const deletedByEmptyEdit = E.map(
    E.filter(commitTitles, (nextTitle) => nextTitle === ""),
    () => R.get(todo.prop).id
  );
  const deleted = E.mergeAll([deletedByButton, deletedByEmptyEdit]);

  const isEditing = editableLabel.outputs.isEditing;

  const edited = E.map(
    E.filter(
      commitTitles,
      (nextTitle): nextTitle is string => !!nextTitle && nextTitle.length > 0
    ),
    (nextTitle) => ({ id: R.get(todo.prop).id, title: nextTitle })
  );

  const el = (
    <li class={{ todo: true, completed: isCompleted, editing: isEditing }} id={todoId}>
      <div class="view flex justify-between gap-2 items-center p-4 group">
        <input
          ref={toggleInputRef}
          class="toggle w-[30] h-[30] rounded-[30] appearance-none border border-gray-400 checked:before:content-['✓'] before:text-xl before:pl-[5px] before:text-green-600"
          type="checkbox"
          checked={isCompleted}
        />
        {editableLabel}
        <button
          ref={destroyButtonRef}
          class="destroy cursor-pointer group-hover:block hidden text-red-600"
          type="button"
        >
          ✖
        </button>
      </div>
    </li>
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
