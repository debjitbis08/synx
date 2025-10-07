
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

    R.subscribe(todo.prop, (todo) => {
        console.log("todo", todo);
    });

    const isCompleted = prop(todo.prop, "completed");

    const el = li(
        { class: { todo: true, completed: isCompleted } },
        div({ class: "view flex justify-between gap-2 items-center p-4 group" },
            input({
                class: "toggle w-[30] h-[30] rounded-[30] appearance-none border border-gray-400 checked:before:content-['✓'] before:text-xl before:pl-[5px] before:text-green-600",
                type: "checkbox",
                checked: prop(todo.prop, "completed"),
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
                prop(todo.prop, "description")
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