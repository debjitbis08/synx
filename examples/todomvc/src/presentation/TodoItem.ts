import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { li, div, input, label, button } from "@synx/dom/tags";
import { defineComponent, Prop } from "@synx/dom/component";
import { Todo } from "../domain/Todo";

function createTodo(initial: { todo: Todo }) {
    const todo = Prop(initial.todo);

    const [toggleEv, emitToggle] = E.create<Event>();
    const [deleteEv, emitDelete] = E.create<MouseEvent>();

    const completed = E.map(
        E.map(toggleEv, () => R.get(todo.prop)),
        (todo) => todo.id
    );

    const deleted = E.map(
        E.map(deleteEv, () => R.get(todo.prop)),
        (todo) => todo.id
    );

    const todoId = R.map(todo.prop, (value) => value.id);
    const isCompleted = R.map(todo.prop, (value) => value.completed);
    const title = R.map(todo.prop, (value) => value.title);

    const el = li(
        { class: { todo: true, completed: isCompleted }, id: todoId },
        div({ class: "view flex justify-between gap-2 items-center p-4 group" },
            input({
                class: "toggle w-[30] h-[30] rounded-[30] appearance-none border border-gray-400 checked:before:content-['✓'] before:text-xl before:pl-[5px] before:text-green-600",
                type: "checkbox",
                checked: isCompleted,
                on: { input: emitToggle }
            }),
            label(
                {
                    class: {
                        "grow text-2xl transition-colors delay-150 duration-300 ease-in-out": true,
                        "line-through": isCompleted,
                        "text-gray-500": isCompleted,
                    }
                },
                title
            ),
            button(
                {
                    class: "destroy cursor-pointer group-hover:block hidden text-red-600",
                    type: "button",
                    on: { click: emitDelete }
                },
                "✖",

            )
        ),
    )

    return {
        el,
        props: {
            todo,
        },
        outputs: { completed, deleted },
    };
}

export const TodoItem = defineComponent(createTodo);
