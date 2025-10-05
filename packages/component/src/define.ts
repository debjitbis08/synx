import { effect, get, isReactive, Reactive } from "@synx/frp/reactive";

export function defineComponent<
    InitialProps extends Record<string, unknown>,
    T extends {
        el: HTMLElement;
        props: Propify<InitialProps>;
        outputs: any;
    },
>(
    create: (initialProps: InitialProps) => T,
): (
    props: {
        ref?: RefObject<T>;
    } & {
        [K in keyof InitialProps]: InitialProps[K] | Reactive<InitialProps[K]>;
    },
) => T & { cleanup: () => void } {
    return (props) => {
        const { ref, ...rest } = props ?? {};

        const instance = create(
            Object.fromEntries(
                Object.entries(rest).map(([k, v]) => [
                    k,
                    isReactive(v) ? get(v) : v,
                ]),
            ) as InitialProps,
        );

        if (ref) ref.set(instance);

        const unsubscribers: (() => void)[] = [];

        for (const [key, value] of Object.entries(rest)) {
            const target = instance.props[key];
            if (target && typeof target === "object" && "emit" in target) {
                if (isReactive(value)) {
                    unsubscribers.push(effect(value, target.emit));
                } else {
                    target.emit(value);
                }
            }
        }

        return {
            ...instance,
            cleanup: () => {
                for (const unsub of unsubscribers) unsub();
            },
        };
    };
}
